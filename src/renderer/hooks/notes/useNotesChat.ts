import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmbeddingsSearchRow } from '@/bridges/auth/auth-bridge'
import type { CandidateSource, Mode } from '@/lib/ai/chat-retrieval-pipeline'
import {
  classifyQueryComplexity,
  expandSeedConnections,
  getModeConfig,
  shouldBlendGlobalFallback
} from '@/lib/ai/chat-retrieval-pipeline'
import { getEmbeddingsApi } from '@/bridges/ai/embeddings-bridge'
import { getOllamaApi } from '@/bridges/ai/ollama-bridge'
import { getApi } from '@/bridges/auth/auth-bridge'
import { getChatHistoryApi } from '@/bridges/chat/chat-history-bridge'
import { createElectronLogger } from '@/lib/core/electron-log'
import type { WorkspaceLinkMentionIndex } from '@/lib/notes/cache/notes-cache-types'
import type { SavedNote, Folder } from '@/lib/notes/notes-storage'

const LOG = '[useNotesChat]'
const log = createElectronLogger(LOG)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatSource = {
  note: string
  title: string
  folder: string
  chunkText: string
  score?: number
  source?: CandidateSource
}

export type ChatPipelineStage =
  | 'analyzing'
  | 'searching'
  | 'seed-results'
  | 'expanding'
  | 'connected-results'
  | 'reranking'
  | 'context-ready'

export type ChatPipelineNote = {
  note: string
  title: string
  source: 'seed' | 'connected' | 'global_fallback'
}

export type ChatPipelineStatus = {
  stage: ChatPipelineStage
  mode: Mode
  suggestedMode: Mode
  seedNotes: ChatPipelineNote[]
  connectedNotes: ChatPipelineNote[]
  finalNotes: ChatPipelineNote[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  pipelineStatus?: ChatPipelineStatus
  timestamp: number
}

export type ChatSession = {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

export type ChatHistoryMeta = {
  sessionId: string
  title: string
  createdAt: number
  messageCount: number
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function newSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptySession(): ChatSession {
  return { id: newSessionId(), title: 'New chat', createdAt: Date.now(), messages: [] }
}

const currentSessionCache = {
  session: null as ChatSession | null
}

async function saveCurrentSession(s: ChatSession): Promise<{ ok: boolean; error?: string }> {
  currentSessionCache.session = s
  const chatHistoryApi = getChatHistoryApi()
  if (!chatHistoryApi) return { ok: false, error: 'API unavailable' }
  const res = await chatHistoryApi.write({
    sessionId: s.id,
    title: s.title,
    createdAt: s.createdAt,
    messages: s.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      sources: m.sources?.map((src) => ({
        note: src.note,
        title: src.title,
        folder: src.folder,
        chunkText: src.chunkText,
        score: src.score,
        source: src.source
      })),
      chainOfThoughts: m.pipelineStatus
        ? {
            stage: m.pipelineStatus.stage,
            mode: m.pipelineStatus.mode,
            seedNotes: m.pipelineStatus.seedNotes.map((n) => n.note),
            connectedNotes: m.pipelineStatus.connectedNotes.map((n) => n.note),
            finalNotes: m.pipelineStatus.finalNotes.map((n) => n.note)
          }
        : undefined
    }))
  })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

async function loadHistoryMeta(): Promise<ChatHistoryMeta[]> {
  const chatHistoryApi = getChatHistoryApi()
  if (!chatHistoryApi) return []
  const res = await chatHistoryApi.list()
  return res.ok ? res.sessions : []
}

// ---------------------------------------------------------------------------
// SSE parser
// Workers AI: legacy models use `data: {"response":"..."}`; Chat Completions
// models (e.g. GLM) use OpenAI-style `choices[0].delta.content`.
// ---------------------------------------------------------------------------

function extractStreamChunkText(payload: string): string | null {
  try {
    const obj = JSON.parse(payload) as unknown
    if (typeof obj !== 'object' || obj === null) return null
    const o = obj as Record<string, unknown>
    if (typeof o.response === 'string') return o.response
    const choices = o.choices
    if (!Array.isArray(choices) || choices.length === 0) return null
    const first = choices[0] as Record<string, unknown>
    const delta = first.delta as Record<string, unknown> | undefined
    if (delta && typeof delta.content === 'string') return delta.content
    const message = first.message as Record<string, unknown> | undefined
    if (message && typeof message.content === 'string') return message.content
    return null
  } catch {
    return null
  }
}

function searchRowsToSources(
  rows: EmbeddingsSearchRow[],
  notes: SavedNote[],
  existingNoteIds: Set<string>
): ChatSource[] {
  return rows
    .map((row) => {
      const note = notes.find((candidate) => candidate.path === row.note)
      return {
        note: row.note,
        title: note?.title || row.title || 'Untitled',
        folder: row.folder,
        chunkText: row.text,
        score: row.score
      }
    })
    .filter((source) => existingNoteIds.has(source.note))
}

function dedupeSourcesByExcerpt(sources: ChatSource[]): ChatSource[] {
  const deduped: ChatSource[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    const key = `${source.note}:${source.chunkText.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(source)
  }
  return deduped
}

function noteTitleByPath(notes: SavedNote[]): Map<string, string> {
  return new Map(notes.map((note) => [note.path, note.title?.trim() || 'Untitled']))
}

function pickSeedNotes(rows: ChatSource[], count: number): ChatPipelineNote[] {
  const seeds: ChatPipelineNote[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.note)) continue
    seen.add(row.note)
    seeds.push({ note: row.note, title: row.title, source: 'seed' })
    if (seeds.length >= count) break
  }
  return seeds
}

function parseRerankerResponse(raw: string): Array<{ id: string; score: number }> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const payload = fenced?.[1] ?? trimmed
  try {
    const parsed = JSON.parse(payload) as unknown
    if (!Array.isArray(parsed)) return null
    const rows = parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const candidate = entry as { id?: unknown; score?: unknown }
        return typeof candidate.id === 'string' && typeof candidate.score === 'number'
          ? { id: candidate.id, score: candidate.score }
          : null
      })
      .filter((entry): entry is { id: string; score: number } => entry !== null)
    return rows.length > 0 ? rows : null
  } catch {
    return null
  }
}

function parseSSEChunks(raw: string): { tokens: string[]; done: boolean } {
  const tokens: string[] = []
  let done = false
  const lines = raw.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') {
      done = true
      continue
    }
    const piece = extractStreamChunkText(payload)
    if (piece) tokens.push(piece)
  }
  return { tokens, done }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseNotesChatOptions = {
  notes: SavedNote[]
  /** Passed through for the sidebar workspace filter UI — not used inside the hook. */
  folders?: Folder[]
  selectedNote: SavedNote | null
  workspacePath: string | null
  linkMentionIndex?: WorkspaceLinkMentionIndex | null
  /** Notelab model ID to use for chat requests. Defaults to llama-4-scout-17b. */
  modelId?: string
}

/** Optional @-mention context (notes / workspaces) merged into RAG chunks. */
export type SendMessageContextOptions = {
  explicitNoteIds?: string[]
  explicitWorkspaceIds?: string[]
  mode?: Mode
}

export type UseNotesChatResult = {
  session: ChatSession
  historyMeta: ChatHistoryMeta[]
  isLoading: boolean
  pipelineStatus: ChatPipelineStatus | null
  filterWorkspaceId: string | null
  setFilterWorkspaceId: (id: string | null) => void
  showHistory: boolean
  setShowHistory: (v: boolean) => void
  sendMessage: (query: string, context?: SendMessageContextOptions) => Promise<void>
  /** Writes the current session to disk and history meta when it has messages (e.g. before switching tabs). */
  persistCurrentSessionIfNeeded: () => Promise<void>
  newChat: () => Promise<ChatSession>
  loadHistorySession: (meta: ChatHistoryMeta) => Promise<void>
}

export function useNotesChat({
  notes,
  selectedNote,
  workspacePath,
  linkMentionIndex,
  modelId = 'llama-4-scout-17b'
}: UseNotesChatOptions): UseNotesChatResult {
  const [session, setSession] = useState<ChatSession>(emptySession)
  const [historyMeta, setHistoryMeta] = useState<ChatHistoryMeta[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<ChatPipelineStatus | null>(null)
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    void saveCurrentSession(session)
  }, [session])

  const abortRef = useRef(false)
  const activeRequestIdRef = useRef<string | null>(null)

  // Cleanup for the active stream
  const streamCleanupRef = useRef<(() => void) | null>(null)

  // ---------------------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (query: string, contextOpts?: SendMessageContextOptions) => {
      const ABORTED = '__NOTELAB_ABORTED__'
      const explicitNoteIds = contextOpts?.explicitNoteIds?.filter(Boolean) ?? []
      const explicitWorkspaceIds = contextOpts?.explicitWorkspaceIds?.filter(Boolean) ?? []
      const trimmedQuery =
        query.trim() ||
        (explicitNoteIds.length > 0 || explicitWorkspaceIds.length > 0
          ? 'Please answer using the referenced notes and workspaces.'
          : '')
      if (!trimmedQuery || isLoading) return
      log.info(
        `sendMessage: workspacePath=${workspacePath ?? '(none)'} modelId=${modelId} selectedNote=${selectedNote?.path ?? '(none)'} query="${trimmedQuery.slice(0, 120)}" explicitNotes=${explicitNoteIds.length} explicitWorkspaces=${explicitWorkspaceIds.length}`
      )

      const isLocalModel = modelId.startsWith('local:')
      const ollamaModelName = isLocalModel ? modelId.slice('local:'.length) : null

      const userMessageForUi =
        query.trim() ||
        (explicitNoteIds.length > 0 || explicitWorkspaceIds.length > 0
          ? 'Using referenced notes and workspaces.'
          : trimmedQuery)

      // Cancel any in-flight stream
      abortRef.current = true
      streamCleanupRef.current?.()
      abortRef.current = false
      const requestId = newSessionId()
      activeRequestIdRef.current = requestId

      const isCancelled = (): boolean =>
        abortRef.current || activeRequestIdRef.current !== requestId
      const ensureActive = (): void => {
        if (isCancelled()) throw new Error(ABORTED)
      }

      const suggestedMode = classifyQueryComplexity(trimmedQuery)
      const mode = contextOpts?.mode ?? suggestedMode
      const modeConfig = getModeConfig(mode)
      const titlesByPath = noteTitleByPath(notes)

      const updatePipeline = (
        stage: ChatPipelineStage,
        seedNotes: ChatPipelineNote[] = [],
        connectedNotes: ChatPipelineNote[] = [],
        finalNotes: ChatPipelineNote[] = []
      ): void => {
        if (isCancelled()) return
        latestPipelineStatus = {
          stage,
          mode,
          suggestedMode,
          seedNotes,
          connectedNotes,
          finalNotes
        }
        setPipelineStatus(latestPipelineStatus)
      }
      let latestPipelineStatus: ChatPipelineStatus = {
        stage: 'analyzing',
        mode,
        suggestedMode,
        seedNotes: [],
        connectedNotes: [],
        finalNotes: []
      }

      const userMsg: ChatMessage = {
        id: newSessionId(),
        role: 'user',
        content: userMessageForUi,
        timestamp: Date.now()
      }

      setIsLoading(true)
      updatePipeline('analyzing')

      // Add user message + placeholder assistant message
      const assistantId = newSessionId()
      setSession((prev) => {
        const updated: ChatSession = {
          ...prev,
          title: prev.messages.length === 0 ? trimmedQuery.slice(0, 60) : prev.title,
          messages: [
            ...prev.messages,
            userMsg,
            { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), sources: [] }
          ]
        }
        return updated
      })

      try {
        const existingNoteIds = new Set(notes.map((n) => n.path))
        const searchApi = getEmbeddingsApi()?.searchDocuments
        const workspaceFilter = filterWorkspaceId
          ? { folder: { $eq: filterWorkspaceId } }
          : undefined

        const runReranker = async (
          candidates: Array<ChatSource & { id: string }>
        ): Promise<Array<{ id: string; score: number }> | null> => {
          if (candidates.length === 0) return null

          const system =
            'You are a relevance scorer. Given a query and a list of note excerpts, return a JSON array of { id, score } where score is 0.0–1.0 based on how directly useful each excerpt is for answering the query. Return only JSON.'
          const user = `Query: ${trimmedQuery}\n\nExcerpts:\n${candidates
            .map(
              (candidate) =>
                `- id: ${candidate.id}\n  title: ${candidate.title}\n  excerpt: ${candidate.chunkText.slice(0, 700)}`
            )
            .join('\n\n')}`

          const timeoutMs = 3000
          if (isLocalModel && ollamaModelName) {
            const chatStream = getOllamaApi()?.chatStream
            if (!chatStream) return null

            const result = await new Promise<string | null>((resolve) => {
              let text = ''
              let settled = false
              let buffer = ''
              const timer = window.setTimeout(() => {
                settled = true
                cleanup()
                resolve(null)
              }, timeoutMs)

              const cleanup = chatStream(
                JSON.stringify({
                  model: ollamaModelName,
                  messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                  ],
                  stream: true
                }),
                {
                  onChunk: (chunk) => {
                    if (settled || isCancelled()) return
                    buffer += chunk
                    const lines = buffer.split('\n')
                    buffer = lines.pop() ?? ''
                    for (const line of lines) {
                      try {
                        const parsed = JSON.parse(line) as { message?: { content?: string } }
                        text += parsed.message?.content ?? ''
                      } catch {
                        /* skip malformed */
                      }
                    }
                  },
                  onEnd: () => {
                    if (settled) return
                    settled = true
                    window.clearTimeout(timer)
                    if (buffer.trim()) {
                      try {
                        const parsed = JSON.parse(buffer) as { message?: { content?: string } }
                        text += parsed.message?.content ?? ''
                      } catch {
                        /* ignore tail */
                      }
                    }
                    resolve(text)
                  },
                  onError: () => {
                    if (settled) return
                    settled = true
                    window.clearTimeout(timer)
                    resolve(null)
                  }
                }
              )
            })

            ensureActive()
            return result ? parseRerankerResponse(result) : null
          }

          const authFetch = getApi()?.auth.fetch
          const baseUrl = (import.meta.env.VITE_AUTH_URL?.trim() ?? '').replace(/\/$/, '')
          if (!authFetch || !baseUrl) return null

          const response = await Promise.race([
            authFetch(`${baseUrl}/api/chat`, {
              method: 'POST',
              body: JSON.stringify({
                modelId,
                contextChunks: [],
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: user }
                ]
              })
            }),
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), timeoutMs)
            })
          ])

          ensureActive()
          if (!response || !response.ok) return null

          const parsedStream = parseSSEChunks(response.body)
          const payload =
            parsedStream.tokens.length > 0 ? parsedStream.tokens.join('') : response.body
          return parseRerankerResponse(payload)
        }

        // ---------------------------------------------------------------------
        // Mention context (preserved from existing flow)
        // ---------------------------------------------------------------------
        const mentionSources: ChatSource[] = []
        if (
          workspacePath &&
          searchApi &&
          (explicitNoteIds.length > 0 || explicitWorkspaceIds.length > 0)
        ) {
          const seenMention = new Set<string>()
          if (explicitNoteIds.length > 0) {
            const res = await searchApi({
              workspacePath,
              query: trimmedQuery,
              maxDocuments: Math.min(Math.max(explicitNoteIds.length, 1), 12),
              maxChunks: 24,
              maxSections: 1,
              maxTokens: 320,
              filter: { note: { $in: explicitNoteIds } }
            })
            ensureActive()
            if (res.ok) {
              for (const source of searchRowsToSources(res.rows, notes, existingNoteIds)) {
                const key = `${source.note}:${source.chunkText.slice(0, 40)}`
                if (seenMention.has(key)) continue
                seenMention.add(key)
                mentionSources.push({ ...source, source: 'mention' })
              }
            }
          }
          if (explicitWorkspaceIds.length > 0) {
            const res = await searchApi({
              workspacePath,
              query: trimmedQuery,
              maxDocuments: Math.min(Math.max(explicitWorkspaceIds.length * 3, 3), 16),
              maxChunks: 32,
              maxSections: 1,
              maxTokens: 320,
              filter: { folder: { $in: explicitWorkspaceIds } }
            })
            ensureActive()
            if (res.ok) {
              for (const source of searchRowsToSources(res.rows, notes, existingNoteIds)) {
                const key = `${source.note}:${source.chunkText.slice(0, 40)}`
                if (seenMention.has(key)) continue
                seenMention.add(key)
                mentionSources.push({ ...source, source: 'mention' })
              }
            }
          }
        }

        // ---------------------------------------------------------------------
        // Stage 1: global embedding query
        // ---------------------------------------------------------------------
        updatePipeline('searching')
        const stage1Res =
          workspacePath && searchApi
            ? await searchApi({
                workspacePath,
                query: trimmedQuery,
                maxDocuments: modeConfig.seedCount,
                maxChunks: Math.max(modeConfig.seedCount * 4, 12),
                maxSections: 1,
                maxTokens: 320,
                filter: workspaceFilter
              })
            : null
        ensureActive()

        let stage1Sources: ChatSource[] = []
        if (stage1Res?.ok) {
          stage1Sources = searchRowsToSources(stage1Res.rows, notes, existingNoteIds).sort(
            (left, right) => (right.score ?? 0) - (left.score ?? 0)
          )
        } else if (stage1Res) {
          log.warn('[pipeline] stage 1 document search failed', stage1Res)
        }

        const seedNotes = pickSeedNotes(stage1Sources, modeConfig.seedCount)
        updatePipeline('seed-results', seedNotes)

        // ---------------------------------------------------------------------
        // Stage 2: graph expansion
        // ---------------------------------------------------------------------
        updatePipeline('expanding', seedNotes)
        const expandedNodes = expandSeedConnections(
          seedNotes.map((note) => note.note),
          linkMentionIndex,
          modeConfig.expandedNodeCap
        )
        ensureActive()
        const connectedNotes = expandedNodes.map((node) => ({
          note: node.note,
          title: titlesByPath.get(node.note) ?? 'Untitled',
          source: 'connected' as const
        }))
        updatePipeline('connected-results', seedNotes, connectedNotes)

        // ---------------------------------------------------------------------
        // Stage 3: focused embedding query on expanded pool
        // ---------------------------------------------------------------------
        updatePipeline('reranking', seedNotes, connectedNotes)
        let candidatePool: ChatSource[] = []
        if (workspacePath && searchApi && expandedNodes.length > 0) {
          const stage3Res = await searchApi({
            workspacePath,
            query: trimmedQuery,
            maxDocuments: expandedNodes.length,
            maxChunks: Math.max(modeConfig.expandedNodeCap * 2, 12),
            maxSections: 1,
            maxTokens: 320,
            filter: { note: { $in: expandedNodes.map((node) => node.note) } }
          })
          ensureActive()
          if (stage3Res.ok) {
            candidatePool = searchRowsToSources(stage3Res.rows, notes, existingNoteIds).map(
              (row) => ({
                ...row,
                source: 'connected'
              })
            )
          }
        }
        candidatePool.sort((left, right) => (right.score ?? 0) - (left.score ?? 0))

        // ---------------------------------------------------------------------
        // Stage 4: confidence fallback
        // ---------------------------------------------------------------------
        const notesInPool = new Set(candidatePool.map((candidate) => candidate.note))
        if (shouldBlendGlobalFallback(candidatePool[0]?.score ?? null)) {
          for (const source of stage1Sources) {
            if (notesInPool.has(source.note)) continue
            candidatePool.push({ ...source, source: 'global_fallback' })
            notesInPool.add(source.note)
            if (
              candidatePool.filter((candidate) => candidate.source === 'global_fallback').length >=
              3
            ) {
              break
            }
          }
        }

        candidatePool = dedupeSourcesByExcerpt(candidatePool)
        const rerankCandidates = candidatePool.map((candidate, index) => ({
          ...candidate,
          id: `${candidate.note}::${index}`
        }))

        // ---------------------------------------------------------------------
        // Stage 5: LLM reranker with silent fallback
        // ---------------------------------------------------------------------
        const rerankedScores = await runReranker(rerankCandidates).catch(() => null)
        ensureActive()
        const rerankScoreById = new Map(rerankedScores?.map((row) => [row.id, row.score]) ?? [])
        const sortedCandidates = [...rerankCandidates].sort((left, right) => {
          const rightScore = rerankScoreById.get(right.id) ?? right.score ?? 0
          const leftScore = rerankScoreById.get(left.id) ?? left.score ?? 0
          return rightScore - leftScore
        })
        const topCandidates = sortedCandidates.slice(0, modeConfig.finalContextCount)
        const finalPipelineNotes = Array.from(
          new Map(
            topCandidates.map((candidate) => [
              candidate.note,
              {
                note: candidate.note,
                title: candidate.title,
                source:
                  candidate.source === 'global_fallback'
                    ? ('global_fallback' as const)
                    : ('connected' as const)
              }
            ])
          ).values()
        )
        updatePipeline('context-ready', seedNotes, connectedNotes, finalPipelineNotes)

        // ---------------------------------------------------------------------
        // Stage 6: assemble context and stream final LLM call
        // ---------------------------------------------------------------------
        const allSources = dedupeSourcesByExcerpt([...mentionSources, ...topCandidates])
        const uniqueSources = allSources.filter(
          (source, index, arr) =>
            arr.findIndex((candidate) => candidate.note === source.note) === index
        )
        const contextChunks = allSources.map(
          (source) => `[Source: "${source.title}"]\n${source.chunkText}`
        )
        const historyForApi = sessionRef.current.messages.slice(-10).map((message) => ({
          role: message.role,
          content: message.content
        }))
        historyForApi.push({ role: 'user' as const, content: trimmedQuery })

        let accumulatedContent = ''
        let chunkCount = 0

        const finalizeMessage = (): void => {
          if (isCancelled()) return
          setSession((prev) => ({
            ...prev,
            messages: prev.messages.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    sources: uniqueSources,
                    content: accumulatedContent,
                    pipelineStatus: latestPipelineStatus
                  }
                : message
            )
          }))
          setIsLoading(false)
          streamCleanupRef.current = null
        }

        const handleStreamError = (msg: string): void => {
          if (isCancelled()) return
          log.error('[pipeline] stream error', msg)
          setSession((prev) => ({
            ...prev,
            messages: prev.messages.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: accumulatedContent || `⚠️ Stream error: ${msg}`,
                    pipelineStatus: latestPipelineStatus
                  }
                : message
            )
          }))
          setIsLoading(false)
          streamCleanupRef.current = null
        }

        if (isLocalModel && ollamaModelName) {
          const systemPrompt =
            contextChunks.length > 0
              ? `You are a helpful notes assistant. Use the following excerpts from the user's notes to answer questions:\n\n${contextChunks.join('\n\n---\n\n')}`
              : 'You are a helpful notes assistant.'

          const ollamaMessages = [
            { role: 'system', content: systemPrompt },
            ...historyForApi.map((message) => ({ role: message.role, content: message.content }))
          ]

          const chatStream = getOllamaApi()?.chatStream
          if (!chatStream) {
            handleStreamError('Local Ollama chat bridge unavailable')
            return
          }

          let buf = ''
          let ollamaStreamFailed = false
          const ollamaStreamError = (msg: string): void => {
            ollamaStreamFailed = true
            handleStreamError(msg)
          }

          const processLine = (line: string): void => {
            const trimmed = line.trim()
            if (!trimmed || isCancelled()) return
            try {
              const obj = JSON.parse(trimmed) as {
                message?: { content?: string }
                done?: boolean
                error?: string
              }
              if (obj.error) {
                ollamaStreamError(obj.error)
                return
              }
              const token = obj.message?.content ?? ''
              if (token) {
                chunkCount++
                accumulatedContent += token
                setSession((prev) => ({
                  ...prev,
                  messages: prev.messages.map((message) =>
                    message.id === assistantId
                      ? { ...message, content: accumulatedContent }
                      : message
                  )
                }))
              }
            } catch {
              /* skip malformed */
            }
          }

          streamCleanupRef.current = chatStream(
            JSON.stringify({
              model: ollamaModelName,
              messages: ollamaMessages,
              stream: true
            }),
            {
              onChunk: (text) => {
                if (isCancelled() || ollamaStreamFailed) return
                buf += text
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''
                for (const line of lines) {
                  processLine(line)
                }
              },
              onEnd: () => {
                if (!ollamaStreamFailed && buf.trim()) processLine(buf)
                if (!ollamaStreamFailed) finalizeMessage()
              },
              onError: ollamaStreamError
            }
          )
          return
        }

        const streamFetch = getApi()?.auth.streamFetch
        if (!streamFetch) {
          handleStreamError('streamFetch not available')
          return
        }

        const baseUrl = (import.meta.env.VITE_AUTH_URL?.trim() ?? '').replace(/\/$/, '')
        if (!baseUrl) {
          handleStreamError('VITE_AUTH_URL not set')
          return
        }

        let rawBuffer = ''
        streamCleanupRef.current = streamFetch(
          `${baseUrl}/api/chat`,
          {
            method: 'POST',
            body: JSON.stringify({ messages: historyForApi, contextChunks, modelId })
          },
          {
            onChunk: (chunk: string) => {
              if (isCancelled()) return
              chunkCount++
              rawBuffer += chunk
              const { tokens } = parseSSEChunks(rawBuffer)
              const lastNewline = rawBuffer.lastIndexOf('\n')
              if (lastNewline >= 0) rawBuffer = rawBuffer.slice(lastNewline + 1)
              if (tokens.length > 0) {
                accumulatedContent += tokens.join('')
                setSession((prev) => ({
                  ...prev,
                  messages: prev.messages.map((message) =>
                    message.id === assistantId
                      ? { ...message, content: accumulatedContent }
                      : message
                  )
                }))
              }
            },
            onEnd: finalizeMessage,
            onError: handleStreamError
          }
        )
      } catch (error) {
        if (error instanceof Error && error.message === ABORTED) return
        const message = error instanceof Error ? error.message : String(error)
        log.error('[pipeline] sendMessage failed', message)
        if (!isCancelled()) {
          setIsLoading(false)
          setSession((prev) => ({
            ...prev,
            messages: prev.messages.map((messageItem) =>
              messageItem.id === assistantId
                ? { ...messageItem, content: `⚠️ ${message}`, pipelineStatus: latestPipelineStatus }
                : messageItem
            )
          }))
        }
      }
    },
    [isLoading, filterWorkspaceId, selectedNote, notes, modelId, linkMentionIndex]
  )

  // ---------------------------------------------------------------------------
  // persist — save current session when it has messages
  // ---------------------------------------------------------------------------

  const persistCurrentSessionIfNeeded = useCallback(async () => {
    if (session.messages.length === 0) return
    await saveCurrentSession(session)
    const meta: ChatHistoryMeta = {
      sessionId: session.id,
      title: session.title,
      createdAt: session.createdAt,
      messageCount: session.messages.length
    }
    setHistoryMeta((prev) => {
      const deduped = [meta, ...prev.filter((m) => m.sessionId !== session.id)]
      return deduped
    })
  }, [session])

  // ---------------------------------------------------------------------------
  // newChat — save current session to disk, then reset
  // ---------------------------------------------------------------------------

  const newChat = useCallback(async () => {
    await persistCurrentSessionIfNeeded()

    // Reset current session
    const fresh = emptySession()
    setSession(fresh)
    await saveCurrentSession(fresh)
    setShowHistory(false) // stay in chat view to start the new conversation
    log.info(`started new chat session: ${fresh.id}`)
    return fresh
  }, [persistCurrentSessionIfNeeded])

  // ---------------------------------------------------------------------------
  // loadHistorySession — load a past session back into the view (read-only)
  // ---------------------------------------------------------------------------

  const loadHistorySession = useCallback(async (meta: ChatHistoryMeta) => {
    log.info(`loading history session from disk: ${meta.sessionId}`)
    const chatHistoryApi = getChatHistoryApi()
    if (!chatHistoryApi?.readSession) return

    const res = await chatHistoryApi.readSession(meta.sessionId)
    if (!res.ok) {
      log.warn('failed to read session', res.error)
      return
    }

    const { session: disk } = res
    const sid = disk.sessionId || meta.sessionId
    const reconstructed: ChatSession = {
      id: sid,
      title: disk.title || meta.title,
      createdAt: disk.createdAt || meta.createdAt,
      messages: disk.messages.map((m, i) => ({
        id: `${sid}-hist-${i}-${m.timestamp}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      }))
    }
    setSession(reconstructed)
    setShowHistory(false)
  }, [])

  // ---------------------------------------------------------------------------
  // Refresh history meta from disk on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void loadHistoryMeta().then((meta) => {
      log.info(`loaded ${meta.length} session(s) from disk`)
      setHistoryMeta(meta)
    })
  }, [])

  return {
    session,
    historyMeta,
    isLoading,
    pipelineStatus,
    filterWorkspaceId,
    setFilterWorkspaceId,
    showHistory,
    setShowHistory,
    sendMessage,
    persistCurrentSessionIfNeeded,
    newChat,
    loadHistorySession
  }
}

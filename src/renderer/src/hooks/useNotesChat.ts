import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmbeddingsSearchRow } from '@/lib/auth/auth-bridge'
import { createElectronLogger } from '@/lib/core/electron-log'
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
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
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
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_CURRENT_KEY = 'notelab:chat:current-session'
const LS_HISTORY_KEY = 'notelab:chat:history-meta'

function newSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptySession(): ChatSession {
  return { id: newSessionId(), title: 'New chat', createdAt: Date.now(), messages: [] }
}

function loadCurrentSession(): ChatSession {
  try {
    const raw = localStorage.getItem(LS_CURRENT_KEY)
    if (raw) return JSON.parse(raw) as ChatSession
  } catch {
    /* ignore */
  }
  return emptySession()
}

function saveCurrentSession(s: ChatSession): void {
  try {
    localStorage.setItem(LS_CURRENT_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

function loadHistoryMeta(): ChatHistoryMeta[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY)
    if (raw) return JSON.parse(raw) as ChatHistoryMeta[]
  } catch {
    /* ignore */
  }
  return []
}

function saveHistoryMeta(list: ChatHistoryMeta[]): void {
  try {
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
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
      const note = notes.find((candidate) => candidate.id === row.note)
      return {
        note: row.note,
        title: note?.title || row.title || 'Untitled',
        folder: row.folder,
        chunkText: row.text,
      }
    })
    .filter((source) => existingNoteIds.has(source.note))
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
  /** Notelab model ID to use for chat requests. Defaults to llama-4-scout-17b. */
  modelId?: string
}

/** Optional @-mention context (notes / workspaces) merged into RAG chunks. */
export type SendMessageContextOptions = {
  explicitNoteIds?: string[]
  explicitWorkspaceIds?: string[]
}

export type UseNotesChatResult = {
  session: ChatSession
  historyMeta: ChatHistoryMeta[]
  isLoading: boolean
  filterWorkspaceId: string | null
  setFilterWorkspaceId: (id: string | null) => void
  showHistory: boolean
  setShowHistory: (v: boolean) => void
  sendMessage: (query: string, context?: SendMessageContextOptions) => Promise<void>
  newChat: () => Promise<void>
  loadHistorySession: (meta: ChatHistoryMeta) => Promise<void>
}

export function useNotesChat({
  notes,
  selectedNote,
  workspacePath,
  modelId = 'llama-4-scout-17b',
}: UseNotesChatOptions): UseNotesChatResult {
  const [session, setSession] = useState<ChatSession>(loadCurrentSession)
  const [historyMeta, setHistoryMeta] = useState<ChatHistoryMeta[]>(loadHistoryMeta)
  const [isLoading, setIsLoading] = useState(false)
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Keep localStorage in sync
  useEffect(() => {
    saveCurrentSession(session)
  }, [session])

  // Abort ref — set to true when a new message is sent mid-stream
  const abortRef = useRef(false)

  // Cleanup for the active stream
  const streamCleanupRef = useRef<(() => void) | null>(null)

  // ---------------------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (query: string, contextOpts?: SendMessageContextOptions) => {
      const explicitNoteIds = contextOpts?.explicitNoteIds?.filter(Boolean) ?? []
      const explicitWorkspaceIds = contextOpts?.explicitWorkspaceIds?.filter(Boolean) ?? []
      const trimmedQuery =
        query.trim() ||
        (explicitNoteIds.length > 0 || explicitWorkspaceIds.length > 0
          ? 'Please answer using the referenced notes and workspaces.'
          : '')
      if (!trimmedQuery || isLoading) return
      log.info(
        `sendMessage: workspacePath=${workspacePath ?? '(none)'} modelId=${modelId} selectedNote=${selectedNote?.id ?? '(none)'} query="${trimmedQuery.slice(0, 120)}" explicitNotes=${explicitNoteIds.length} explicitWorkspaces=${explicitWorkspaceIds.length}`
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

      const userMsg: ChatMessage = {
        id: newSessionId(),
        role: 'user',
        content: userMessageForUi,
        timestamp: Date.now(),
      }

      setIsLoading(true)

      // Add user message + placeholder assistant message
      const assistantId = newSessionId()
      setSession((prev) => {
        const updated: ChatSession = {
          ...prev,
          title: prev.messages.length === 0 ? trimmedQuery.slice(0, 60) : prev.title,
          messages: [
            ...prev.messages,
            userMsg,
            { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), sources: [] },
          ],
        }
        return updated
      })

      const existingNoteIds = new Set(notes.map((n) => n.id))
      const searchApi = window.api.embeddings?.searchDocuments

      // -----------------------------------------------------------------------
      // 1. Retrieve document sections from the workspace-local Vectra index
      // -----------------------------------------------------------------------
      let mentionSources: ChatSource[] = []
      if (workspacePath && searchApi && (explicitNoteIds.length > 0 || explicitWorkspaceIds.length > 0)) {
        const seenMention = new Set<string>()
        if (explicitNoteIds.length > 0) {
          const res = await searchApi({
            workspacePath,
            query: trimmedQuery,
            maxDocuments: Math.min(Math.max(explicitNoteIds.length, 1), 12),
            maxChunks: 24,
            maxSections: 1,
            maxTokens: 320,
            filter: { note: { $in: explicitNoteIds } },
            isBm25: true,
          })
          if (res.ok) {
            for (const source of searchRowsToSources(res.rows, notes, existingNoteIds)) {
              const key = `${source.note}:${source.chunkText.slice(0, 40)}`
              if (seenMention.has(key)) continue
              seenMention.add(key)
              mentionSources.push(source)
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
            filter: { folder: { $in: explicitWorkspaceIds } },
            isBm25: true,
          })
          if (res.ok) {
            for (const source of searchRowsToSources(res.rows, notes, existingNoteIds)) {
              const key = `${source.note}:${source.chunkText.slice(0, 40)}`
              if (seenMention.has(key)) continue
              seenMention.add(key)
              mentionSources.push(source)
            }
          }
        }
        log.info(
          `[1/3] @-mention context — sections=${mentionSources.length} explicitNotes=${explicitNoteIds.length} explicitWorkspaces=${explicitWorkspaceIds.length}`
        )
      }

      const workspaceFilter = filterWorkspaceId
        ? { folder: { $eq: filterWorkspaceId } }
        : undefined

      log.info(`[1/3] notes in memory: ${notes.length}`)
      notes.slice(0, 15).forEach((n, i) => {
        log.info(`notes[${i}] id="${n.id}" title="${n.title}" folderId="${n.folderId}"`)
      })
      if (notes.length > 15) log.info(`… and ${notes.length - 15} more notes in memory`)

      log.info(
        `[1/3] Vectra queryDocuments — workspacePath=${workspacePath ?? '(none)'} maxDocuments=5 workspaceFilter=${filterWorkspaceId ?? '(none)'}`
      )
      const searchRes =
        workspacePath && searchApi
          ? await searchApi({
              workspacePath,
              query: trimmedQuery,
              maxDocuments: 5,
              maxChunks: 20,
              maxSections: 1,
              maxTokens: 320,
              filter: workspaceFilter,
              isBm25: true,
            })
          : null
      log.info('[1/3] raw Vectra rows', searchRes)

      let ragSources: ChatSource[] = []
      if (searchRes?.ok) {
        log.info(`[1/3] ${searchRes.rows.length} row(s) returned from Vectra`)
        ragSources = searchRowsToSources(searchRes.rows, notes, existingNoteIds)
      } else {
        log.warn('[1/3] document search failed or unavailable', searchRes)
      }

      // @-mention sections first, then top search hits (dedup by noteId + section prefix)
      {
        const merged: ChatSource[] = []
        const seen = new Set<string>()
        for (const s of [...mentionSources, ...ragSources]) {
          const key = `${s.note}:${s.chunkText.slice(0, 30)}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(s)
        }
        ragSources = merged
      }

      // allSources = all sections passed to the AI for context (full detail)
      const allSources = ragSources

      // uniqueSources = deduplicated by noteId for the "Used N sources" display
      const uniqueSources = allSources.filter(
        (s, i, arr) => arr.findIndex((x) => x.note === s.note) === i
      )
      log.info(`[1/3] ${allSources.length} section(s) → ${uniqueSources.length} unique note(s)`)

      // -----------------------------------------------------------------------
      // 2. Build context for the AI (all sections, not deduplicated)
      // -----------------------------------------------------------------------
      const contextChunks = allSources.map(
        (s) => `[Source: "${s.title}"]\n${s.chunkText}`
      )

      log.info(`[2/3] context — ${contextChunks.length} section(s)`)
      contextChunks.forEach((c, i) => {
        log.info(`context[${i}] chars=${c.length} text="${c.slice(0, 150).replace(/\n/g, '↵')}"`)
      })

      // -----------------------------------------------------------------------
      // 3. Build message history for the API (last 10 messages, no sources)
      // -----------------------------------------------------------------------
      const historyForApi = session.messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }))
      historyForApi.push({ role: 'user' as const, content: trimmedQuery })

      log.info(`[3/3] POST /api/chat — messages=${historyForApi.length} contextSections=${contextChunks.length}`)
      historyForApi.forEach((m, i) => {
        log.info(`msg[${i}] [${m.role}]: "${m.content.slice(0, 80)}"`)
      })

      // -----------------------------------------------------------------------
      // 5. Stream from /api/chat (cloud) or Ollama local server
      // -----------------------------------------------------------------------
      let accumulatedContent = ''
      let chunkCount = 0

      // Helper: finalize assistant message with accumulated content + sources
      const finalizeMessage = (): void => {
        setSession((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantId ? { ...m, sources: uniqueSources, content: accumulatedContent } : m
          ),
        }))
        setIsLoading(false)
        streamCleanupRef.current = null
      }

      const handleStreamError = (msg: string): void => {
        log.error(`[3/3] stream error after ${chunkCount} chunk(s)`, msg)
        setSession((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantId
              ? { ...m, content: accumulatedContent || `⚠️ Stream error: ${msg}` }
              : m
          ),
        }))
        setIsLoading(false)
        streamCleanupRef.current = null
      }

      if (isLocalModel && ollamaModelName) {
        // ── Local Ollama path ──
        log.info(`[3/3] streaming from local Ollama — model="${ollamaModelName}"`)

        // Build Ollama chat messages format (with system prompt containing context)
        const systemPrompt = contextChunks.length > 0
          ? `You are a helpful notes assistant. Use the following excerpts from the user's notes to answer questions:\n\n${contextChunks.join('\n\n---\n\n')}`
          : 'You are a helpful notes assistant.'

        const ollamaMessages = [
          { role: 'system', content: systemPrompt },
          ...historyForApi.map((m) => ({ role: m.role, content: m.content })),
        ]

        // Stream via main process — renderer fetch() to localhost hits CORS from the Vite dev origin.
        const chatStream = window.api.ollama?.chatStream
        if (!chatStream) {
          handleStreamError('Local Ollama chat bridge unavailable')
          return
        }

        const bodyJson = JSON.stringify({
          model: ollamaModelName,
          messages: ollamaMessages,
          stream: true,
        })

        /** Ollama may send an error JSON line; main still ends the stream afterward. */
        let ollamaStreamFailed = false
        const ollamaStreamError = (msg: string): void => {
          ollamaStreamFailed = true
          handleStreamError(msg)
        }

        let buf = ''
        const processLine = (line: string): void => {
          const trimmed = line.trim()
          if (!trimmed) return
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
                messages: prev.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulatedContent } : m
                ),
              }))
            }
            if (obj.done) {
              log.info(`[3/3] Ollama stream done — tokens=${chunkCount} chars=${accumulatedContent.length}`)
            }
          } catch {
            /* skip malformed */
          }
        }

        const cleanupStream = chatStream(bodyJson, {
          onChunk: (text) => {
            if (abortRef.current || ollamaStreamFailed) return
            buf += text
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              processLine(line)
            }
          },
          onEnd: () => {
            if (!ollamaStreamFailed && buf.trim()) {
              processLine(buf)
              buf = ''
            }
            if (!ollamaStreamFailed) finalizeMessage()
          },
          onError: ollamaStreamError,
        })
        streamCleanupRef.current = cleanupStream
      } else {
        // ── Cloud API path ──
        const streamFetch = window.api.auth.streamFetch
        if (!streamFetch) {
          log.error('streamFetch not available')
          setIsLoading(false)
          return
        }

        const baseUrl = (import.meta.env.VITE_AUTH_URL?.trim() ?? '').replace(/\/$/, '')
        if (!baseUrl) {
          log.error('VITE_AUTH_URL not set')
          setIsLoading(false)
          return
        }

        let rawBuffer = ''
        log.info(`[3/3] starting stream from ${baseUrl}/api/chat`)

        const cleanup = streamFetch(
          `${baseUrl}/api/chat`,
          {
            method: 'POST',
            body: JSON.stringify({ messages: historyForApi, contextChunks, modelId }),
          },
          {
            onChunk: (chunk: string) => {
              if (abortRef.current) return
              chunkCount++
              log.info(`SSE raw chunk[${chunkCount}] bytes=${chunk.length} preview=${JSON.stringify(chunk.slice(0, 120))}`)
              rawBuffer += chunk
              const { tokens } = parseSSEChunks(rawBuffer)
              const lastNewline = rawBuffer.lastIndexOf('\n')
              if (lastNewline >= 0) {
                rawBuffer = rawBuffer.slice(lastNewline + 1)
              }
              if (tokens.length > 0) {
                log.info(`SSE tokens[${chunkCount}] ${tokens.join('')}`)
                accumulatedContent += tokens.join('')
                setSession((prev) => ({
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulatedContent } : m
                  ),
                }))
              }
            },
            onEnd: () => {
              log.info(`[3/3] stream ended — chunks=${chunkCount} chars=${accumulatedContent.length}`)
              log.info(`[3/3] final response preview: "${accumulatedContent.slice(0, 200)}"`)
              finalizeMessage()
            },
            onError: handleStreamError,
          }
        )

        streamCleanupRef.current = cleanup
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoading, filterWorkspaceId, selectedNote, notes, session.messages, modelId]
  )

  // ---------------------------------------------------------------------------
  // newChat — save current session to disk, then reset
  // ---------------------------------------------------------------------------

  const newChat = useCallback(async () => {
    // Only persist if there are actual messages
    if (session.messages.length > 0) {
      log.info(`persisting session to disk before new chat: ${session.id}`)
      const chatHistoryApi = window.api.chatHistory
      if (chatHistoryApi) {
        const res = await chatHistoryApi.write({
          sessionId: session.id,
          title: session.title,
          createdAt: session.createdAt,
          messages: session.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        })
        if (res.ok) {
          log.info('session written to disk OK')
        } else {
          log.warn('failed to write session', res.error)
        }
      }

      // Update in-memory history meta
      const meta: ChatHistoryMeta = {
        sessionId: session.id,
        title: session.title,
        createdAt: session.createdAt,
        messageCount: session.messages.length,
      }
      setHistoryMeta((prev) => {
        const deduped = [meta, ...prev.filter((m) => m.sessionId !== session.id)]
        saveHistoryMeta(deduped)
        return deduped
      })
    }

    // Reset current session
    const fresh = emptySession()
    setSession(fresh)
    saveCurrentSession(fresh)
    setShowHistory(true) // show history so user can see past sessions
    log.info(`started new chat session: ${fresh.id}`)
  }, [session])

  // ---------------------------------------------------------------------------
  // loadHistorySession — load a past session back into the view (read-only)
  // ---------------------------------------------------------------------------

  const loadHistorySession = useCallback(async (meta: ChatHistoryMeta) => {
    log.info(`loading history session from disk: ${meta.sessionId}`)
    const chatHistoryApi = window.api.chatHistory
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
        timestamp: m.timestamp,
      })),
    }
    setSession(reconstructed)
    setShowHistory(false)
  }, [])

  // ---------------------------------------------------------------------------
  // Refresh history meta from disk on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const chatHistoryApi = window.api.chatHistory
    if (!chatHistoryApi) return
    void chatHistoryApi.list().then((res) => {
      if (res.ok) {
        log.info(`loaded ${res.sessions.length} session(s) from disk`)
        setHistoryMeta(res.sessions)
        saveHistoryMeta(res.sessions)
      }
    })
  }, [])

  return {
    session,
    historyMeta,
    isLoading,
    filterWorkspaceId,
    setFilterWorkspaceId,
    showHistory,
    setShowHistory,
    sendMessage,
    newChat,
    loadHistorySession,
  }
}

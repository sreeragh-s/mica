import { useCallback, useEffect, useRef, useState } from 'react'
import { LOCAL_EMBEDDING_MODEL } from '@/components/ai/LocalModelSetupDialog'
import { EMBEDDING_DIMENSION } from '@/lib/embedding-pipeline'
import { serverFetchJson } from '@/lib/server-api'
import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'

const LOG = '[useNotesChat]'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatSource = {
  noteId: string
  noteTitle: string
  workspaceId: string
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

/** Escape single quotes for LanceDB filter literals. */
function sqlEscapeLiteral(s: string): string {
  return s.replace(/'/g, "''")
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
  folders?: WorkspaceFolder[]
  selectedNote: SavedNote | null
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
      console.info(LOG, 'sendMessage', `"${trimmedQuery.slice(0, 60)}"`)

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

      // -----------------------------------------------------------------------
      // 1. Embed the query (cloud API, or Ollama bge-m3 when using a local chat model)
      // -----------------------------------------------------------------------
      console.info(LOG, 'embedding query…', isLocalModel ? '(local Ollama)' : '(server)')

      let queryVector: number[]

      if (isLocalModel) {
        const embedApi = window.api.ollama?.embed
        if (!embedApi) {
          setSession((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: '⚠️ Local embedding is unavailable in this build.' }
                : m
            ),
          }))
          setIsLoading(false)
          return
        }
        const localEmb = await embedApi({
          model: LOCAL_EMBEDDING_MODEL,
          input: trimmedQuery,
        })
        if (!localEmb.ok) {
          const hint =
            /not found|pull|file does not exist/i.test(localEmb.error)
              ? ` Pull ${LOCAL_EMBEDDING_MODEL} in Local models setup (semantic search).`
              : ''
          console.error(LOG, 'local embed failed:', localEmb.error)
          setSession((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: `⚠️ Could not embed query: ${localEmb.error}.${hint}` }
                : m
            ),
          }))
          setIsLoading(false)
          return
        }
        queryVector = localEmb.embedding
      } else {
        const embedRes = await serverFetchJson<{ embeddings: number[][]; dimension: number }>(
          '/api/embeddings',
          { method: 'POST', body: { texts: [trimmedQuery] } }
        )

        if (!embedRes.ok) {
          console.error(LOG, 'embedding failed:', embedRes.message)
          setSession((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: `⚠️ Could not embed query: ${embedRes.message}` }
                : m
            ),
          }))
          setIsLoading(false)
          return
        }

        queryVector = embedRes.data.embeddings[0]
      }

      if (queryVector.length !== EMBEDDING_DIMENSION) {
        console.warn(LOG, `embed dim ${queryVector.length} !== LanceDB schema ${EMBEDDING_DIMENSION}`)
        setSession((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `⚠️ Embedding size (${queryVector.length}) does not match your note index (${EMBEDDING_DIMENSION}). Use the same embedding model as indexing.`,
                }
              : m
          ),
        }))
        setIsLoading(false)
        return
      }

      console.info(LOG, `[1/4] embed OK — dim=${queryVector.length}, sample=[${queryVector.slice(0, 3).map(v => v.toFixed(4)).join(', ')}]`)

      const existingNoteIds = new Set(notes.map((n) => n.id))

      // -----------------------------------------------------------------------
      // 1b. Chunks for @-mentioned notes / workspaces (explicit context)
      // -----------------------------------------------------------------------
      let mentionSources: ChatSource[] = []
      if (explicitNoteIds.length > 0 || explicitWorkspaceIds.length > 0) {
        const seenMention = new Set<string>()
        for (const nid of explicitNoteIds) {
          if (!existingNoteIds.has(nid)) continue
          const note = notes.find((n) => n.id === nid)
          const filterSql = `note_id = '${sqlEscapeLiteral(nid)}'`
          const res = await window.api.embeddings?.vectorSearch({
            queryVector,
            limit: 8,
            filterSql,
          })
          if (!res?.ok) continue
          for (const row of res.rows) {
            const key = `${nid}:${String(row.text ?? '').slice(0, 40)}`
            if (seenMention.has(key)) continue
            seenMention.add(key)
            mentionSources.push({
              noteId: nid,
              noteTitle: note?.title ?? 'Untitled',
              workspaceId: String(row.workspace_id ?? ''),
              chunkText: String(row.text ?? ''),
            })
          }
        }
        for (const wid of explicitWorkspaceIds) {
          const filterSql = `workspace_id = '${sqlEscapeLiteral(wid)}'`
          const res = await window.api.embeddings?.vectorSearch({
            queryVector,
            limit: 12,
            filterSql,
          })
          if (!res?.ok) continue
          for (const row of res.rows) {
            const noteId = String(row.note_id ?? '')
            if (!existingNoteIds.has(noteId)) continue
            const note = notes.find((n) => n.id === noteId)
            const key = `${noteId}:${String(row.text ?? '').slice(0, 40)}`
            if (seenMention.has(key)) continue
            seenMention.add(key)
            mentionSources.push({
              noteId,
              noteTitle: note?.title ?? 'Untitled',
              workspaceId: String(row.workspace_id ?? ''),
              chunkText: String(row.text ?? ''),
            })
          }
        }
        console.info(
          LOG,
          `[1b/4] @-mention context — ${mentionSources.length} chunk(s) from ${explicitNoteIds.length} note(s), ${explicitWorkspaceIds.length} workspace(s)`,
        )
      }

      // -----------------------------------------------------------------------
      // 2. Vector search in LanceDB
      // -----------------------------------------------------------------------
      const filterParts: string[] = []
      if (filterWorkspaceId) {
        filterParts.push(`workspace_id = '${sqlEscapeLiteral(filterWorkspaceId)}'`)
      }

      console.info(LOG, `[2/4] notes in memory: ${notes.length}`)
      notes.slice(0, 15).forEach((n, i) => {
        console.info(LOG, `  notes[${i}] id="${n.id}" title="${n.title}" folderId="${n.folderId}"`)
      })
      if (notes.length > 15) console.info(LOG, `  … and ${notes.length - 15} more`)

      const filterSql = filterParts.length ? filterParts.join(' AND ') : undefined
      console.info(LOG, `[2/4] RAG vectorSearch — limit=5, filterSql=${filterSql ?? '(none)'}`)
      const searchRes = await window.api.embeddings?.vectorSearch({
        queryVector,
        limit: 5,
        filterSql,
      })
      console.info(LOG, '[2/4] raw LanceDB rows:', searchRes)

      let ragSources: ChatSource[] = []
      if (searchRes?.ok) {
        console.info(LOG, `[2/4] ${searchRes.rows.length} row(s) returned from LanceDB`)
        ragSources = searchRes.rows
          .map((row, i) => {
            const noteId = String(row.note_id ?? '')
            const note = notes.find((n) => n.id === noteId)
            const textPreview = String(row.text ?? '').slice(0, 100).replace(/\n/g, '↵')
            console.info(
              LOG,
              `  row[${i}] note_id="${noteId}" workspace_id="${row.workspace_id}"`,
              `distance=${row._distance} chunk_index=${row.chunk_index}`,
              `text_len=${String(row.text ?? '').length} text="${textPreview}"`,
              note ? `→ matched: "${note.title}"` : `→ NOT FOUND in notes array`,
            )
            return {
              noteId,
              noteTitle: note?.title ?? 'Untitled',
              workspaceId: String(row.workspace_id ?? ''),
              chunkText: String(row.text ?? ''),
            }
          })
          // Drop chunks for deleted notes (stale index rows or races with LanceDB delete).
          .filter((s) => existingNoteIds.has(s.noteId))
      } else {
        console.warn(LOG, '[2/4] vector search failed or unavailable:', searchRes)
      }

      // @-mention chunks first, then RAG hits (dedup by noteId + chunk prefix)
      {
        const merged: ChatSource[] = []
        const seen = new Set<string>()
        for (const s of [...mentionSources, ...ragSources]) {
          const key = `${s.noteId}:${s.chunkText.slice(0, 30)}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(s)
        }
        ragSources = merged
      }

      // allSources = all chunks passed to the AI for context (full detail)
      const allSources = ragSources

      // uniqueSources = deduplicated by noteId for the "Used N sources" display
      const uniqueSources = allSources.filter(
        (s, i, arr) => arr.findIndex((x) => x.noteId === s.noteId) === i
      )
      console.info(LOG, `[2/4] ${allSources.length} chunk(s) → ${uniqueSources.length} unique note(s)`)

      // -----------------------------------------------------------------------
      // 3. Build context for the AI (all chunks, not deduplicated)
      // -----------------------------------------------------------------------
      const contextChunks = allSources.map(
        (s) => `[Source: "${s.noteTitle}"]\n${s.chunkText}`
      )

      console.info(LOG, `[3/4] context — ${contextChunks.length} chunk(s):`)
      contextChunks.forEach((c, i) => {
        console.info(LOG, `  context[${i}] (${c.length} chars): "${c.slice(0, 150).replace(/\n/g, '↵')}"`)
      })

      // -----------------------------------------------------------------------
      // 4. Build message history for the API (last 10 messages, no sources)
      // -----------------------------------------------------------------------
      const historyForApi = session.messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }))
      historyForApi.push({ role: 'user' as const, content: trimmedQuery })

      console.info(LOG, `[4/4] POST /api/chat — ${historyForApi.length} message(s), ${contextChunks.length} context chunk(s)`)
      historyForApi.forEach((m, i) => {
        console.info(LOG, `  msg[${i}] [${m.role}]: "${m.content.slice(0, 80)}"`)
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
        console.error(LOG, `[4/4] stream error after ${chunkCount} chunk(s):`, msg)
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
        console.info(LOG, `[4/4] streaming from local Ollama — model="${ollamaModelName}"`)

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
              console.info(
                LOG,
                `[4/4] Ollama stream done — ${chunkCount} tokens, ${accumulatedContent.length} chars`
              )
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
          console.error(LOG, 'streamFetch not available')
          setIsLoading(false)
          return
        }

        const baseUrl = (import.meta.env.VITE_AUTH_URL?.trim() ?? '').replace(/\/$/, '')
        if (!baseUrl) {
          console.error(LOG, 'VITE_AUTH_URL not set')
          setIsLoading(false)
          return
        }

        let rawBuffer = ''
        console.info(LOG, `[4/4] starting stream from ${baseUrl}/api/chat`)

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
              console.debug(LOG, `  SSE raw chunk[${chunkCount}] (${chunk.length} bytes): ${JSON.stringify(chunk.slice(0, 120))}`)
              rawBuffer += chunk
              const { tokens } = parseSSEChunks(rawBuffer)
              const lastNewline = rawBuffer.lastIndexOf('\n')
              if (lastNewline >= 0) {
                rawBuffer = rawBuffer.slice(lastNewline + 1)
              }
              if (tokens.length > 0) {
                console.debug(LOG, `  SSE tokens[${chunkCount}]:`, tokens)
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
              console.info(LOG, `[4/4] stream ended — ${chunkCount} chunk(s), ${accumulatedContent.length} chars total`)
              console.info(LOG, `[4/4] final response preview: "${accumulatedContent.slice(0, 200)}"`)
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
      console.info(LOG, 'persisting session to disk before new chat:', session.id)
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
          console.info(LOG, 'session written to disk OK')
        } else {
          console.warn(LOG, 'failed to write session:', res.error)
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
    console.info(LOG, 'started new chat session:', fresh.id)
  }, [session])

  // ---------------------------------------------------------------------------
  // loadHistorySession — load a past session back into the view (read-only)
  // ---------------------------------------------------------------------------

  const loadHistorySession = useCallback(
    async (meta: ChatHistoryMeta) => {
      console.info(LOG, 'loading history session from disk:', meta.sessionId)
      const chatHistoryApi = window.api.chatHistory
      if (!chatHistoryApi) return

      const res = await chatHistoryApi.read(meta.sessionId)
      if (!res.ok) {
        console.warn(LOG, 'failed to read session:', res.error)
        return
      }

      // Parse the markdown back into messages (simplified — reconstruct from meta)
      // We create a read-only session view with a flag; for now we just show
      // a reconstructed session with a marker that it's from history.
      const reconstructed: ChatSession = {
        id: meta.sessionId,
        title: meta.title,
        createdAt: meta.createdAt,
        messages: [
          {
            id: 'history-note',
            role: 'assistant',
            content: `*This is a saved chat session from ${new Date(meta.createdAt).toLocaleString()}.*\n\n${res.content.slice(0, 2000)}`,
            timestamp: meta.createdAt,
          },
        ],
      }
      setSession(reconstructed)
      setShowHistory(false)
    },
    []
  )

  // ---------------------------------------------------------------------------
  // Refresh history meta from disk on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const chatHistoryApi = window.api.chatHistory
    if (!chatHistoryApi) return
    void chatHistoryApi.list().then((res) => {
      if (res.ok) {
        console.info(LOG, `loaded ${res.sessions.length} session(s) from disk`)
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

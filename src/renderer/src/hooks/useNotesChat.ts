import { useCallback, useEffect, useRef, useState } from 'react'
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
// Cloudflare Workers AI streams: `data: {"response":"..."}\n\n` ... `data: [DONE]\n\n`
// ---------------------------------------------------------------------------

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
    try {
      const obj = JSON.parse(payload) as { response?: string }
      if (typeof obj.response === 'string') tokens.push(obj.response)
    } catch {
      /* partial chunk, ignore */
    }
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
}

export type UseNotesChatResult = {
  session: ChatSession
  historyMeta: ChatHistoryMeta[]
  isLoading: boolean
  filterWorkspaceId: string | null
  setFilterWorkspaceId: (id: string | null) => void
  includeCurrentNote: boolean
  setIncludeCurrentNote: (v: boolean) => void
  showHistory: boolean
  setShowHistory: (v: boolean) => void
  sendMessage: (query: string) => Promise<void>
  newChat: () => Promise<void>
  loadHistorySession: (meta: ChatHistoryMeta) => Promise<void>
}

export function useNotesChat({
  notes,
  selectedNote,
}: UseNotesChatOptions): UseNotesChatResult {
  const [session, setSession] = useState<ChatSession>(loadCurrentSession)
  const [historyMeta, setHistoryMeta] = useState<ChatHistoryMeta[]>(loadHistoryMeta)
  const [isLoading, setIsLoading] = useState(false)
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string | null>(null)
  const [includeCurrentNote, setIncludeCurrentNote] = useState(false)
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
    async (query: string) => {
      if (!query.trim() || isLoading) return

      const trimmedQuery = query.trim()
      console.info(LOG, 'sendMessage', `"${trimmedQuery.slice(0, 60)}"`)

      // Cancel any in-flight stream
      abortRef.current = true
      streamCleanupRef.current?.()
      abortRef.current = false

      const userMsg: ChatMessage = {
        id: newSessionId(),
        role: 'user',
        content: trimmedQuery,
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
      // 1. Embed the query
      // -----------------------------------------------------------------------
      console.info(LOG, 'embedding query…')
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

      const queryVector = embedRes.data.embeddings[0]
      console.info(LOG, `[1/4] embed OK — dim=${queryVector.length}, sample=[${queryVector.slice(0, 3).map(v => v.toFixed(4)).join(', ')}]`)

      // -----------------------------------------------------------------------
      // 2. Vector search in LanceDB
      // -----------------------------------------------------------------------
      const filterParts: string[] = []
      if (filterWorkspaceId) {
        filterParts.push(`workspace_id = '${filterWorkspaceId}'`)
      }

      console.info(LOG, `[2/4] notes in memory: ${notes.length}`)
      notes.slice(0, 15).forEach((n, i) => {
        console.info(LOG, `  notes[${i}] id="${n.id}" title="${n.title}" folderId="${n.folderId}"`)
      })
      if (notes.length > 15) console.info(LOG, `  … and ${notes.length - 15} more`)

      // Fetch current note chunks separately if toggle is on
      let currentNoteChunks: ChatSource[] = []
      if (includeCurrentNote && selectedNote) {
        console.info(LOG, `[2/4] fetching current note chunks — note_id="${selectedNote.id}"`)
        const currentNoteRes = await window.api.embeddings?.vectorSearch({
          queryVector,
          limit: 8,
          filterSql: `note_id = '${selectedNote.id}'`,
        })
        console.info(LOG, '[2/4] current note vectorSearch response:', currentNoteRes)
        if (currentNoteRes?.ok) {
          currentNoteChunks = currentNoteRes.rows.map((row) => ({
            noteId: selectedNote.id,
            noteTitle: selectedNote.title,
            workspaceId: String(row.workspace_id ?? ''),
            chunkText: String(row.text ?? ''),
          }))
          console.info(LOG, `[2/4] ${currentNoteChunks.length} chunk(s) from current note`)
        } else {
          console.warn(LOG, '[2/4] current note search unavailable:', currentNoteRes)
        }
      }

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
        ragSources = searchRes.rows.map((row, i) => {
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
      } else {
        console.warn(LOG, '[2/4] vector search failed or unavailable:', searchRes)
      }

      // Merge current note chunks (dedup by noteId+text prefix)
      const seen = new Set(ragSources.map((s) => `${s.noteId}:${s.chunkText.slice(0, 30)}`))
      for (const s of currentNoteChunks) {
        const key = `${s.noteId}:${s.chunkText.slice(0, 30)}`
        if (!seen.has(key)) {
          ragSources.unshift(s)
          seen.add(key)
        }
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

      if (includeCurrentNote && selectedNote && currentNoteChunks.length === 0) {
        // Note not indexed yet — add title as a hint
        contextChunks.unshift(`[Currently open note: "${selectedNote.title}"]`)
        console.info(LOG, '[3/4] current note not indexed yet — added title hint to context')
      }

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
      // 5. Stream from /api/chat
      // -----------------------------------------------------------------------
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

      let accumulatedContent = ''
      let rawBuffer = '' // buffer for partial SSE lines
      let chunkCount = 0

      console.info(LOG, `[4/4] starting stream from ${baseUrl}/api/chat`)

      const cleanup = streamFetch(
        `${baseUrl}/api/chat`,
        {
          method: 'POST',
          body: JSON.stringify({ messages: historyForApi, contextChunks }),
        },
        {
          onChunk: (chunk: string) => {
            if (abortRef.current) return
            chunkCount++
            console.debug(LOG, `  SSE raw chunk[${chunkCount}] (${chunk.length} bytes): ${JSON.stringify(chunk.slice(0, 120))}`)
            rawBuffer += chunk
            const { tokens } = parseSSEChunks(rawBuffer)
            // Only consume complete lines (keep trailing partial line in buffer)
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
            // Finalize: attach sources to the assistant message
            setSession((prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === assistantId ? { ...m, sources: uniqueSources, content: accumulatedContent } : m
              ),
            }))
            setIsLoading(false)
            streamCleanupRef.current = null
          },
          onError: (msg: string) => {
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
          },
        }
      )

      streamCleanupRef.current = cleanup
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoading, filterWorkspaceId, includeCurrentNote, selectedNote, notes, session.messages]
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
    includeCurrentNote,
    setIncludeCurrentNote,
    showHistory,
    setShowHistory,
    sendMessage,
    newChat,
    loadHistorySession,
  }
}

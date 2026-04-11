import { ipcRenderer } from 'electron'

export type ChatSourceMeta = {
  note: string
  title: string
  folder: string
  chunkText: string
  score?: number
  source?: string
}

export type ChainOfThoughtsMeta = {
  stage: string
  mode: string
  seedNotes: string[]
  connectedNotes: string[]
  finalNotes: string[]
}

export type ChatHistoryMessagePayload = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sources?: ChatSourceMeta[]
  chainOfThoughts?: ChainOfThoughtsMeta
}

export const chatHistoryApi = {
  write: (payload: {
    sessionId: string
    title: string
    createdAt: number
    messages: ChatHistoryMessagePayload[]
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('chat-history:write', payload),
  list: (): Promise<
    | {
        ok: true
        sessions: { sessionId: string; title: string; createdAt: number; messageCount: number }[]
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('chat-history:list'),
  read: (
    sessionId: string
  ): Promise<{ ok: true; content: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('chat-history:read', sessionId),
  readSession: (
    sessionId: string
  ): Promise<
    | {
        ok: true
        session: {
          sessionId: string
          title: string
          createdAt: number
          messages: ChatHistoryMessagePayload[]
        }
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('chat-history:read-session', sessionId)
}

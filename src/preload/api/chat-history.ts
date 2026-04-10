import { ipcRenderer } from 'electron'

export const chatHistoryApi = {
  write: (payload: {
    sessionId: string
    title: string
    createdAt: number
    messages: { role: 'user' | 'assistant'; content: string; timestamp: number }[]
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('chat-history:write', payload),
  list: (): Promise<
    | { ok: true; sessions: { sessionId: string; title: string; createdAt: number; messageCount: number }[] }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('chat-history:list'),
  read: (sessionId: string): Promise<
    | { ok: true; content: string }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('chat-history:read', sessionId),
  readSession: (sessionId: string): Promise<
    | {
        ok: true
        session: {
          sessionId: string
          title: string
          createdAt: number
          messages: { role: 'user' | 'assistant'; content: string; timestamp: number }[]
        }
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('chat-history:read-session', sessionId),
}

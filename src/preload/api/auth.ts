import { ipcRenderer } from 'electron'

import { createRequestId, subscribeScoped } from './ipc'

export const authApi = {
  getSession: (): Promise<unknown> => ipcRenderer.invoke('auth:get-session'),
  signInWithGithub: (): Promise<{ user: unknown }> => ipcRenderer.invoke('auth:sign-in-github'),
  signOut: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('auth:sign-out'),
  fetch: (
    url: string,
    init?: {
      method?: string
      body?: string
      headers?: Record<string, string>
    }
  ): Promise<{ ok: boolean; status: number; body: string }> =>
    ipcRenderer.invoke('auth:fetch', url, init),
  streamFetch: (
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> },
    callbacks: {
      onChunk: (chunk: string) => void
      onEnd: () => void
      onError: (message: string) => void
    }
  ): (() => void) => {
    const requestId = createRequestId()

    const cleanup = subscribeScoped(requestId, {
      'auth:stream:chunk': (chunk) => callbacks.onChunk(String(chunk)),
      'auth:stream:end': () => {
        cleanup()
        callbacks.onEnd()
      },
      'auth:stream:error': (message) => {
        cleanup()
        callbacks.onError(String(message))
      },
    })

    ipcRenderer.send('auth:stream', requestId, url, init)
    return cleanup
  },
}

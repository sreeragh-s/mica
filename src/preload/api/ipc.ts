import { ipcRenderer } from 'electron'

export function createRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function subscribe(channel: string, listener: (...args: unknown[]) => void): () => void {
  const handler = (_event: unknown, ...args: unknown[]): void => {
    listener(...args)
  }

  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

export function subscribeScoped(
  requestId: string,
  handlers: Record<string, (...args: unknown[]) => void>
): () => void {
  const cleanups = Object.entries(handlers).map(([channel, listener]) =>
    subscribe(channel, (rid: unknown, ...args: unknown[]) => {
      if (rid === requestId) {
        listener(...args)
      }
    })
  )

  return () => {
    cleanups.forEach((cleanup) => cleanup())
  }
}

/**
 * Ollama IPC handlers — manages the bundled Ollama binary via electron-ollama.
 *
 * Channels exposed:
 *   ollama:get-status         → { running, downloaded, version | null }
 *   ollama:download           → streams progress events + final ok/error
 *   ollama:start              → starts the Ollama server process
 *   ollama:stop               → stops the server
 *   ollama:list-models        → lists locally pulled models via Ollama REST API
 *   ollama:pull-model         → pulls a model (streams progress)
 *   ollama:delete-model       → removes a local model
 *   ollama:embed              → POST /api/embed (single string)
 *   ollama:embed-batch        → POST /api/embed (multiple strings, indexing)
 */

import { app, ipcMain, type IpcMainEvent } from 'electron'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Singleton setup
// ---------------------------------------------------------------------------

let eoInstance: import('electron-ollama').ElectronOllama | null = null
const OLLAMA_HOST = 'http://127.0.0.1:11434'

/** Per-request abort for `ollama:chat-stream` (renderer cleanup / new message). */
const chatStreamAbortByRequestId = new Map<string, AbortController>()

async function getEO(): Promise<import('electron-ollama').ElectronOllama> {
  if (!eoInstance) {
    const { ElectronOllama } = await import('electron-ollama')
    eoInstance = new ElectronOllama({
      basePath: join(app.getPath('userData'), 'ollama'),
    })
  }
  return eoInstance
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ollamaFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${OLLAMA_HOST}${path}`, init)
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerOllamaIpc(): void {
  // ------------------------------------------------------------------
  // ollama:get-status
  // ------------------------------------------------------------------
  ipcMain.handle('ollama:get-status', async () => {
    try {
      const eo = await getEO()
      const running = await eo.isRunning()
      const versions = await eo.downloadedVersions().catch(() => [])
      const downloaded = versions.length > 0
      const version = versions[0] ?? null
      return { ok: true as const, running, downloaded, version }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  // ------------------------------------------------------------------
  // ollama:download  (streams progress via IPC events)
  // ------------------------------------------------------------------
  ipcMain.on('ollama:download', async (event: IpcMainEvent, requestId: string) => {
    const send = (channel: string, ...args: unknown[]): void => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, requestId, ...args)
    }
    try {
      const eo = await getEO()
      const metadata = await eo.getMetadata('latest')
      const already = await eo.isDownloaded(metadata.version).catch(() => false)
      if (already) {
        send('ollama:download:progress', 100, 'Already downloaded')
        send('ollama:download:end', metadata.version)
        return
      }
      await eo.download('latest', undefined, {
        log: (percent, message) => {
          send('ollama:download:progress', percent, message)
        },
      })
      send('ollama:download:progress', 100, 'Download complete')
      send('ollama:download:end', metadata.version)
    } catch (err) {
      send('ollama:download:error', String(err))
    }
  })

  // ------------------------------------------------------------------
  // ollama:start
  // ------------------------------------------------------------------
  ipcMain.handle('ollama:start', async () => {
    try {
      const eo = await getEO()
      if (await eo.isRunning()) return { ok: true as const, alreadyRunning: true }
      const versions = await eo.downloadedVersions()
      if (versions.length === 0) return { ok: false as const, error: 'Ollama not downloaded yet' }
      await eo.serve(versions[0] as `v${number}.${number}.${number}`, {
        serverLog: (msg) => console.log('[Ollama]', msg),
      })
      return { ok: true as const, alreadyRunning: false }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  // ------------------------------------------------------------------
  // ollama:stop
  // ------------------------------------------------------------------
  ipcMain.handle('ollama:stop', async () => {
    try {
      const eo = await getEO()
      const srv = eo.getServer()
      if (srv) {
        await srv.stop()
      }
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  // ------------------------------------------------------------------
  // ollama:list-models
  // ------------------------------------------------------------------
  ipcMain.handle('ollama:list-models', async () => {
    try {
      const res = await ollamaFetch('/api/tags')
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` }
      const data = (await res.json()) as { models: OllamaLocalModel[] }
      return { ok: true as const, models: data.models ?? [] }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  // ------------------------------------------------------------------
  // ollama:pull-model  (streams progress)
  // ------------------------------------------------------------------
  ipcMain.on('ollama:pull-model', async (event: IpcMainEvent, requestId: string, modelName: string) => {
    const send = (channel: string, ...args: unknown[]): void => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, requestId, ...args)
    }
    try {
      const res = await ollamaFetch('/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      })
      if (!res.ok || !res.body) {
        send('ollama:pull-model:error', `HTTP ${res.status}`)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const obj = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string }
            if (obj.error) {
              send('ollama:pull-model:error', obj.error)
              return
            }
            send('ollama:pull-model:progress', obj.status ?? '', obj.completed ?? 0, obj.total ?? 0)
          } catch {
            /* skip malformed line */
          }
        }
      }
      send('ollama:pull-model:end')
    } catch (err) {
      send('ollama:pull-model:error', String(err))
    }
  })

  // ------------------------------------------------------------------
  // ollama:delete-model
  // ------------------------------------------------------------------
  ipcMain.handle('ollama:delete-model', async (_event, modelName: string) => {
    try {
      const res = await ollamaFetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      })
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` }
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  // ------------------------------------------------------------------
  // ollama:embed — POST /api/embed (avoids cloud /api/embeddings when using local chat)
  // ------------------------------------------------------------------
  ipcMain.handle(
    'ollama:embed',
    async (_event, payload: { model: string; input: string }) => {
      try {
        const res = await ollamaFetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: payload.model, input: payload.input }),
        })
        const text = await res.text()
        if (!res.ok) {
          let msg = text
          try {
            const j = JSON.parse(text) as { error?: string }
            if (typeof j.error === 'string') msg = j.error
          } catch {
            /* raw */
          }
          return { ok: false as const, error: msg || `HTTP ${res.status}` }
        }
        const data = JSON.parse(text) as { embeddings?: number[][] }
        const vec = data.embeddings?.[0]
        if (!Array.isArray(vec) || vec.length === 0) {
          return { ok: false as const, error: 'Ollama returned no embedding vector' }
        }
        return { ok: true as const, embedding: vec }
      } catch (err) {
        return { ok: false as const, error: String(err) }
      }
    }
  )

  // ------------------------------------------------------------------
  // ollama:embed-batch — POST /api/embed with input: string[] (note indexing batches)
  // ------------------------------------------------------------------
  ipcMain.handle(
    'ollama:embed-batch',
    async (_event, payload: { model: string; inputs: string[] }) => {
      if (payload.inputs.length === 0) {
        return { ok: true as const, embeddings: [] as number[][] }
      }
      try {
        const res = await ollamaFetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: payload.model, input: payload.inputs }),
        })
        const text = await res.text()
        if (!res.ok) {
          let msg = text
          try {
            const j = JSON.parse(text) as { error?: string }
            if (typeof j.error === 'string') msg = j.error
          } catch {
            /* raw */
          }
          return { ok: false as const, error: msg || `HTTP ${res.status}` }
        }
        const data = JSON.parse(text) as { embeddings?: number[][] }
        const embs = data.embeddings
        if (!Array.isArray(embs) || embs.length !== payload.inputs.length) {
          return {
            ok: false as const,
            error: `Ollama returned ${embs?.length ?? 0} embeddings for ${payload.inputs.length} input(s)`,
          }
        }
        for (let i = 0; i < embs.length; i++) {
          if (!Array.isArray(embs[i]) || embs[i].length === 0) {
            return { ok: false as const, error: `Ollama returned empty vector at index ${i}` }
          }
        }
        return { ok: true as const, embeddings: embs }
      } catch (err) {
        return { ok: false as const, error: String(err) }
      }
    }
  )

  // ------------------------------------------------------------------
  // ollama:chat-stream — stream /api/chat from main (avoids renderer CORS to localhost)
  // Events: ollama:chat-stream:chunk | end | error
  // ------------------------------------------------------------------
  ipcMain.on('ollama:chat-stream:cancel', (_event, requestId: string) => {
    chatStreamAbortByRequestId.get(requestId)?.abort()
    chatStreamAbortByRequestId.delete(requestId)
  })

  ipcMain.on('ollama:chat-stream', (event, requestId: string, bodyJson: string) => {
    const prev = chatStreamAbortByRequestId.get(requestId)
    prev?.abort()
    const ac = new AbortController()
    chatStreamAbortByRequestId.set(requestId, ac)

    const sendError = (msg: string): void => {
      chatStreamAbortByRequestId.delete(requestId)
      if (!event.sender.isDestroyed()) {
        event.sender.send('ollama:chat-stream:error', requestId, msg)
      }
    }

    void (async () => {
      try {
        const res = await ollamaFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson),
          signal: ac.signal,
        })
        if (!res.ok || !res.body) {
          sendError(`Ollama returned HTTP ${res.status}`)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          if (!event.sender.isDestroyed()) {
            event.sender.send('ollama:chat-stream:chunk', requestId, text)
          }
        }
        chatStreamAbortByRequestId.delete(requestId)
        if (!event.sender.isDestroyed()) {
          event.sender.send('ollama:chat-stream:end', requestId)
        }
      } catch (err) {
        chatStreamAbortByRequestId.delete(requestId)
        if (err instanceof Error && err.name === 'AbortError') return
        const msg = err instanceof Error ? err.message : String(err)
        sendError(msg)
      }
    })()
  })

  // Graceful cleanup when Electron quits
  app.on('before-quit', () => {
    try {
      void eoInstance?.getServer()?.stop()
    } catch {
      /* ignore */
    }
  })
}

// ---------------------------------------------------------------------------
// Shared type (mirrored in preload/index.d.ts)
// ---------------------------------------------------------------------------
export type OllamaLocalModel = {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details?: {
    format?: string
    family?: string
    parameter_size?: string
    quantization_level?: string
  }
}

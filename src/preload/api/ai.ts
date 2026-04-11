import { ipcRenderer } from 'electron'

import { createRequestId, subscribeScoped } from './ipc'

type OllamaLocalModel = {
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

export const ollamaApi = {
  getStatus: (): Promise<
    | { ok: true; running: boolean; downloaded: boolean; version: string | null }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('ollama:get-status'),
  download: (callbacks: {
    onProgress: (percent: number, message: string) => void
    onEnd: (version: string) => void
    onError: (message: string) => void
  }): (() => void) => {
    const requestId = createRequestId()
    const cleanup = subscribeScoped(requestId, {
      'ollama:download:progress': (percent, message) =>
        callbacks.onProgress(Number(percent), String(message)),
      'ollama:download:end': (version) => {
        cleanup()
        callbacks.onEnd(String(version))
      },
      'ollama:download:error': (message) => {
        cleanup()
        callbacks.onError(String(message))
      }
    })

    ipcRenderer.send('ollama:download', requestId)
    return cleanup
  },
  start: (): Promise<{ ok: true; alreadyRunning: boolean } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ollama:start'),
  stop: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ollama:stop'),
  listModels: (): Promise<
    { ok: true; models: OllamaLocalModel[] } | { ok: false; error: string }
  > => ipcRenderer.invoke('ollama:list-models'),
  pullModel: (
    modelName: string,
    callbacks: {
      onProgress: (status: string, completed: number, total: number) => void
      onEnd: () => void
      onError: (message: string) => void
    }
  ): (() => void) => {
    const requestId = createRequestId()
    const cleanup = subscribeScoped(requestId, {
      'ollama:pull-model:progress': (status, completed, total) =>
        callbacks.onProgress(String(status), Number(completed), Number(total)),
      'ollama:pull-model:end': () => {
        cleanup()
        callbacks.onEnd()
      },
      'ollama:pull-model:error': (message) => {
        cleanup()
        callbacks.onError(String(message))
      }
    })

    ipcRenderer.send('ollama:pull-model', requestId, modelName)
    return cleanup
  },
  deleteModel: (modelName: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ollama:delete-model', modelName),
  embed: (payload: {
    model: string
    input: string
  }): Promise<{ ok: true; embedding: number[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ollama:embed', payload),
  embedBatch: (payload: {
    model: string
    inputs: string[]
  }): Promise<{ ok: true; embeddings: number[][] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ollama:embed-batch', payload),
  chatStream: (
    bodyJson: string,
    callbacks: {
      onChunk: (chunk: string) => void
      onEnd: () => void
      onError: (message: string) => void
    }
  ): (() => void) => {
    const requestId = createRequestId()
    const cleanup = subscribeScoped(requestId, {
      'ollama:chat-stream:chunk': (chunk) => callbacks.onChunk(String(chunk)),
      'ollama:chat-stream:end': () => {
        cleanup()
        callbacks.onEnd()
      },
      'ollama:chat-stream:error': (message) => {
        cleanup()
        callbacks.onError(String(message))
      }
    })

    ipcRenderer.send('ollama:chat-stream', requestId, bodyJson)
    return () => {
      cleanup()
      ipcRenderer.send('ollama:chat-stream:cancel', requestId)
    }
  }
}

export const embeddingsApi = {
  getStatus: (payload: {
    workspacePath: string
  }): Promise<
    | { ok: true; indexPath: string; indexExists: boolean; documents: number; chunks: number }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('embeddings:get-status', payload),
  ensureIndex: (payload: {
    workspacePath: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('embeddings:ensure-index', payload),
  getIndexedHashes: (payload: {
    workspacePath: string
  }): Promise<
    | { ok: true; hashes: Record<string, { contentHash: string; folder: string }> }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('embeddings:get-indexed-hashes', payload),
  upsertNoteDocument: (payload: {
    workspacePath: string
    folder: string
    note: string
    title: string
    kind: 'note' | 'drawing'
    contentHash: string
    text: string
    docType?: string
  }): Promise<{ ok: true; indexed: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke('embeddings:upsert-note-document', payload),
  searchDocuments: (payload: {
    workspacePath: string
    query: string
    maxDocuments?: number
    maxChunks?: number
    maxSections?: number
    maxTokens?: number
    filter?: Record<string, unknown>
    isBm25?: boolean
  }): Promise<
    | {
        ok: true
        rows: {
          note: string
          folder: string
          title: string
          kind: 'note' | 'drawing'
          text: string
          score: number
          uri: string
          section_index: number
          is_bm25: boolean
        }[]
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('embeddings:search-documents', payload),
  deleteNoteDocument: (payload: {
    workspacePath: string
    note: string
  }): Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }> =>
    ipcRenderer.invoke('embeddings:delete-note-document', payload),
  deleteWorkspaceDocuments: (payload: {
    workspacePath: string
    workspaceId: string
  }): Promise<
    { ok: true; deleted: boolean; deletedCount: number } | { ok: false; error: string }
  > => ipcRenderer.invoke('embeddings:delete-workspace-documents', payload),
  dumpIndex: (payload: {
    workspacePath: string
  }): Promise<
    | {
        ok: true
        indexPath: string
        documents: Record<string, unknown>[]
        totalDocuments: number
        totalChunks: number
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('embeddings:dump-index', payload)
}

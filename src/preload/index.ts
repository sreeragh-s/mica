import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  clipboard: {
    writeText: (text: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('clipboard:write-text', text),
  },
  auth: {
    getSession: (): Promise<unknown> => ipcRenderer.invoke('auth:get-session'),
    signInWithGithub: (): Promise<{ user: unknown }> =>
      ipcRenderer.invoke('auth:sign-in-github'),
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
    /**
     * Streaming fetch via SSE. Sends `auth:stream` to main, receives chunks via IPC events.
     * Returns a cleanup function to remove all listeners.
     */
    streamFetch: (
      url: string,
      init: { method?: string; body?: string; headers?: Record<string, string> },
      callbacks: {
        onChunk: (chunk: string) => void
        onEnd: () => void
        onError: (message: string) => void
      }
    ): (() => void) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

      const chunkHandler = (_: unknown, rid: string, chunk: string): void => {
        if (rid === requestId) callbacks.onChunk(chunk)
      }
      const endHandler = (_: unknown, rid: string): void => {
        if (rid === requestId) {
          cleanup()
          callbacks.onEnd()
        }
      }
      const errorHandler = (_: unknown, rid: string, msg: string): void => {
        if (rid === requestId) {
          cleanup()
          callbacks.onError(msg)
        }
      }

      ipcRenderer.on('auth:stream:chunk', chunkHandler)
      ipcRenderer.on('auth:stream:end', endHandler)
      ipcRenderer.on('auth:stream:error', errorHandler)

      function cleanup(): void {
        ipcRenderer.removeListener('auth:stream:chunk', chunkHandler)
        ipcRenderer.removeListener('auth:stream:end', endHandler)
        ipcRenderer.removeListener('auth:stream:error', errorHandler)
      }

      ipcRenderer.send('auth:stream', requestId, url, init)

      return cleanup
    },
  },
  chatHistory: {
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
  },
  workspace: {
    checkGit: (): Promise<
      | { ok: true; version: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:check-git'),
    ensureDataRoot: (): Promise<
      | {
          ok: true
          path: string
          gitAvailable: boolean
          filesystemOnly: boolean
        }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:ensure-data-root'),
    setSyncMode: (
      payload: { cwd: string; syncMode: 'git' | 'github_api' | 'local' }
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:set-sync-mode', payload),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('workspace:open-external', url),
    setGitRemote: (
      payload: { cwd: string; url: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:set-git-remote', payload),
    syncMarkdown: (payload: {
      cwd: string
      workspaceId: string
      files: { relativePath: string; content: string }[]
      pruneOrphanNoteFiles?: boolean
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:sync-markdown', payload),
    readNotelabIndex: (
      payload: { cwd: string }
    ): Promise<
      | {
          ok: true
          workspaces: { id: string; name: string }[]
          notes: {
            workspaceId: string
            noteId: string
            title: string
            updatedAtMs: number
            markdownBody: string
            kind: 'note' | 'drawing'
          }[]
        }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:read-notelab-index', payload),
    writeNoteFile: (payload: {
      cwd: string
      relativePath: string
      content: string
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:write-note-file', payload),
    deleteNoteFiles: (payload: {
      cwd: string
      workspaceId: string
      noteId: string
      exceptRelativePath?: string
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:delete-note-files', payload),
    deleteWorkspaceFolder: (payload: {
      cwd: string
      workspaceId: string
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:delete-workspace-folder', payload),
    gitStatus: (
      payload: { cwd: string }
    ): Promise<
      | { ok: true; dirty: boolean; porcelain: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:git-status', payload),
    gitCommit: (payload: {
      cwd: string
      message: string
      authorName: string
      authorEmail: string
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:git-commit', payload),
    gitPull: (
      payload: { cwd: string }
    ): Promise<
      | { ok: true; stdout: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:git-pull', payload),
    gitPush: (
      payload: { cwd: string }
    ): Promise<
      | { ok: true; stdout: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:git-push', payload),
    readAppConfig: (
      payload: { cwd: string }
    ): Promise<
      | { ok: true; content: string | null }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:read-app-config', payload),
    writeAppConfig: (payload: {
      cwd: string
      config: unknown
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:write-app-config', payload),
  },
  window: {
    setZenShortcutBinding: (
      binding: { mod: boolean; key?: string; code?: string } | null
    ): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('window:set-zen-shortcut-binding', binding),
    onZenShortcutFromMain: (callback: () => void): (() => void) => {
      const channel = 'notelab:zen-shortcut'
      const handler = (): void => {
        callback()
      }
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    },
    setZenPresentation: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('window:set-zen-presentation', enabled),
    onNativeFullScreenExit: (callback: () => void): (() => void) => {
      const channel = 'window:left-full-screen'
      const handler = (): void => {
        callback()
      }
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    },
    getLiquidGlassState: (): Promise<{ attached: boolean; glassSupported: boolean }> =>
      ipcRenderer.invoke('window:get-liquid-glass-state'),
    onLiquidGlassState: (
      callback: (state: { attached: boolean; glassSupported: boolean }) => void
    ): (() => void) => {
      const channel = 'notelab:liquid-glass-state'
      const handler = (
        _event: unknown,
        state: { attached: boolean; glassSupported: boolean }
      ): void => {
        callback(state)
      }
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    },
  },
  /**
   * LanceDB runs only in the main process; the renderer calls these via IPC.
   * Embed text in the renderer (or a future main-process pipeline), then send vectors here.
   */
  embeddings: {
    getStatus: (): Promise<
      | { ok: true; dbPath: string; tableExists: boolean }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('lancedb:get-status'),
    ensureTable: (): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('lancedb:ensure-table'),
    getIndexedHashes: (): Promise<
      | { ok: true; hashes: Record<string, { contentHash: string; workspaceId: string }> }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('lancedb:get-indexed-hashes'),
    indexNoteEmbeddings: (payload: {
      workspaceId: string
      noteId: string
      contentHash: string
      chunks: {
        id?: string
        chunkIndex: number
        text: string
        vector: number[] | Float32Array
      }[]
    }): Promise<
      { ok: true; indexed: number } | { ok: false; error: string }
    > => ipcRenderer.invoke('lancedb:index-note-embeddings', payload),
    vectorSearch: (payload: {
      queryVector: number[] | Float32Array
      limit?: number
      filterSql?: string
    }): Promise<
      | { ok: true; rows: Record<string, unknown>[] }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('lancedb:vector-search', payload),
    deleteNoteEmbeddings: (payload: {
      workspaceId: string
      noteId: string
    }): Promise<
      | { ok: true; deleted: boolean }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('lancedb:delete-note-embeddings', payload),
    deleteWorkspaceEmbeddings: (payload: {
      workspaceId: string
    }): Promise<
      | { ok: true; deleted: boolean }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('lancedb:delete-workspace-embeddings', payload),
    dumpTable: (): Promise<
      | { ok: true; rows: Record<string, unknown>[]; totalRows: number }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('lancedb:dump-table'),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error legacy
  window.electron = electronAPI
  // @ts-expect-error legacy
  window.api = api
}

import { ElectronAPI } from '@electron-toolkit/preload'

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

type ChatHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

type ChatHistoryMeta = {
  sessionId: string
  title: string
  createdAt: number
  messageCount: number
}

type NotelabApi = {
  auth: {
    getSession: () => Promise<
      | { ok: true; data: { session: unknown; user: unknown } | null }
      | { ok: false; error?: string }
    >
    signInWithGithub: () => Promise<{ user: unknown }>
    signOut: () => Promise<{ ok: boolean }>
    fetch?: (
      url: string,
      init?: {
        method?: string
        body?: string
        headers?: Record<string, string>
      }
    ) => Promise<{ ok: boolean; status: number; body: string }>
    streamFetch?: (
      url: string,
      init: { method?: string; body?: string; headers?: Record<string, string> },
      callbacks: {
        onChunk: (chunk: string) => void
        onEnd: () => void
        onError: (message: string) => void
      }
    ) => () => void
  }
  chatHistory?: {
    write: (payload: {
      sessionId: string
      title: string
      createdAt: number
      messages: ChatHistoryMessage[]
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    list: () => Promise<
      | { ok: true; sessions: ChatHistoryMeta[] }
      | { ok: false; error: string }
    >
    read: (sessionId: string) => Promise<
      | { ok: true; content: string }
      | { ok: false; error: string }
    >
    readSession: (sessionId: string) => Promise<
      | {
          ok: true
          session: {
            sessionId: string
            title: string
            createdAt: number
            messages: ChatHistoryMessage[]
          }
        }
      | { ok: false; error: string }
    >
  }
  workspace: {
    checkGit: () => Promise<
      | { ok: true; version: string }
      | { ok: false; error: string }
    >
    ensureDataRoot: (payload?: { path?: string }) => Promise<
      | {
          ok: true
          path: string
          configRoot: string
          gitAvailable: boolean
          filesystemOnly: boolean
          gitInitialized: boolean
        }
      | { ok: false; error: string }
    >
    pickDirectory: () => Promise<{ ok: true; path: string } | { ok: false; cancelled: true }>
    initGit: (payload: { cwd: string }) => Promise<{ ok: true } | { ok: false; error: string }>
    migrateWorkspace: (payload: {
      fromCwd: string
      toCwd: string
    }) => Promise<{ ok: true; copiedFiles: number } | { ok: false; error: string }>
    setSyncMode?: (payload: {
      cwd: string
      syncMode: 'git' | 'github_api' | 'local'
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    openExternal: (url: string) => Promise<void>
    setGitRemote: (payload: {
      cwd: string
      url: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    syncMarkdown: (payload: {
      cwd: string
      workspaceId: string
      files: { relativePath: string; content: string }[]
      pruneOrphanNoteFiles?: boolean
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    readNotelabIndex: (payload: {
      cwd: string
    }) => Promise<
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
            coverImageSrc?: string
            titleEmoji?: string
          }[]
        }
      | { ok: false; error: string }
    >
    writeNoteFile: (payload: {
      cwd: string
      relativePath: string
      content: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    deleteNoteFiles: (payload: {
      cwd: string
      workspaceId: string
      noteId: string
      exceptRelativePath?: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    deleteWorkspaceFolder: (payload: {
      cwd: string
      workspaceId: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitStatus: (payload: {
      cwd: string
    }) => Promise<
      | { ok: true; dirty: boolean; porcelain: string }
      | { ok: false; error: string }
    >
    gitCommit: (payload: {
      cwd: string
      message: string
      authorName: string
      authorEmail: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitPull: (payload: {
      cwd: string
    }) => Promise<
      | { ok: true; stdout: string }
      | { ok: false; error: string }
    >
    gitPush: (payload: {
      cwd: string
    }) => Promise<
      | { ok: true; stdout: string }
      | { ok: false; error: string }
    >
    gitFileStatuses?: (payload: { cwd: string }) => Promise<
      | {
          ok: true
          files: { path: string; x: string; y: string; staged: boolean; conflicted: boolean }[]
          hasConflicts: boolean
          isRebasing: boolean
        }
      | { ok: false; error: string }
    >
    gitDiffFile?: (payload: {
      cwd: string
      path: string
      staged?: boolean
    }) => Promise<{ ok: true; diff: string } | { ok: false; error: string }>
    gitConflictFile?: (payload: {
      cwd: string
      path: string
    }) => Promise<
      | { ok: true; content: string; ours: string; theirs: string; base: string }
      | { ok: false; error: string }
    >
    gitAcceptResolution?: (payload: {
      cwd: string
      path: string
      resolution: 'ours' | 'theirs' | 'content'
      content?: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitStageFile?: (payload: {
      cwd: string
      path: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitUnstageFile?: (payload: {
      cwd: string
      path: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitDiscardFile?: (payload: {
      cwd: string
      path: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitAbortRebase?: (payload: {
      cwd: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitContinueRebase?: (payload: {
      cwd: string
      authorName: string
      authorEmail: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    readAppConfig: (payload: {
      cwd: string
    }) => Promise<
      | { ok: true; content: string | null }
      | { ok: false; error: string }
    >
    writeAppConfig: (payload: {
      cwd: string
      config: unknown
    }) => Promise<{ ok: true } | { ok: false; error: string }>
  }
  ollama: {
    getStatus: () => Promise<
      | { ok: true; running: boolean; downloaded: boolean; version: string | null }
      | { ok: false; error: string }
    >
    download: (callbacks: {
      onProgress: (percent: number, message: string) => void
      onEnd: (version: string) => void
      onError: (message: string) => void
    }) => () => void
    start: () => Promise<
      | { ok: true; alreadyRunning: boolean }
      | { ok: false; error: string }
    >
    stop: () => Promise<{ ok: true } | { ok: false; error: string }>
    listModels: () => Promise<
      | { ok: true; models: OllamaLocalModel[] }
      | { ok: false; error: string }
    >
    pullModel: (
      modelName: string,
      callbacks: {
        onProgress: (status: string, completed: number, total: number) => void
        onEnd: () => void
        onError: (message: string) => void
      }
    ) => () => void
    deleteModel: (modelName: string) => Promise<{ ok: true } | { ok: false; error: string }>
    /** POST /api/embed for local query vectors (matches LanceDB bge-m3 index). */
    embed: (payload: {
      model: string
      input: string
    }) => Promise<
      | { ok: true; embedding: number[] }
      | { ok: false; error: string }
    >
    embedBatch: (payload: {
      model: string
      inputs: string[]
    }) => Promise<
      | { ok: true; embeddings: number[][] }
      | { ok: false; error: string }
    >
    /** Stream Ollama /api/chat via main (avoids CORS from the dev server origin). */
    chatStream: (
      bodyJson: string,
      callbacks: {
        onChunk: (chunk: string) => void
        onEnd: () => void
        onError: (message: string) => void
      }
    ) => () => void
  }
  embeddings: {
    getStatus: () => Promise<
      | { ok: true; dbPath: string; tableExists: boolean }
      | { ok: false; error: string }
    >
    ensureTable: () => Promise<{ ok: true } | { ok: false; error: string }>
    getIndexedHashes: () => Promise<
      | { ok: true; hashes: Record<string, { contentHash: string; workspaceId: string }> }
      | { ok: false; error: string }
    >
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
    }) => Promise<{ ok: true; indexed: number } | { ok: false; error: string }>
    vectorSearch: (payload: {
      queryVector: number[] | Float32Array
      limit?: number
      filterSql?: string
    }) => Promise<
      | { ok: true; rows: Record<string, unknown>[] }
      | { ok: false; error: string }
    >
    deleteNoteEmbeddings: (payload: {
      workspaceId: string
      noteId: string
    }) => Promise<
      | { ok: true; deleted: boolean }
      | { ok: false; error: string }
    >
    deleteWorkspaceEmbeddings: (payload: {
      workspaceId: string
    }) => Promise<
      | { ok: true; deleted: boolean }
      | { ok: false; error: string }
    >
    dumpTable: () => Promise<
      | { ok: true; rows: Record<string, unknown>[]; totalRows: number }
      | { ok: false; error: string }
    >
  }
  terminal?: {
    create: (opts?: { cwd?: string }) => Promise<{ ok: true } | { ok: false; error: string }>
    write: (data: string) => void
    resize: (cols: number, rows: number) => Promise<{ ok: true }>
    destroy: () => Promise<{ ok: true }>
    onData: (callback: (data: string) => void) => () => void
    onExit: (callback: () => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: NotelabApi
  }
}

export {}

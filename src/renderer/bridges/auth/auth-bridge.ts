export type AuthSessionPayload = { session: unknown; user: unknown } | null

export type EmbeddingsFilter = {
  $eq?: number | string | boolean
  $ne?: number | string | boolean
  $gt?: number
  $gte?: number
  $lt?: number
  $lte?: number
  $in?: Array<number | string>
  $nin?: Array<number | string>
  $and?: EmbeddingsFilter[]
  $or?: EmbeddingsFilter[]
  [key: string]: unknown
}

export type EmbeddingsSearchRow = {
  note: string
  folder: string
  title: string
  kind: 'note' | 'drawing'
  text: string
  score: number
  uri: string
  section_index: number
}

/** OS window chrome (Notelab); optional so browser dev still type-checks. */
export type NotelabWindowApi = {
  setZenShortcutBinding: (
    binding: { mod: boolean; key?: string; code?: string } | null
  ) => Promise<{ ok: boolean }>
  onZenShortcutFromMain: (callback: () => void) => () => void
  setZenPresentation: (enabled: boolean) => Promise<{ ok: boolean }>
  onNativeFullScreenExit: (callback: () => void) => () => void
}

export function getWindowApi(): NotelabWindowApi | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { api?: { window?: NotelabWindowApi } }
  return w.api?.window ?? null
}

export type NotelabApi = {
  window?: NotelabWindowApi
  clipboard?: {
    writeText: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>
  }
  auth: {
    getSession: () => Promise<
      { ok: true; data: AuthSessionPayload } | { ok: false; error?: string }
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
  workspace?: {
    checkGit?: () => Promise<{ ok: true; version: string } | { ok: false; error: string }>
    ensureDataRoot?: (payload?: { path?: string }) => Promise<
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
    pickDirectory?: () => Promise<{ ok: true; path: string } | { ok: false; cancelled: true }>
    initGit?: (payload: { cwd: string }) => Promise<{ ok: true } | { ok: false; error: string }>
    migrateWorkspace?: (payload: {
      fromCwd: string
      toCwd: string
    }) => Promise<{ ok: true; copiedFiles: number } | { ok: false; error: string }>
    createFolder?: (payload: {
      cwd: string
      folder: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    openExternal: (url: string) => Promise<void>
    setGitRemote: (payload: {
      cwd: string
      url: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitCheckConfig?: (payload: {
      cwd: string
    }) => Promise<
      | { ok: true; hasName: boolean; hasEmail: boolean; name: string | null; email: string | null }
      | { ok: false; error: string }
    >
    gitSetConfig?: (payload: {
      cwd: string
      name: string
      email: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    syncMarkdown: (payload: {
      cwd: string
      folder: string
      files: { relativePath: string; content: string }[]
      pruneOrphanNoteFiles?: boolean
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    searchNotes?: (payload: { cwd: string; query: string; limit?: number }) => Promise<
      | {
          ok: true
          hits: { notePath: string; lineNumber: number; lineText: string }[]
          engine: 'git-grep' | 'ripgrep'
        }
      | { ok: false; error: string }
    >
    readNotelabIndex: (payload: { cwd: string }) => Promise<
      | {
          ok: true
          folders: { folder: string; name: string }[]
          notes: {
            folder: string
            note: string
            title: string
            updatedAtMs: number
            markdownBody: string
            kind: 'note' | 'drawing'
            coverImageSrc?: string
            titleEmoji?: string
            properties?: Record<string, string | string[]>
            hasFrontmatterBlock?: boolean
          }[]
        }
      | { ok: false; error: string }
    >
    writeNoteFile: (payload: {
      cwd: string
      relativePath: string
      content: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    deleteNoteFile: (payload: {
      cwd: string
      note: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    renamePath?: (payload: {
      cwd: string
      from: string
      to: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    deleteFolder: (payload: {
      cwd: string
      folder: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    gitStatus: (payload: {
      cwd: string
    }) => Promise<
      | { ok: true; dirty: boolean; porcelain: string; remoteUrl: string | null }
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
    }) => Promise<{ ok: true; stdout: string } | { ok: false; error: string }>
    gitPush: (payload: {
      cwd: string
    }) => Promise<{ ok: true; stdout: string } | { ok: false; error: string }>
    gitFileStatuses?: (payload: { cwd: string }) => Promise<
      | {
          ok: true
          files: {
            path: string
            x: string
            y: string
            staged: boolean
            conflicted: boolean
          }[]
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
    readAppConfig?: (payload: {
      cwd: string
    }) => Promise<{ ok: true; content: string | null } | { ok: false; error: string }>
    writeAppConfig?: (payload: {
      cwd: string
      config: unknown
    }) => Promise<{ ok: true } | { ok: false; error: string }>
  }
  multiWindow?: {
    getSession: () => Promise<{
      workspacePath?: string
      selectedNoteId?: string | null
      openNoteTabPaths?: string[]
      chatSidebarOpen?: boolean
    } | null>
    setSession: (data: {
      workspacePath?: string
      selectedNoteId?: string | null
      openNoteTabPaths?: string[]
      chatSidebarOpen?: boolean
    }) => Promise<{ ok: true }>
    openWorkspaceInNewWindow: (workspacePath: string) => Promise<{ ok: true }>
  }
  chatHistory?: {
    write: (payload: {
      sessionId: string
      title: string
      createdAt: number
      messages: Array<{
        role: 'user' | 'assistant'
        content: string
        timestamp: number
        sources?: Array<{
          note: string
          title: string
          folder: string
          chunkText: string
          score?: number
          source?: string
        }>
        chainOfThoughts?: {
          stage: string
          mode: string
          seedNotes: string[]
          connectedNotes: string[]
          finalNotes: string[]
        }
      }>
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    list: () => Promise<
      | {
          ok: true
          sessions: Array<{
            sessionId: string
            title: string
            createdAt: number
            messageCount: number
          }>
        }
      | { ok: false; error: string }
    >
    read: (sessionId: string) => Promise<{ ok: true; content: string } | { ok: false; error: string }>
    readSession: (sessionId: string) => Promise<
      | {
          ok: true
          session: {
            sessionId: string
            title: string
            createdAt: number
            messages: Array<{
              role: 'user' | 'assistant'
              content: string
              timestamp: number
            }>
          }
        }
      | { ok: false; error: string }
    >
  }
  ollama?: {
    chatStream: (
      bodyJson: string,
      callbacks: {
        onChunk: (chunk: string) => void
        onEnd: () => void
        onError: (message: string) => void
      }
    ) => () => void
  }
  updater?: {
    check: () => Promise<unknown>
    getState: () => Promise<
      | { status: 'idle' }
      | { status: 'available'; version: string; downloadUrl: string }
      | { status: 'error'; message: string }
    >
    openDownload: (downloadUrl: string) => Promise<{ ok: true } | { ok: false; error: string }>
    onStateChange: (
      callback: (state: {
        status: string
        version?: string
        downloadUrl?: string
        message?: string
      }) => void
    ) => () => void
  }
  embeddings?: {
    getStatus: (payload: {
      workspacePath: string
    }) => Promise<
      | { ok: true; indexPath: string; indexExists: boolean; documents: number; chunks: number }
      | { ok: false; error: string }
    >
    ensureIndex: (payload: {
      workspacePath: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    getIndexedHashes: (payload: {
      workspacePath: string
    }) => Promise<
      | { ok: true; hashes: Record<string, { contentHash: string; folder: string }> }
      | { ok: false; error: string }
    >
    upsertNoteDocument: (payload: {
      workspacePath: string
      folder: string
      note: string
      title: string
      kind: 'note' | 'drawing'
      contentHash: string
      text: string
      docType?: string
    }) => Promise<{ ok: true; indexed: number } | { ok: false; error: string }>
    searchDocuments: (payload: {
      workspacePath: string
      query: string
      maxDocuments?: number
      maxChunks?: number
      maxSections?: number
      maxTokens?: number
      filter?: EmbeddingsFilter
    }) => Promise<{ ok: true; rows: EmbeddingsSearchRow[] } | { ok: false; error: string }>
    deleteNoteDocument: (payload: {
      workspacePath: string
      note: string
    }) => Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }>
    deleteWorkspaceDocuments: (payload: {
      workspacePath: string
      workspaceId: string
    }) => Promise<
      { ok: true; deleted: boolean; deletedCount: number } | { ok: false; error: string }
    >
    dumpIndex?: (payload: { workspacePath: string }) => Promise<
      | {
          ok: true
          indexPath: string
          documents: Record<string, unknown>[]
          totalDocuments: number
          totalChunks: number
        }
      | { ok: false; error: string }
    >
  }
  log?: {
    info: (scope: string, ...args: unknown[]) => void
    warn: (scope: string, ...args: unknown[]) => void
    error: (scope: string, ...args: unknown[]) => void
  }
}

export function getRendererApi(): NotelabApi | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { api?: NotelabApi }
  return w.api ?? null
}

export function getApi(): NotelabApi | null {
  const api = getRendererApi()
  if (!api?.auth) return null
  return api
}

export function parseSession(
  data: AuthSessionPayload
): { user: { name?: string; email?: string; image?: string | null } } | null {
  if (!data || !data.user) return null
  const u = data.user as { name?: string; email?: string; image?: string | null }
  return { user: u }
}

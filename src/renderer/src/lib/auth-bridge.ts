export type AuthSessionPayload =
  | { session: unknown; user: unknown }
  | null

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
  note_id: string
  workspace_id: string
  note_title: string
  kind: 'note' | 'drawing'
  text: string
  score: number
  uri: string
  section_index: number
  is_bm25: boolean
}

/** OS window chrome (Notelab); optional so browser dev still type-checks. */
export type NotelabWindowApi = {
  setZenShortcutBinding: (
    binding: { mod: boolean; key?: string; code?: string } | null
  ) => Promise<{ ok: boolean }>
  onZenShortcutFromMain: (callback: () => void) => () => void
  setZenPresentation: (enabled: boolean) => Promise<{ ok: boolean }>
  onNativeFullScreenExit: (callback: () => void) => () => void
  /** Main-process `electron-liquid-glass` attach state (macOS Notelab). */
  getLiquidGlassState?: () => Promise<{ attached: boolean; glassSupported: boolean }>
  onLiquidGlassState?: (
    callback: (state: { attached: boolean; glassSupported: boolean }) => void
  ) => () => void
}

export function getWindowApi(): NotelabWindowApi | null {
  if (typeof window === "undefined") return null
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
      | { ok: true; data: AuthSessionPayload }
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
  }
  workspace?: {
    checkGit?: () => Promise<
      | { ok: true; version: string }
      | { ok: false; error: string }
    >
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
      folderId: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    setSyncMode?: (payload: {
      cwd: string
      syncMode: "git" | "github_api" | "local"
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    openExternal: (url: string) => Promise<void>
    setGitRemote: (payload: {
      cwd: string
      url: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    syncMarkdown: (payload: {
      cwd: string
      folderId: string
      files: { relativePath: string; content: string }[]
      pruneOrphanNoteFiles?: boolean
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    readNotelabIndex: (payload: {
      cwd: string
    }) => Promise<
      | {
          ok: true
          folders: { id: string; name: string }[]
          notes: {
            folderId: string
            noteId: string
            title: string
            updatedAtMs: number
            markdownBody: string
            kind: "note" | "drawing"
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
      folderId: string
      noteId: string
      exceptRelativePath?: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    deleteFolder: (payload: {
      cwd: string
      folderId: string
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
      resolution: "ours" | "theirs" | "content"
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
    }) => Promise<
      | { ok: true; content: string | null }
      | { ok: false; error: string }
    >
    writeAppConfig?: (payload: {
      cwd: string
      config: unknown
    }) => Promise<{ ok: true } | { ok: false; error: string }>
  }
  multiWindow?: {
    getSession: () => Promise<{
      workspacePath?: string
      selectedNoteId?: string | null
      openNoteTabIds?: string[]
      chatSidebarOpen?: boolean
    } | null>
    setSession: (data: {
      workspacePath?: string
      selectedNoteId?: string | null
      openNoteTabIds?: string[]
      chatSidebarOpen?: boolean
    }) => Promise<{ ok: true }>
    openWorkspaceInNewWindow: (workspacePath: string) => Promise<{ ok: true }>
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
      | { ok: true; hashes: Record<string, { contentHash: string; workspaceId: string }> }
      | { ok: false; error: string }
    >
    upsertNoteDocument: (payload: {
      workspacePath: string
      workspaceId: string
      noteId: string
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
      isBm25?: boolean
    }) => Promise<
      | { ok: true; rows: EmbeddingsSearchRow[] }
      | { ok: false; error: string }
    >
    deleteNoteDocument: (payload: {
      workspacePath: string
      noteId: string
    }) => Promise<
      | { ok: true; deleted: boolean }
      | { ok: false; error: string }
    >
    deleteWorkspaceDocuments: (payload: {
      workspacePath: string
      workspaceId: string
    }) => Promise<
      | { ok: true; deleted: boolean; deletedCount: number }
      | { ok: false; error: string }
    >
    dumpIndex?: (payload: {
      workspacePath: string
    }) => Promise<
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
}

export function getApi(): NotelabApi | null {
  if (typeof window === "undefined") return null
  const w = window as Window & { api?: NotelabApi }
  if (!w.api?.auth) return null
  return w.api
}

export function parseSession(
  data: AuthSessionPayload
): { user: { name?: string; email?: string; image?: string | null } } | null {
  if (!data || !data.user) return null
  const u = data.user as { name?: string; email?: string; image?: string | null }
  return { user: u }
}

export type AuthSessionPayload =
  | { session: unknown; user: unknown }
  | null

/** OS window chrome (Electron); optional so browser dev still type-checks. */
export type GitNotesWindowApi = {
  setZenShortcutBinding: (
    binding: { mod: boolean; key?: string; code?: string } | null
  ) => Promise<{ ok: boolean }>
  onZenShortcutFromMain: (callback: () => void) => () => void
  setZenPresentation: (enabled: boolean) => Promise<{ ok: boolean }>
  onNativeFullScreenExit: (callback: () => void) => () => void
  /** Main-process `electron-liquid-glass` attach state (macOS Electron). */
  getLiquidGlassState?: () => Promise<{ attached: boolean; glassSupported: boolean }>
  onLiquidGlassState?: (
    callback: (state: { attached: boolean; glassSupported: boolean }) => void
  ) => () => void
}

export function getWindowApi(): GitNotesWindowApi | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { api?: { window?: GitNotesWindowApi } }
  return w.api?.window ?? null
}

export type GitNotesApi = {
  window?: GitNotesWindowApi
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
    ensureDataRoot?: () => Promise<
      | {
          ok: true
          path: string
          gitAvailable: boolean
          filesystemOnly: boolean
        }
      | { ok: false; error: string }
    >
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
    readGitnotesIndex: (payload: {
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
  embeddings?: {
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
    dumpTable?: () => Promise<
      | { ok: true; rows: Record<string, unknown>[]; totalRows: number }
      | { ok: false; error: string }
    >
  }
}

export function getApi(): GitNotesApi | null {
  if (typeof window === "undefined") return null
  const w = window as Window & { api?: GitNotesApi }
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

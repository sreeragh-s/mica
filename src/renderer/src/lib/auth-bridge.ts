export type AuthSessionPayload =
  | { session: unknown; user: unknown }
  | null

export type GitNotesApi = {
  auth: {
    getSession: () => Promise<
      | { ok: true; data: AuthSessionPayload }
      | { ok: false; error?: string }
    >
    signInWithGithub: () => Promise<{ user: unknown }>
    signOut: () => Promise<{ ok: boolean }>
  }
  workspace?: {
    ensureDataRoot?: () => Promise<
      | { ok: true; path: string }
      | { ok: false; error: string }
    >
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

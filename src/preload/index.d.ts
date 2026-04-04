import { ElectronAPI } from '@electron-toolkit/preload'

type GitNotesApi = {
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
  }
  workspace: {
    checkGit: () => Promise<
      | { ok: true; version: string }
      | { ok: false; error: string }
    >
    ensureDataRoot: () => Promise<
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: GitNotesApi
  }
}

export {}

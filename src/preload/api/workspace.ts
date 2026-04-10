import { ipcRenderer } from 'electron'

export const workspaceApi = {
  checkGit: (): Promise<
    | { ok: true; version: string }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:check-git'),
  ensureDataRoot: (payload?: { path?: string }): Promise<
    | {
        ok: true
        path: string
        configRoot: string
        gitAvailable: boolean
        filesystemOnly: boolean
        gitInitialized: boolean
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:ensure-data-root', payload),
  pickDirectory: (): Promise<
    { ok: true; path: string } | { ok: false; cancelled: true }
  > => ipcRenderer.invoke('workspace:pick-directory'),
  initGit: (payload: { cwd: string }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:init-git', payload),
  migrateWorkspace: (payload: {
    fromCwd: string
    toCwd: string
  }): Promise<{ ok: true; copiedFiles: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:migrate-workspace', payload),
  createFolder: (payload: {
    cwd: string
    folder: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:create-folder', payload),
  setSyncMode: (payload: {
    cwd: string
    syncMode: 'git' | 'github_api' | 'local'
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:set-sync-mode', payload),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('workspace:open-external', url),
  setGitRemote: (payload: {
    cwd: string
    url: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:set-git-remote', payload),
  gitCheckConfig: (payload: { cwd: string }): Promise<
    | { ok: true; hasName: boolean; hasEmail: boolean; name: string | null; email: string | null }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:git-check-config', payload),
  gitSetConfig: (payload: {
    cwd: string
    name: string
    email: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-set-config', payload),
  syncMarkdown: (payload: {
    cwd: string
    folder: string
    files: { relativePath: string; content: string }[]
    pruneOrphanNoteFiles?: boolean
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:sync-markdown', payload),
  readNotelabIndex: (payload: { cwd: string }): Promise<
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
  > => ipcRenderer.invoke('workspace:read-notelab-index', payload),
  writeNoteFile: (payload: {
    cwd: string
    relativePath: string
    content: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:write-note-file', payload),
  deleteNoteFile: (payload: {
    cwd: string
    note: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:delete-note-file', payload),
  renamePath: (payload: {
    cwd: string
    from: string
    to: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:rename-path', payload),
  deleteFolder: (payload: {
    cwd: string
    folder: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:delete-folder', payload),
  gitStatus: (payload: { cwd: string }): Promise<
    | { ok: true; dirty: boolean; porcelain: string; remoteUrl: string | null }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:git-status', payload),
  gitCommit: (payload: {
    cwd: string
    message: string
    authorName: string
    authorEmail: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-commit', payload),
  gitPull: (payload: { cwd: string }): Promise<
    | { ok: true; stdout: string }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:git-pull', payload),
  gitPush: (payload: { cwd: string }): Promise<
    | { ok: true; stdout: string }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:git-push', payload),
  gitFileStatuses: (payload: { cwd: string }): Promise<
    | {
        ok: true
        files: { path: string; x: string; y: string; staged: boolean; conflicted: boolean }[]
        hasConflicts: boolean
        isRebasing: boolean
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:git-file-statuses', payload),
  gitDiffFile: (payload: { cwd: string; path: string; staged?: boolean }): Promise<
    { ok: true; diff: string } | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:git-diff-file', payload),
  gitConflictFile: (payload: { cwd: string; path: string }): Promise<
    | { ok: true; content: string; ours: string; theirs: string; base: string }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:git-conflict-file', payload),
  gitAcceptResolution: (payload: {
    cwd: string
    path: string
    resolution: 'ours' | 'theirs' | 'content'
    content?: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-accept-resolution', payload),
  gitStageFile: (payload: { cwd: string; path: string }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-stage-file', payload),
  gitUnstageFile: (payload: { cwd: string; path: string }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-unstage-file', payload),
  gitDiscardFile: (payload: { cwd: string; path: string }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-discard-file', payload),
  gitAbortRebase: (payload: { cwd: string }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-abort-rebase', payload),
  gitContinueRebase: (payload: {
    cwd: string
    authorName: string
    authorEmail: string
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:git-continue-rebase', payload),
  readAppConfig: (payload: { cwd: string }): Promise<
    | { ok: true; content: string | null }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('workspace:read-app-config', payload),
  writeAppConfig: (payload: {
    cwd: string
    config: unknown
  }): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('workspace:write-app-config', payload),
}

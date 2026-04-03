import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  auth: {
    getSession: (): Promise<unknown> => ipcRenderer.invoke('auth:get-session'),
    signInWithGithub: (): Promise<{ user: unknown }> =>
      ipcRenderer.invoke('auth:sign-in-github'),
    signOut: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('auth:sign-out'),
  },
  workspace: {
    ensureDataRoot: (): Promise<
      | { ok: true; path: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:ensure-data-root'),
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
    readGitnotesIndex: (
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
          }[]
        }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('workspace:read-gitnotes-index', payload),
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
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('workspace:delete-note-files', payload),
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

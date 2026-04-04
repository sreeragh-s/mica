import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
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
            kind: 'note' | 'drawing'
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
      const channel = 'gitnotes:zen-shortcut'
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

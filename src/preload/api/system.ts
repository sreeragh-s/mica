import { ipcRenderer } from 'electron'

import { subscribe } from './ipc'

export const clipboardApi = {
  writeText: (text: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('clipboard:write-text', text)
}

export const windowApi = {
  setZenShortcutBinding: (
    binding: { mod: boolean; key?: string; code?: string } | null
  ): Promise<{ ok: boolean }> => ipcRenderer.invoke('window:set-zen-shortcut-binding', binding),
  onZenShortcutFromMain: (callback: () => void): (() => void) =>
    subscribe('notelab:zen-shortcut', () => callback()),
  setZenPresentation: (enabled: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('window:set-zen-presentation', enabled),
  onNativeFullScreenExit: (callback: () => void): (() => void) =>
    subscribe('window:left-full-screen', () => callback())
}

export const logApi = {
  info: (...args: unknown[]): void => ipcRenderer.send('log:info', ...args),
  warn: (...args: unknown[]): void => ipcRenderer.send('log:warn', ...args),
  error: (...args: unknown[]): void => ipcRenderer.send('log:error', ...args)
}

export const updaterApi = {
  check: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
  getState: (): Promise<unknown> => ipcRenderer.invoke('update:get-state'),
  openDownload: (downloadUrl: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('update:open-download', downloadUrl),
  onStateChange: (
    callback: (state: {
      status: string
      version?: string
      downloadUrl?: string
      message?: string
    }) => void
  ): (() => void) =>
    subscribe('notelab:update-state', (state) => {
      callback(
        state as { status: string; version?: string; downloadUrl?: string; message?: string }
      )
    })
}

export const multiWindowApi = {
  getSession: (): Promise<{
    workspacePath?: string
    selectedNoteId?: string | null
    openNoteTabPaths?: string[]
    chatSidebarOpen?: boolean
  } | null> => ipcRenderer.invoke('window:get-session'),
  setSession: (data: {
    workspacePath?: string
    selectedNoteId?: string | null
    openNoteTabPaths?: string[]
    chatSidebarOpen?: boolean
  }): Promise<{ ok: true }> => ipcRenderer.invoke('window:set-session', data),
  openWorkspaceInNewWindow: (workspacePath: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke('window:open-workspace-in-new-window', workspacePath)
}

import {
  app,
  clipboard,
  BrowserWindow,
  ipcMain,
} from 'electron'
import log from 'electron-log/main'

import { macTrafficLightPosition } from '@shared/windowing/mac-window-chrome'

import { createWindow } from '../core/window'
import { windowSessionData, type WindowSession } from '../core/session'
import { zenShortcutBindings, type ZenShortcutBinding } from '../core/shortcuts'

/**
 * App-level IPC that does not belong to a single feature domain.
 */
export function registerCoreIpc(): void {
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('clipboard:write-text', (_event, text: string) => {
    try {
      clipboard.writeText(text)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  ipcMain.handle('window:set-zen-shortcut-binding', (event, binding: ZenShortcutBinding | null) => {
    zenShortcutBindings.set(event.sender, binding)
    return { ok: true as const }
  })

  ipcMain.handle('window:set-zen-presentation', (event, enabled: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) {
      return { ok: false as const }
    }

    try {
      const traffic = macTrafficLightPosition()
      if (enabled) {
        win.setFullScreen(true)
        if (process.platform === 'darwin') {
          const applyLights = (): void => {
            if (win.isDestroyed()) return
            win.setWindowButtonVisibility(true)
            win.setWindowButtonPosition(traffic)
          }
          setTimeout(applyLights, 0)
          win.once('enter-full-screen', applyLights)
        }
      } else {
        win.setFullScreen(false)
        if (process.platform === 'darwin') {
          const applyLights = (): void => {
            if (win.isDestroyed()) return
            win.setWindowButtonVisibility(true)
            win.setWindowButtonPosition(traffic)
          }
          setTimeout(applyLights, 0)
        }
      }
      return { ok: true as const }
    } catch {
      return { ok: false as const }
    }
  })

  ipcMain.handle('window:get-session', (event) => {
    return windowSessionData.get(event.sender) ?? null
  })

  ipcMain.handle('window:set-session', (event, data: WindowSession) => {
    windowSessionData.set(event.sender, data)
    return { ok: true as const }
  })

  ipcMain.handle('window:open-workspace-in-new-window', (_event, workspacePath: string) => {
    createWindow({ workspacePath })
    return { ok: true as const }
  })
}

export function registerLogIpc(): void {
  ipcMain.on('log:info', (_event, ...args: unknown[]) => {
    log.info('[renderer]', ...args)
  })
  ipcMain.on('log:warn', (_event, ...args: unknown[]) => {
    log.warn('[renderer]', ...args)
  })
  ipcMain.on('log:error', (_event, ...args: unknown[]) => {
    log.error('[renderer]', ...args)
  })
}

export function registerAppEvents(): void {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

/**
 * Main process entry point.
 *
 * Orchestrates app lifecycle, window creation, and IPC module registration.
 * Domain-specific logic lives in:
 *   - core/     → window, session, shortcuts
 *   - git/      → git operations and IPC
 *   - workspace/→ filesystem, config, data root IPC
 *   - auth/     → authentication IPC
 *   - chat/     → chat history IPC
 *   - ai/       → ollama, vectra embeddings IPC
 *   - updater/  → auto-update IPC
 */

import {
  app,
  clipboard,
  BrowserWindow,
  ipcMain,
  session,
} from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import log from 'electron-log/main'

import { createWindow, macLiquidGlassStateByWebContents } from './core/window'
import { windowSessionData, type WindowSession } from './core/session'
import { watchWindowShortcutsDetachedDevTools, zenShortcutBindings, type ZenShortcutBinding } from './core/shortcuts'

import { registerAuthIpc } from './auth/auth'
import { registerChatHistoryIpc } from './chat/chat-history'
import { registerWorkspaceIpc } from './workspace/workspace-ipc'
import { registerGitIpc } from './git/git-ipc'
import { registerVectraEmbeddingsIpc } from './ai/vectra-embeddings'
import { registerOllamaIpc } from './ai/ollama'
import { registerUpdaterIpc } from './updater/updater'

log.initialize()

// ---------------------------------------------------------------------------
// App ready
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // Web Speech API uses the engine's cloud service; Chromium may request mic / media access.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('io.notelab.app')

  // Default open or close DevTools by F12 in development (detached window — see
  // watchWindowShortcutsDetachedDevTools) and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    watchWindowShortcutsDetachedDevTools(window)
  })

  // --- Simple IPC handlers ---

  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.on('log:info', (_event, ...args: unknown[]) => log.info('[renderer]', ...args))
  ipcMain.on('log:warn', (_event, ...args: unknown[]) => log.warn('[renderer]', ...args))
  ipcMain.on('log:error', (_event, ...args: unknown[]) => log.error('[renderer]', ...args))

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

  ipcMain.handle('window:get-liquid-glass-state', (event) => {
    return macLiquidGlassStateByWebContents.get(event.sender) ?? {
      attached: false,
      glassSupported: false
    }
  })

  ipcMain.handle('window:set-zen-presentation', (event, enabled: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) {
      return { ok: false as const }
    }
    try {
      const traffic: { x: number; y: number } = { x: 22, y: 18 }
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

  // --- Register domain IPC modules ---

  registerAuthIpc()
  registerChatHistoryIpc()
  registerWorkspaceIpc()
  registerGitIpc()
  registerVectraEmbeddingsIpc()
  registerOllamaIpc()
  registerUpdaterIpc()

  // --- Window session IPC ---

  ipcMain.handle('window:get-session', (event) => {
    const data = windowSessionData.get(event.sender) ?? null
    return data
  })

  ipcMain.handle('window:set-session', (event, data: WindowSession) => {
    windowSessionData.set(event.sender, data)
    return { ok: true as const }
  })

  ipcMain.handle('window:open-workspace-in-new-window', (_event, workspacePath: string) => {
    createWindow({ workspacePath })
    return { ok: true as const }
  })

  // --- Create first window ---
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

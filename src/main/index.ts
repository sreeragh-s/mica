import { app, shell, BrowserWindow, ipcMain, session, type WebContents } from 'electron'
import type { Input } from 'electron'

/** Serialized shortcut (same shape as renderer `ShortcutBinding`). */
type ZenShortcutBinding = {
  mod: boolean
  key?: string
  code?: string
}

const zenShortcutBindings = new WeakMap<WebContents, ZenShortcutBinding | null>()

function bindingMatchesBeforeInput(b: ZenShortcutBinding, input: Input): boolean {
  if (b.mod && !(input.meta || input.control)) return false
  if (!b.mod && (input.meta || input.control)) return false
  if (input.alt) return false
  if (b.key) {
    const want = b.key.length === 1 ? b.key.toLowerCase() : b.key
    const raw = input.key ?? ''
    const got = raw.length === 1 ? raw.toLowerCase() : raw
    return got === want
  }
  if (b.code) return input.code === b.code
  return false
}
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAuthIpc } from './auth'
import { registerWorkspaceGitIpc } from './workspace-git'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'gitnotes',
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 16 },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  /** Chromium often eats Cmd+J (and similar) before keydown reaches the page; handle zen here. */
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return
    const b = zenShortcutBindings.get(mainWindow.webContents)
    if (!b) return
    if (!bindingMatchesBeforeInput(b, input)) return
    event.preventDefault()
    mainWindow.webContents.send('gitnotes:zen-shortcut')
  })

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window:left-full-screen')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Web Speech API uses the engine’s cloud service; Chromium may request mic / media access.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.gitnotes.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle(
    'window:set-zen-shortcut-binding',
    (event, binding: ZenShortcutBinding | null) => {
      zenShortcutBindings.set(event.sender, binding)
      return { ok: true as const }
    }
  )

  ipcMain.handle('window:set-zen-presentation', (event, enabled: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) {
      return { ok: false as const }
    }
    try {
      if (enabled) {
        win.setFullScreen(true)
        if (process.platform === 'darwin') {
          setTimeout(() => {
            if (!win.isDestroyed()) {
              win.setWindowButtonVisibility(false)
            }
          }, 0)
        }
      } else {
        if (process.platform === 'darwin') {
          win.setWindowButtonVisibility(true)
        }
        win.setFullScreen(false)
      }
      return { ok: true as const }
    } catch {
      return { ok: false as const }
    }
  })

  registerAuthIpc()
  registerWorkspaceGitIpc()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

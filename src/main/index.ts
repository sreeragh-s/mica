import {
  app,
  clipboard,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  type WebContents,
  type Input,
} from 'electron'

type MacLiquidGlassState = { attached: boolean; glassSupported: boolean }

const macLiquidGlassStateByWebContents = new WeakMap<WebContents, MacLiquidGlassState>()

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
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAuthIpc } from './auth'
import { registerChatHistoryIpc } from './chat-history'
import { registerWorkspaceGitIpc } from './workspace-git'
import { registerLancedbEmbeddingsIpc } from './lancedb-embeddings'

/** Native liquid glass behind the web view (electron-liquid-glass, macOS). */
async function attachMacNativeLiquidGlass(win: BrowserWindow): Promise<void> {
  if (process.platform !== 'darwin') return
  const state: MacLiquidGlassState = { attached: false, glassSupported: false }
  try {
    const { default: liquidGlass } = await import('electron-liquid-glass')
    if (win.isDestroyed()) return
    state.glassSupported = liquidGlass.isGlassSupported()
    const glassId = liquidGlass.addView(win.getNativeWindowHandle(), {
      cornerRadius: 16,
      opaque: false
    })
    state.attached = glassId >= 0
    if (glassId >= 0) {
      liquidGlass.unstable_setVariant(glassId, liquidGlass.GlassMaterialVariant.sidebar)
    }
  } catch (e) {
    console.warn('[notelab] electron-liquid-glass failed to attach:', e)
  }
  if (!win.isDestroyed()) {
    macLiquidGlassStateByWebContents.set(win.webContents, state)
    win.webContents.send('notelab:liquid-glass-state', state)
  }
}

/**
 * Mirrors `@electron-toolkit/utils` `optimizer.watchWindowShortcuts`, but opens DevTools with
 * `mode: 'detach'` (separate OS window). Undocked tools inside a transparent / liquid-glass
 * window often break click hit-testing; detached mode avoids that.
 */
function watchWindowShortcutsDetachedDevTools(window: BrowserWindow): void {
  const { webContents } = window
  webContents.on('before-input-event', (event, input: Input) => {
    if (input.type !== 'keyDown') return
    if (!is.dev) {
      if (input.code === 'KeyR' && (input.control || input.meta)) {
        event.preventDefault()
      }
      if (input.code === 'KeyI' && ((input.alt && input.meta) || (input.control && input.shift))) {
        event.preventDefault()
      }
    } else if (input.code === 'F12') {
      if (webContents.isDevToolsOpened()) {
        webContents.closeDevTools()
      } else {
        webContents.openDevTools({ mode: 'detach' })
      }
    }
    if (input.code === 'Minus' && (input.control || input.meta)) {
      event.preventDefault()
    }
    if (input.code === 'Equal' && input.shift && (input.control || input.meta)) {
      event.preventDefault()
    }
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'notelab.io',
    width: 900,
    height: 670,
    minWidth: 900,
    minHeight: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform === 'darwin'
      ? {
          /** `hidden` avoids the extra inset strip that often reads as a separate “top bar”. */
          titleBarStyle: 'hidden' as const,
          /** Match sidebar toolbar row (`pl-[92px]`); keep in sync with renderer. */
          trafficLightPosition: { x: 22, y: 18 },
          /**
           * Required for electron-liquid-glass (do not enable `vibrancy` — it overrides the effect).
           * @see https://github.com/Meridius-Labs/electron-liquid-glass
           */
          transparent: true,
          backgroundColor: '#00000000'
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const trafficLightsMac: { x: number; y: number } = { x: 22, y: 18 }

  /** macOS often restores the title strip / button layout after zoom-to-fill (not native fullscreen). */
  const syncMacTitleChrome = (): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.setTitle('')
    mainWindow.setWindowButtonVisibility(true)
    mainWindow.setWindowButtonPosition(trafficLightsMac)
  }

  mainWindow.on('ready-to-show', () => {
    if (process.platform === 'darwin') {
      syncMacTitleChrome()
    }
    mainWindow.show()
  })

  if (process.platform === 'darwin') {
    mainWindow.on('enter-full-screen', syncMacTitleChrome)
    /** Green “zoom” / edge-tile fills the desktop without `enter-full-screen`; re-apply chrome after. */
    mainWindow.on('maximize', syncMacTitleChrome)
    mainWindow.on('unmaximize', syncMacTitleChrome)
    mainWindow.on('resized', syncMacTitleChrome)
    mainWindow.on('restore', syncMacTitleChrome)
  }

  mainWindow.on('leave-full-screen', () => {
    if (process.platform === 'darwin') {
      syncMacTitleChrome()
    }
    mainWindow.webContents.send('window:left-full-screen')
  })

  /** Chromium often eats Cmd+J (and similar) before keydown reaches the page; handle zen here. */
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return
    const b = zenShortcutBindings.get(mainWindow.webContents)
    if (!b) return
    if (!bindingMatchesBeforeInput(b, input)) return
    event.preventDefault()
    mainWindow.webContents.send('notelab:zen-shortcut')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  mainWindow.webContents.once('did-finish-load', () => {
    void attachMacNativeLiquidGlass(mainWindow)
  })

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
  electronApp.setAppUserModelId('io.notelab.app')

  // Default open or close DevTools by F12 in development (detached window — see
  // watchWindowShortcutsDetachedDevTools) and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    watchWindowShortcutsDetachedDevTools(window)
  })

  // IPC test
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
          /** Keep native traffic lights (same as sidebar chrome); hiding them often leaves a blank title strip. */
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

  registerAuthIpc()
  registerChatHistoryIpc()
  registerWorkspaceGitIpc()
  registerLancedbEmbeddingsIpc()

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

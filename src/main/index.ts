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
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'

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
import log from 'electron-log/main'
import icon from '../../resources/icon.png?asset'
import { MAC_WINDOW_OUTER_CORNER_RADIUS_PX } from '../shared/mac-window-chrome'
import { registerAuthIpc } from './auth'
import { registerChatHistoryIpc } from './chat-history'
import { registerWorkspaceGitIpc } from './workspace-git'
import { registerLancedbEmbeddingsIpc } from './lancedb-embeddings'
import { registerOllamaIpc } from './ollama'
import { registerUpdaterIpc } from './updater'

log.initialize()

/** Native liquid glass behind the web view (electron-liquid-glass, macOS). */
async function attachMacNativeLiquidGlass(win: BrowserWindow): Promise<void> {
  if (process.platform !== 'darwin') return
  const state: MacLiquidGlassState = { attached: false, glassSupported: false }
  try {
    const { default: liquidGlass } = await import('electron-liquid-glass')
    if (win.isDestroyed()) return
    state.glassSupported = liquidGlass.isGlassSupported()
    const glassId = liquidGlass.addView(win.getNativeWindowHandle(), {
      cornerRadius: MAC_WINDOW_OUTER_CORNER_RADIUS_PX,
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
    // Do not prevent Cmd/Ctrl +/-/= zoom: blocking Minus alone broke zoom-out while other
    // zoom-in paths (e.g. numpad) could still apply — let Chromium handle page zoom.
  })
}

// ---------------------------------------------------------------------------
// Multi-window session persistence
// ---------------------------------------------------------------------------

type WindowSession = {
  workspacePath?: string
  selectedNoteId?: string | null
  openNoteTabIds?: string[]
  chatSidebarOpen?: boolean
  bounds?: { x: number; y: number; width: number; height: number }
}

type AppSession = {
  version: 1
  windows: WindowSession[]
}

function sessionFilePath(): string {
  const dir = join(homedir(), '.notelab')
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  return join(dir, 'notelab.session')
}

function readAppSession(): AppSession {
  try {
    const raw = readFileSync(sessionFilePath(), 'utf-8')
    const p = JSON.parse(raw) as unknown
    if (typeof p === 'object' && p !== null && (p as Record<string, unknown>).version === 1) {
      return p as AppSession
    }
  } catch { /* no session yet */ }
  return { version: 1, windows: [] }
}

function writeAppSession(session: AppSession): void {
  try {
    writeFileSync(sessionFilePath(), JSON.stringify(session, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

/** Per-window session data stored by webContents id. */
const windowSessionData = new WeakMap<WebContents, WindowSession>()

function createWindowWithSession(session?: WindowSession): BrowserWindow {
  const bounds = session?.bounds
  const win = new BrowserWindow({
    title: 'notelab.io',
    width: bounds?.width ?? 900,
    height: bounds?.height ?? 670,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 900,
    minHeight: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 22, y: 18 },
          transparent: true,
          backgroundColor: '#00000000'
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (session) {
    windowSessionData.set(win.webContents, { ...session })
  }

  const trafficLightsMac = { x: 22, y: 18 }
  const syncMacTitleChrome = (): void => {
    if (win.isDestroyed()) return
    win.setTitle('')
    win.setWindowButtonVisibility(true)
    win.setWindowButtonPosition(trafficLightsMac)
  }

  win.on('ready-to-show', () => {
    if (process.platform === 'darwin') syncMacTitleChrome()
    win.show()
  })

  if (process.platform === 'darwin') {
    win.on('enter-full-screen', syncMacTitleChrome)
    win.on('maximize', syncMacTitleChrome)
    win.on('unmaximize', syncMacTitleChrome)
    win.on('resized', syncMacTitleChrome)
    win.on('restore', syncMacTitleChrome)
  }

  win.on('leave-full-screen', () => {
    if (process.platform === 'darwin') syncMacTitleChrome()
    win.webContents.send('window:left-full-screen')
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return
    const b = zenShortcutBindings.get(win.webContents)
    if (!b) return
    if (!bindingMatchesBeforeInput(b, input)) return
    event.preventDefault()
    win.webContents.send('notelab:zen-shortcut')
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.webContents.once('did-finish-load', () => {
    void attachMacNativeLiquidGlass(win)
  })

  const workspaceParam = session?.workspacePath
    ? `?workspace=${encodeURIComponent(session.workspacePath)}`
    : ''

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + workspaceParam)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), {
      search: workspaceParam ? workspaceParam.slice(1) : undefined
    })
  }

  return win
}

/** Persist the current multi-window session to disk before the app quits. */
function persistCurrentSession(): void {
  const wins = BrowserWindow.getAllWindows()
  const sessions: WindowSession[] = wins
    .filter((w) => !w.isDestroyed())
    .map((w) => {
      const data = windowSessionData.get(w.webContents) ?? {}
      const b = w.getBounds()
      return { ...data, bounds: { x: b.x, y: b.y, width: b.width, height: b.height } }
    })
  writeAppSession({ version: 1, windows: sessions })
}

function createWindow(sessionData?: WindowSession): BrowserWindow {
  return createWindowWithSession(sessionData)
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
  registerOllamaIpc()
  registerUpdaterIpc()

  // --- Window session IPC ---

  /** Renderer calls this to get its own persisted session data on startup. */
  ipcMain.handle('window:get-session', (event) => {
    const data = windowSessionData.get(event.sender) ?? null
    return data
  })

  /** Renderer calls this to update its persisted session data. */
  ipcMain.handle('window:set-session', (event, data: WindowSession) => {
    windowSessionData.set(event.sender, data)
    return { ok: true as const }
  })

  /** Open a workspace path in a new BrowserWindow. */
  ipcMain.handle('window:open-workspace-in-new-window', (_event, workspacePath: string) => {
    createWindow({ workspacePath })
    return { ok: true as const }
  })

  // Restore previous session windows (skip on first launch).
  const prevSession = readAppSession()
  if (prevSession.windows.length > 0) {
    for (const ws of prevSession.windows) {
      createWindow(ws)
    }
  } else {
    createWindow()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Persist session before the app quits.
app.on('before-quit', () => {
  persistCurrentSession()
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

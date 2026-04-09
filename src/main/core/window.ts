/**
 * BrowserWindow creation and native chrome helpers.
 *
 * - Creates windows with optional restored session data
 * - Attaches macOS liquid glass + traffic lights
 * - Loads the correct renderer URL (dev vs production)
 */

import { BrowserWindow, shell, type WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import { MAC_WINDOW_OUTER_CORNER_RADIUS_PX } from '../../shared/mac-window-chrome'
import {
  type WindowSession,
  windowSessionData,
} from './session'
import {
  zenShortcutBindings,
  bindingMatchesBeforeInput,
} from './shortcuts'

// ---------------------------------------------------------------------------
// Liquid glass (macOS)
// ---------------------------------------------------------------------------

type MacLiquidGlassState = { attached: boolean; glassSupported: boolean }

export const macLiquidGlassStateByWebContents = new WeakMap<WebContents, MacLiquidGlassState>()

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

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

export function createWindow(session?: WindowSession): BrowserWindow {
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
      sandbox: false,
      spellcheck: false
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

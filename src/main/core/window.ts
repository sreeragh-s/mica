/**
 * BrowserWindow creation and native chrome helpers.
 *
 * - Creates windows with optional restored session data
 * - macOS hidden titlebar + traffic lights
 * - Loads the correct renderer URL (dev vs production)
 */

import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import { macTrafficLightPosition } from '../../shared/mac-window-chrome'
import {
  type WindowSession,
  windowSessionData,
} from './session'
import {
  zenShortcutBindings,
  bindingMatchesBeforeInput,
} from './shortcuts'

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
          trafficLightPosition: macTrafficLightPosition(),
          transparent: true,
          backgroundColor: '#00000000'
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false,
    }
  })

  if (session) {
    windowSessionData.set(win.webContents, { ...session })
  }

  const syncMacTitleChrome = (): void => {
    if (win.isDestroyed()) return
    win.setTitle('')
    win.setWindowButtonVisibility(true)
    win.setWindowButtonPosition(macTrafficLightPosition())
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

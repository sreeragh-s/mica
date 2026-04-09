/**
 * Keyboard shortcut helpers for the main process.
 *
 * - Zen mode shortcut binding (forwarded from renderer)
 * - DevTools shortcut watcher (detached mode to avoid liquid-glass hit-testing issues)
 */

import { BrowserWindow, type WebContents, type Input } from 'electron'
import { is } from '@electron-toolkit/utils'

// ---------------------------------------------------------------------------
// Zen-mode shortcut
// ---------------------------------------------------------------------------

/** Serialized shortcut (same shape as renderer `ShortcutBinding`). */
export type ZenShortcutBinding = {
  mod: boolean
  key?: string
  code?: string
}

export const zenShortcutBindings = new WeakMap<WebContents, ZenShortcutBinding | null>()

export function bindingMatchesBeforeInput(b: ZenShortcutBinding, input: Input): boolean {
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

// ---------------------------------------------------------------------------
// DevTools shortcut watcher (detached mode)
// ---------------------------------------------------------------------------

/**
 * Mirrors `@electron-toolkit/utils` `optimizer.watchWindowShortcuts`, but opens DevTools with
 * `mode: 'detach'` (separate OS window). Undocked tools inside a transparent / liquid-glass
 * window often break click hit-testing; detached mode avoids that.
 */
export function watchWindowShortcutsDetachedDevTools(window: BrowserWindow): void {
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
  })
}

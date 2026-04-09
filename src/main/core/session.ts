/**
 * Multi-window session persistence.
 *
 * Stores window layout (bounds, workspace path, selected note, etc.) to disk
 * at `~/.notelab/notelab.session` so the app can restore them on next launch.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { BrowserWindow, type WebContents } from 'electron'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindowSession = {
  workspacePath?: string
  selectedNoteId?: string | null
  openNoteTabPaths?: string[]
  chatSidebarOpen?: boolean
  bounds?: { x: number; y: number; width: number; height: number }
}

export type AppSession = {
  version: 1
  windows: WindowSession[]
}

// ---------------------------------------------------------------------------
// Per-window session data (keyed by webContents via WeakMap)
// ---------------------------------------------------------------------------

export const windowSessionData = new WeakMap<WebContents, WindowSession>()

// ---------------------------------------------------------------------------
// Disk helpers
// ---------------------------------------------------------------------------

function sessionFilePath(): string {
  const dir = join(homedir(), '.notelab')
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  return join(dir, 'notelab.session')
}

export function readAppSession(): AppSession {
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

/** Persist the current multi-window session to disk before the app quits. */
export function persistCurrentSession(): void {
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

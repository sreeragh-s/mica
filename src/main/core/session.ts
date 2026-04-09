/**
 * Multi-window session state (in-memory only).
 *
 * Session is persisted to <workspaceRoot>/notelab.json by the renderer.
 */

import type { WebContents } from 'electron'

export type WindowSession = {
  workspacePath?: string
  selectedNoteId?: string | null
  openNoteTabPaths?: string[]
  chatSidebarOpen?: boolean
  bounds?: { x: number; y: number; width: number; height: number }
}

export const windowSessionData = new WeakMap<WebContents, WindowSession>()

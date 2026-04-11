/**
 * Multi-window session state (in-memory only). Used as a fallback when the workspace
 * has no `workspaceView` in `<notesWorkspace>/notelab.json` yet.
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

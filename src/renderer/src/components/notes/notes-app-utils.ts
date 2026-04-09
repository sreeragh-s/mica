import type { CSSProperties } from 'react'
import type { SerializedEditorState } from 'lexical'

import type { SavedNote, Folder } from '@/lib/notes/notes-storage'
import type { MacTitlebarStyles } from '@/components/notes/notes-app-types'

/** True when the editor output matches stored note content (avoids bumping `updatedAt` on selection/mount). */
export function serializedEditorStatesEqual(
  stored: SerializedEditorState | null | undefined,
  fromEditor: SerializedEditorState
): boolean {
  if (stored == null) return false
  return JSON.stringify(stored) === JSON.stringify(fromEditor)
}

export const macTitlebarStyles: MacTitlebarStyles = {
  drag: { WebkitAppRegion: 'drag' } as CSSProperties,
  noDrag: { WebkitAppRegion: 'no-drag' } as CSSProperties
}

/** Inset pill surface shared by the note tab strip and matching chat controls (height h-8). */
export const NOTES_APP_PILL_SURFACE =
  'bg-muted/35 text-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] backdrop-blur-xl dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)]'

/** Main window drag uses a single full-width band in `NotesApp` (macOS Notelab); avoid extra `drag` rows. */

export function createEmptyNote(folder: string, notePath: string): SavedNote {
  return {
    path: notePath,
    updatedAt: Date.now(),
    content: null,
    folder,
    title: '',
    kind: 'note'
  }
}

export function createEmptyDrawing(folder: string, notePath: string): SavedNote {
  return {
    path: notePath,
    updatedAt: Date.now(),
    content: null,
    folder,
    title: 'New drawing',
    kind: 'drawing',
    excalidrawScene: null
  }
}

export function isDrawingNote(note: SavedNote): boolean {
  return note.kind === 'drawing'
}

export function treeFolderPath(folder: string): string {
  return `folder:${folder}`
}

export function treeNotePath(notePath: string): string {
  return `note:${notePath}`
}

/** DataTransfer type for dragging a note from the tree into the main editor area. */
export const NOTE_DRAG_MIME = 'application/x-notelab-note-id'

/** DataTransfer type for reordering workspace folders in the sidebar. */
export const FOLDER_DRAG_MIME = 'application/x-notelab-folder-id'

export function mergeFolderOrder(
  diskFolders: Folder[],
  preferredOrder: string[]
): Folder[] {
  const byFolder = new Map(diskFolders.map((workspace) => [workspace.folder, workspace]))
  const out: Folder[] = []
  const seenFolders = new Set<string>()
  for (const folder of preferredOrder) {
    const workspace = byFolder.get(folder)
    if (workspace) {
      out.push(workspace)
      seenFolders.add(folder)
    }
  }
  for (const workspace of diskFolders) {
    if (!seenFolders.has(workspace.folder)) out.push(workspace)
  }
  return out
}

/** Insert `draggedId` immediately before `targetId`. Returns null if invalid. */
export function reorderFolderIdsBeforeTarget(
  ids: string[],
  draggedId: string,
  targetId: string
): string[] | null {
  if (draggedId === targetId) return null
  const from = ids.indexOf(draggedId)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0) return null
  const next = ids.filter((id) => id !== draggedId)
  const insertAt = next.indexOf(targetId)
  if (insertAt < 0) return null
  next.splice(insertAt, 0, draggedId)
  return next
}

/** Move `draggedId` to the end of the list. */
export function reorderFolderIdsToEnd(ids: string[], draggedId: string): string[] | null {
  if (!ids.includes(draggedId)) return null
  const next = ids.filter((id) => id !== draggedId)
  next.push(draggedId)
  return next
}

export function slugifyRepoSuggestion(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return s || 'notelab-workspace'
}

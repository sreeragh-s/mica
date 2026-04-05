import type { CSSProperties } from 'react'
import type { SerializedEditorState } from 'lexical'

import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'
import type { MacTitlebarStyles } from './notes-app-types'

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

/** Main window drag uses a single full-width band in `NotesApp` (macOS Electron); avoid extra `drag` rows. */

export function createEmptyNote(folderId: string): SavedNote {
  return {
    id: crypto.randomUUID(),
    updatedAt: Date.now(),
    content: null,
    folderId,
    title: 'New note',
    kind: 'note'
  }
}

export function createEmptyDrawing(folderId: string): SavedNote {
  return {
    id: crypto.randomUUID(),
    updatedAt: Date.now(),
    content: null,
    folderId,
    title: 'New drawing',
    kind: 'drawing',
    excalidrawScene: null
  }
}

export function isDrawingNote(note: SavedNote): boolean {
  return note.kind === 'drawing'
}

export function treeFolderId(folderId: string): string {
  return `folder:${folderId}`
}

export function treeNoteId(noteId: string): string {
  return `note:${noteId}`
}

/** DataTransfer type for dragging a note from the tree into the main editor area. */
export const NOTE_DRAG_MIME = 'application/x-notelab-note-id'

/** DataTransfer type for reordering workspace folders in the sidebar. */
export const FOLDER_DRAG_MIME = 'application/x-notelab-folder-id'

export function mergeFolderOrder(
  diskFolders: WorkspaceFolder[],
  preferredOrder: string[]
): WorkspaceFolder[] {
  const byId = new Map(diskFolders.map((f) => [f.id, f]))
  const out: WorkspaceFolder[] = []
  const seen = new Set<string>()
  for (const id of preferredOrder) {
    const f = byId.get(id)
    if (f) {
      out.push(f)
      seen.add(id)
    }
  }
  for (const f of diskFolders) {
    if (!seen.has(f.id)) out.push(f)
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

import type { CSSProperties } from 'react'
import type { SerializedEditorState } from 'lexical'

import type { SavedNote } from '@/lib/notes-storage'
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

export function createEmptyNote(folderId: string): SavedNote {
  return {
    id: crypto.randomUUID(),
    updatedAt: Date.now(),
    content: null,
    folderId,
    title: 'New note'
  }
}

export function treeFolderId(folderId: string): string {
  return `folder:${folderId}`
}

export function treeNoteId(noteId: string): string {
  return `note:${noteId}`
}

/** DataTransfer type for dragging a note from the tree into split view. */
export const NOTE_DRAG_MIME = 'application/x-gitnotes-note-id'

export function slugifyRepoSuggestion(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return s || 'gitnotes-workspace'
}

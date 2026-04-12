import type { SerializedEditorState } from 'lexical'

import { loadNotesState as loadNotesStateFromConfig } from '../config/notelab-app-config-read'
import { saveNotesState as persistNotesStateToConfig } from '../config/notelab-app-config-write'
import { extractPreviewText as extractPreviewTextImpl } from './notes-state-normalize'
import type { NotesState, SavedNote } from './notes-types'

export {
  DEFAULT_WORKSPACE_ID,
  type NoteKind,
  type NotePropertyMap,
  type NotePropertyValue,
  type NotesState,
  type NotesStateV2,
  type NotesStateV3,
  type SavedNote,
  type Folder
} from './notes-types'

export function loadNotesState(): NotesState {
  return loadNotesStateFromConfig()
}

export function saveNotesState(state: NotesState): void {
  persistNotesStateToConfig(state)
}

/** @deprecated Use loadNotesState; kept for narrow imports. */
export function loadNotes(): SavedNote[] {
  const s = loadNotesState()
  if (s.version === 3) return []
  return s.notes
}

/** @deprecated Use saveNotesState. */
export function saveNotes(notes: SavedNote[]): void {
  const state = loadNotesState()
  if (state.version === 3) return
  saveNotesState({ ...state, notes })
}

export function extractPreviewText(serialized: SerializedEditorState, maxLen = 72): string {
  return extractPreviewTextImpl(serialized, maxLen)
}

export { extractPlainTextFromSerialized } from './notes-state-normalize'

export function formatNoteTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(ts))
}

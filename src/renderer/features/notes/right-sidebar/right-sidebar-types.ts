import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'
import type { SavedNote, Folder } from '@/lib/notes/notes-storage'
import type { WorkspaceLinkMentionIndex } from '@/lib/notes/graph-types'

import type {
  RightSidebarLinkMode,
  RightSidebarPanel
} from '@/features/notes/right-sidebar/right-sidebar-panel-types'

export type {
  RightSidebarLinkMode,
  RightSidebarPanel
} from '@/features/notes/right-sidebar/right-sidebar-panel-types'

export type NoteLinksData = {
  backlinks: Array<{ note: SavedNote; contexts: string[] }>
  outgoing: Array<{ note: SavedNote; contexts: string[]; linkText: string[] }>
}

export type RightSidebarProps = {
  open: boolean
  notes: SavedNote[]
  folders: Folder[]
  workspacePath: string | null
  canAutoIndex: boolean
  indexingStatus: NotesAppViewModel['indexingStatus']
  runIndexPending: NotesAppViewModel['runIndexPending']
  selectedNote: SavedNote | null
  selectNote: (notePath: string) => void
  panel: RightSidebarPanel
  linkMode: RightSidebarLinkMode
  onLinkModeChange: (mode: RightSidebarLinkMode) => void
  /** macOS: pointer-events / no-drag on chat chrome controls. */
  isMacNotelab?: boolean
  /** Internal links computed from notes for graph expansion. */
  linkMentionIndex?: WorkspaceLinkMentionIndex | null
}

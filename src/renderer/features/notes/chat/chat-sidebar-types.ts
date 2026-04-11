import type { NotesAppViewModel } from '@/features/notes/app-state/useNotesApp'
import type { SavedNote, Folder } from '@/lib/notes/notes-storage'
import type { WorkspaceLinkMentionIndex } from '@/lib/notes/cache/notes-cache-types'

import type {
  ChatSidebarLinkMode,
  ChatSidebarPanel
} from '@/features/notes/chat/chat-sidebar-panel-types'

export type {
  ChatSidebarLinkMode,
  ChatSidebarPanel
} from '@/features/notes/chat/chat-sidebar-panel-types'

export type NoteLinksData = {
  backlinks: Array<{ note: SavedNote; contexts: string[] }>
  outgoing: Array<{ note: SavedNote; contexts: string[]; linkText: string[] }>
}

export type ChatSidebarProps = {
  open: boolean
  notes: SavedNote[]
  folders: Folder[]
  workspacePath: string | null
  canAutoIndex: boolean
  indexingStatus: NotesAppViewModel['indexingStatus']
  runIndexPending: NotesAppViewModel['runIndexPending']
  selectedNote: SavedNote | null
  selectNote: (notePath: string) => void
  panel: ChatSidebarPanel
  linkMode: ChatSidebarLinkMode
  onLinkModeChange: (mode: ChatSidebarLinkMode) => void
  /** macOS: pointer-events / no-drag on chat chrome controls. */
  isMacNotelab?: boolean
  /** Precomputed internal links (Dexie cache); omit to scan Lexical in-memory. */
  linkMentionIndex?: WorkspaceLinkMentionIndex | null
}

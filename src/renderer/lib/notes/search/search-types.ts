import type { SavedNote, Folder } from '@/lib/notes/notes-storage'

export type SearchMatchSegment = { text: string; highlight: boolean }

export type NoteSearchResult = {
  note: SavedNote
  score: number
  titleSegments: SearchMatchSegment[]
  snippetSegments: SearchMatchSegment[]
  folderName: string
}

export type FolderSearchResult = {
  folder: Folder
  score: number
  nameSegments: SearchMatchSegment[]
}

/** Saved chat session row (same shape as `ChatHistoryMeta` in `useNotesChat`). */
export type ChatHistorySessionMeta = {
  sessionId: string
  title: string
  createdAt: number
  messageCount: number
}

export type ChatHistorySearchResult = {
  meta: ChatHistorySessionMeta
  titleSegments: SearchMatchSegment[]
  score: number
}

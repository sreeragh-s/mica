export type {
  ChatHistorySearchResult,
  ChatHistorySessionMeta,
  FolderSearchResult,
  NoteSearchResult,
  SearchMatchSegment
} from './search-types'

export { buildHighlightSegments, scoreMatch, tokenizeQuery } from './query-match'
export { searchNotes } from './search-notes'
export { searchFolders } from './search-folders'
export { searchChatHistorySessions } from './search-chat-history'

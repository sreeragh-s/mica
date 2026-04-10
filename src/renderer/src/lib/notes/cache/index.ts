export type {
  CachedLinkMention,
  NotesPropertyCatalog,
  NotesWorkspaceCacheSnapshot,
  WorkspaceLinkMentionIndex
} from './notes-cache-types'
export {
  clearNotesWorkspaceCache,
  reindexNotesWorkspaceCache,
  resolveNotesWorkspaceCacheKey
} from './sync-notes-cache'

import type { IndexingNoteStatus, IndexingStatus } from '@/lib/ai/embedding-pipeline'
import { DEFAULT_WORKSPACE_ID, type NotePropertyMap } from '@/lib/notes/notes-storage'

/** Root notes have no folder node in the tree; only user workspaces expand. */
export function treeExpandIdsForFolderId(folder: string): string[] {
  return folder === DEFAULT_WORKSPACE_ID ? [] : [`folder:${folder}`]
}

export function summarizeIndexingCounts(
  notes: IndexingNoteStatus[]
): Pick<IndexingStatus, 'pendingCount' | 'indexedCount'> {
  return {
    pendingCount: notes.filter((note) => note.state === 'pending').length,
    indexedCount: notes.filter((note) => note.state === 'indexed').length
  }
}

export type GitSourceControlFile = {
  path: string
  x: string
  y: string
  staged: boolean
  conflicted: boolean
}

export type GitSourceControlSnapshot = {
  files: GitSourceControlFile[]
  hasConflicts: boolean
  isRebasing: boolean
}

export type NotelabIndexOk = {
  ok: true
  folders: { folder: string; name: string }[]
  notes: {
    folder: string
    note: string
    title: string
    updatedAtMs: number
    markdownBody: string
    kind?: 'note' | 'drawing' | 'pdf'
    coverImageSrc?: string
    titleEmoji?: string
    properties?: NotePropertyMap
    hasFrontmatterBlock?: boolean
  }[]
}

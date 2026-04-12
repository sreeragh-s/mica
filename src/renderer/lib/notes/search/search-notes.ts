import { DEFAULT_WORKSPACE_ID, type SavedNote, type Folder } from '@/lib/notes/notes-storage'
import { getApi } from '@/bridges/auth/auth-bridge'

import { buildHighlightSegments } from './query-match'
import type { NoteSearchResult, SearchMatchSegment } from './search-types'

export type { NoteSearchResult } from './search-types'

function buildBodySnippet(lineText: string, query: string, maxLength = 160): SearchMatchSegment[] {
  const trimmed = lineText.trim()
  if (!trimmed) return [{ text: '', highlight: false }]
  const lowerLine = trimmed.toLowerCase()
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return [{ text: trimmed.slice(0, maxLength), highlight: false }]

  const matchIndex = lowerLine.indexOf(lowerQuery)
  if (matchIndex === -1) {
    const preview = trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed
    return [{ text: preview, highlight: false }]
  }

  const context = Math.max(0, Math.floor((maxLength - lowerQuery.length) / 2))
  const sliceStart = Math.max(0, matchIndex - context)
  const sliceEnd = Math.min(trimmed.length, matchIndex + lowerQuery.length + context)
  const prefix = sliceStart > 0 ? '…' : ''
  const suffix = sliceEnd < trimmed.length ? '…' : ''
  const core = trimmed.slice(sliceStart, sliceEnd)
  return [
    ...(prefix ? [{ text: prefix, highlight: false as const }] : []),
    ...buildHighlightSegments(core, query),
    ...(suffix ? [{ text: suffix, highlight: false as const }] : [])
  ]
}

export async function searchNotes(
  notes: SavedNote[],
  folders: Folder[],
  query: string,
  workspaceRoot: string | null,
  options?: {
    limit?: number
  }
): Promise<NoteSearchResult[]> {
  const q = query.trim()
  if (!q || !workspaceRoot) return []

  const api = getApi()
  if (!api?.workspace?.searchNotes) return []

  const limit = options?.limit ?? 50
  const folderName = (id: string): string =>
    id === DEFAULT_WORKSPACE_ID
      ? 'Root'
      : (folders.find((f) => f.folder === id)?.name ?? 'Workspace')

  const response = await api.workspace.searchNotes({ cwd: workspaceRoot, query: q, limit })
  if (!response.ok) {
    console.warn('[notes-search] workspace search failed', response.error)
    return []
  }

  const noteByPath = new Map(notes.map((note) => [note.path, note]))
  const seenPaths = new Set<string>()

  return response.hits
    .map((hit, index) => {
      const note = noteByPath.get(hit.notePath)
      if (!note) return null
      if (seenPaths.has(note.path)) return null
      seenPaths.add(note.path)
      return {
        note,
        score: limit - index,
        titleSegments: buildHighlightSegments(note.title || 'Untitled', q),
        snippetSegments: buildBodySnippet(hit.lineText, q),
        folderName: folderName(note.folder)
      }
    })
    .filter((result): result is NoteSearchResult => result !== null)
}

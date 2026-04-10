import {
  DEFAULT_WORKSPACE_ID,
  extractPlainTextFromSerialized,
  type SavedNote,
  type Folder
} from '@/lib/notes/notes-storage'

import { isDrawingNote } from '@/features/notes/notes-app-utils'
import { extractAliasStrings, extractTagStrings } from '@/lib/notes/cache/extract-note-cache-fields'

import { buildHighlightSegments, scoreMatch } from './query-match'
import { highlightInBodySlice, snippetSlice } from './snippet'
import type { NoteSearchResult, SearchMatchSegment } from './search-types'

export type { NoteSearchResult } from './search-types'

export function searchNotes(
  notes: SavedNote[],
  folders: Folder[],
  query: string,
  options?: {
    limit?: number
    /** Pre-extracted plain text per path (Dexie cache); falls back to Lexical walk when missing. */
    plainTextByPath?: ReadonlyMap<string, string> | null
  }
): NoteSearchResult[] {
  const q = query.trim()
  if (!q) return []

  const folderName = (id: string): string =>
    id === DEFAULT_WORKSPACE_ID
      ? 'Root'
      : (folders.find((f) => f.folder === id)?.name ?? 'Workspace')

  const limit = options?.limit ?? 50
  const cache = options?.plainTextByPath ?? null
  const scored: NoteSearchResult[] = []

  for (const note of notes) {
    const title = note.title?.trim() || 'Untitled'
    const titleExtras = [...extractAliasStrings(note.properties), ...extractTagStrings(note.properties)]
      .join(' ')
      .trim()
    const titleHaystack = titleExtras ? `${title} ${titleExtras}` : title
    const cachedBody = cache?.get(note.path)
    const body = isDrawingNote(note)
      ? ''
      : (cachedBody ?? extractPlainTextFromSerialized(note.content))
    const st = scoreMatch(q, titleHaystack)
    const sb = body ? scoreMatch(q, body) : null
    if (st === null && sb === null) continue
    const best = Math.max(st ?? 0, sb ?? 0)

    const titleSegments = buildHighlightSegments(title, q)
    let snippetSegments: SearchMatchSegment[]
    if (body && sb !== null) {
      const { core, sliceStart } = snippetSlice(body, q)
      snippetSegments = highlightInBodySlice(body, sliceStart, core, q)
    } else if (body) {
      const preview = body.length > 160 ? `${body.slice(0, 160)}…` : body
      snippetSegments = [{ text: preview, highlight: false }]
    } else {
      snippetSegments = [{ text: isDrawingNote(note) ? 'Drawing' : 'Empty note', highlight: false }]
    }

    scored.push({
      note,
      score: best,
      titleSegments,
      snippetSegments,
      folderName: folderName(note.folder)
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.note.updatedAt - a.note.updatedAt
  })

  return scored.slice(0, limit)
}

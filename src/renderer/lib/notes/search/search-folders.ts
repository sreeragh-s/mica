import type { Folder } from '@/lib/notes/notes-storage'

import { buildHighlightSegments, scoreMatch } from './query-match'
import type { FolderSearchResult } from './search-types'

export type { FolderSearchResult } from './search-types'

export function searchFolders(
  folders: Folder[],
  query: string,
  options?: { limit?: number }
): FolderSearchResult[] {
  const q = query.trim()
  if (!q) return []

  const limit = options?.limit ?? 50
  const scored: FolderSearchResult[] = []

  for (const folder of folders) {
    const name = folder.name?.trim() || 'Untitled folder'
    const st = scoreMatch(q, name)
    if (st === null) continue
    scored.push({
      folder,
      score: st,
      nameSegments: buildHighlightSegments(name, q)
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.folder.name.localeCompare(b.folder.name)
  })

  return scored.slice(0, limit)
}

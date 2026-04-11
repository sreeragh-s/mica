import { useMemo } from 'react'

import type { NotesPropertyCatalog } from '@/lib/notes/cache/notes-cache-types'
import type { SavedNote } from '@/lib/notes/notes-storage'
import { buildPropertyCatalogFromNotes } from '@/lib/notes/note-properties/property-catalog'

/**
 * Prefer Dexie-backed catalog after at least one successful workspace reindex (`cached` non-null).
 * Until then, derive from live notes.
 */
export function useWorkspacePropertyCatalog(
  notes: SavedNote[],
  cached: NotesPropertyCatalog | null | undefined
): NotesPropertyCatalog {
  return useMemo(() => {
    if (cached != null) return cached
    return buildPropertyCatalogFromNotes(notes)
  }, [notes, cached])
}

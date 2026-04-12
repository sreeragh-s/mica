import { useMemo } from 'react'

import type { SavedNote } from '@/lib/notes/notes-storage'
import type { NotesPropertyCatalog } from '@/lib/notes/graph-types'
import { buildPropertyCatalogFromNotes } from '@/lib/notes/note-properties/property-catalog'

export function useWorkspacePropertyCatalog(notes: SavedNote[]): NotesPropertyCatalog {
  return useMemo(() => buildPropertyCatalogFromNotes(notes), [notes])
}

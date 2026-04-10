import type { SavedNote } from '@/lib/notes/notes-storage'

import type { NotesPropertyCatalog } from '@/lib/notes/cache/notes-cache-types'

export const NOTE_PROPERTY_UI_KEYS = new Set(['cover_image', 'title_emoji'])

/** Build property key/value suggestions from in-memory notes (fallback when cache is empty). */
export function buildPropertyCatalogFromNotes(notes: SavedNote[]): NotesPropertyCatalog {
  const keys = new Set<string>()
  const valueMap = new Map<string, Set<string>>()
  for (const n of notes) {
    for (const [k, v] of Object.entries(n.properties ?? {})) {
      if (NOTE_PROPERTY_UI_KEYS.has(k)) continue
      keys.add(k)
      if (!v) continue
      if (!valueMap.has(k)) valueMap.set(k, new Set())
      valueMap.get(k)!.add(v)
    }
  }
  const allValuesForKey: Record<string, string[]> = {}
  for (const [k, set] of valueMap) {
    allValuesForKey[k] = Array.from(set).sort()
  }
  return {
    allWorkspaceKeys: Array.from(keys).sort(),
    allValuesForKey
  }
}

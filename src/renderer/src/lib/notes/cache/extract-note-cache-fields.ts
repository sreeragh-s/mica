import { isDrawingNote } from '@/components/notes/notes-app-utils'
import {
  collectInternalNoteLinkMentions,
  type InternalNoteLinkMention
} from '@/lib/notes/note-link-graph'
import { extractPlainTextFromSerialized } from '@/lib/notes/notes-storage'
import type { SavedNote } from '@/lib/notes/notes-storage'

import { NOTE_PROPERTY_UI_KEYS } from '@/lib/notes/note-properties/property-catalog'

export function extractTagStrings(properties: SavedNote['properties']): string[] {
  if (!properties) return []
  const raw =
    properties.tags ?? properties.tag ?? properties.categories ?? properties.category ?? ''
  if (!raw.trim()) return []
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function notePlainTextForSearch(note: SavedNote): string {
  if (isDrawingNote(note)) return ''
  return extractPlainTextFromSerialized(note.content)
}

export function serializePropertiesForCache(note: SavedNote): string {
  const props = note.properties ?? {}
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(props)) {
    if (NOTE_PROPERTY_UI_KEYS.has(k)) continue
    if (v) filtered[k] = v
  }
  return JSON.stringify(filtered)
}

export function collectNoteLinkMentions(note: SavedNote): InternalNoteLinkMention[] {
  if (note.kind === 'drawing') return []
  return collectInternalNoteLinkMentions(note.content)
}

import { isDrawingNote } from '@/features/notes/notes-app-utils'
import {
  collectInternalNoteLinkMentions,
  type InternalNoteLinkMention
} from '@/lib/notes/note-link-graph'
import { NOTE_PROPERTY_UI_KEYS } from '@/lib/notes/note-properties/property-catalog'
import {
  extractPlainTextFromSerialized,
  type NotePropertyMap,
  type NotePropertyValue,
  type SavedNote
} from '@/lib/notes/notes-storage'
import { stripDataUrlBase64Payloads } from '@/lib/notes/notes-state-normalize'

function readMultiKeyStrings(
  properties: SavedNote['properties'],
  keys: readonly string[]
): string[] {
  if (!properties) return []
  for (const k of keys) {
    const v = properties[k]
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) {
      return v.map((s) => s.trim()).filter(Boolean)
    }
    if (typeof v === 'string' && v.trim()) {
      return v
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

export function extractTagStrings(properties: SavedNote['properties']): string[] {
  return readMultiKeyStrings(properties, ['tags', 'tag', 'categories', 'category'])
}

export function extractAliasStrings(properties: SavedNote['properties']): string[] {
  return readMultiKeyStrings(properties, ['aliases', 'alias'])
}

function sanitizePropValue(v: NotePropertyValue): NotePropertyValue {
  if (Array.isArray(v)) return v.map((s) => stripDataUrlBase64Payloads(s))
  return stripDataUrlBase64Payloads(v)
}

export function notePlainTextForSearch(note: SavedNote): string {
  if (isDrawingNote(note)) return ''
  const body = extractPlainTextFromSerialized(note.content)
  const aliases = extractAliasStrings(note.properties).join(' ')
  const tags = extractTagStrings(note.properties).join(' ')
  const extra = [aliases, tags].filter(Boolean).join(' ')
  if (!extra) return body
  return body ? `${body} ${extra}`.trim() : extra
}

export function serializePropertiesForCache(note: SavedNote): string {
  const props = note.properties ?? {}
  const filtered: NotePropertyMap = {}
  for (const [k, v] of Object.entries(props)) {
    if (NOTE_PROPERTY_UI_KEYS.has(k)) continue
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    filtered[k] = sanitizePropValue(v)
  }
  return JSON.stringify(filtered)
}

export function collectNoteLinkMentions(note: SavedNote): InternalNoteLinkMention[] {
  if (note.kind === 'drawing') return []
  return collectInternalNoteLinkMentions(note.content)
}

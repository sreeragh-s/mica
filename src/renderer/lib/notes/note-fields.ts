import type { SavedNote } from '@/lib/notes/notes-storage'

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

import type { NotePropertyValue } from '@/lib/notes/notes-storage'

/** Keys edited as comma-separated lists in the properties panel (stored as string[] in frontmatter). */
export const MULTI_VALUE_PROPERTY_KEYS = new Set([
  'tags',
  'tag',
  'aliases',
  'alias',
  'categories',
  'category'
])

export function isMultiValuePropertyKey(key: string): boolean {
  return MULTI_VALUE_PROPERTY_KEYS.has(key.toLowerCase())
}

export function displayPropertyValue(value: NotePropertyValue | undefined): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(', ')
  return value
}

/** Split user input into a string array for multi-value keys; otherwise return scalar string. */
export function parsePropertyInput(key: string, raw: string): NotePropertyValue | null {
  const t = raw.trim()
  if (!t) return null
  if (!isMultiValuePropertyKey(key)) return raw
  return t
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** For catalog: add every displayable token from `value` under `key` (splits comma-scalars for multi keys). */
export function addPropertyValueTokens(
  key: string,
  value: NotePropertyValue,
  target: Set<string>
): void {
  if (Array.isArray(value)) {
    for (const s of value) {
      const u = s.trim()
      if (u) target.add(u)
    }
    return
  }
  const t = value.trim()
  if (!t) return
  if (isMultiValuePropertyKey(key)) {
    for (const part of t.split(/[,;]/).map((s) => s.trim())) {
      if (part) target.add(part)
    }
    return
  }
  target.add(t)
}

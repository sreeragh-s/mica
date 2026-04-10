/**
 * Contextual value chips for the properties panel, keyed the same way as {@link PropertyIcon}.
 */

/** Keys that show “Generate UUID” and hide UUID-shaped values from the workspace catalog. */
export function isUuidLikePropertyKey(propKey: string): boolean {
  const k = propKey.toLowerCase()
  if (k === 'uuid' || k === 'guid') return true
  if (k.includes('uuid')) return true
  return false
}

/** Shown in the value dropdown; picking it inserts a new random UUID. */
export const GENERATE_UUID_SUGGESTION_LABEL = 'Generate UUID'

const UUID_DASHED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** True for common UUID / GUID string shapes (other notes’ catalog values). */
export function looksLikeUuidValue(value: string): boolean {
  const t = value.trim()
  if (UUID_DASHED.test(t)) return true
  if (/^[0-9a-f]{32}$/i.test(t)) return true
  if (
    /^\{[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}$/i.test(
      t
    )
  ) {
    return true
  }
  return false
}

export function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function smartValuesForPropertyKey(propKey: string, now: Date): string[] {
  const k = propKey.toLowerCase()
  if (isUuidLikePropertyKey(k)) return []
  const ymd = formatLocalYmd(now)
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const iso = now.toISOString()

  if (k === 'aliases' || k === 'alias') return []
  if (k === 'tags' || k === 'tag' || k === 'category' || k === 'categories') {
    return ['idea', 'reference', 'project', 'personal', 'work']
  }
  if (k.includes('url') || k.includes('link') || k.includes('href') || k === 'source') {
    return ['https://']
  }
  if (
    k.includes('count') ||
    k.includes('num') ||
    k.includes('rating') ||
    k.includes('order') ||
    k.includes('weight')
  ) {
    if (k.includes('rating')) return ['1', '2', '3', '4', '5']
    return ['0', '1', '2', '3', '5', '10']
  }
  if (
    k.includes('desc') ||
    k.includes('summary') ||
    k.includes('excerpt') ||
    k.includes('abstract')
  ) {
    return []
  }
  if (
    k.includes('author') ||
    k.includes('creator') ||
    k.includes('owner') ||
    k.includes('assign') ||
    k.includes('by')
  ) {
    return []
  }
  if (
    k.includes('date') ||
    k.includes('created') ||
    k.includes('published') ||
    k.includes('modified') ||
    k.includes('updated')
  ) {
    return [ymd, iso]
  }
  if (k.includes('time') || k.includes('duration') || k.includes('deadline') || k.includes('due')) {
    return [hm, iso]
  }
  if (
    k.includes('location') ||
    k.includes('place') ||
    k.includes('city') ||
    k.includes('country') ||
    k.includes('region')
  ) {
    return []
  }
  if (k === 'status') {
    return ['draft', 'active', 'done', 'archived', 'cancelled']
  }
  if (k === 'type') {
    return ['note', 'task', 'reference', 'project']
  }
  if (k.includes('timestamp')) {
    return [iso, ymd, hm]
  }
  return []
}

export function resolvePickedValueSuggestion(picked: string): string {
  return picked === GENERATE_UUID_SUGGESTION_LABEL ? randomUuid() : picked
}

/**
 * Built-in suggestions first (e.g. today’s date for date-like keys), then workspace values.
 * Respects `valueDraft` as a case-insensitive filter; omits the current saved value.
 * For UUID-like keys, workspace entries that {@link looksLikeUuidValue} are omitted.
 */
export type BuildPropertyValueSuggestionsOptions = {
  now?: Date
}

export function buildPropertyValueSuggestions(
  workspaceValues: readonly string[],
  propKey: string,
  valueDraft: string,
  savedValue: string,
  options?: BuildPropertyValueSuggestionsOptions
): string[] {
  const now = options?.now ?? new Date()
  const q = valueDraft.trim().toLowerCase()
  const seen = new Set<string>()
  const out: string[] = []

  const matches = (v: string): boolean => {
    if (v === savedValue) return false
    if (!v.toLowerCase().includes(q)) return false
    return true
  }

  const push = (v: string): void => {
    if (!matches(v) || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }

  if (isUuidLikePropertyKey(propKey)) {
    push(GENERATE_UUID_SUGGESTION_LABEL)
  }

  for (const v of smartValuesForPropertyKey(propKey, now)) {
    push(v)
  }

  const workspaceFiltered =
    isUuidLikePropertyKey(propKey) ? workspaceValues.filter((v) => !looksLikeUuidValue(v)) : workspaceValues

  for (const v of workspaceFiltered) {
    push(v)
  }
  return out
}

/**
 * Contextual value chips for the properties panel, keyed the same way as {@link PropertyIcon}.
 */

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function smartValuesForPropertyKey(propKey: string, now: Date): string[] {
  const k = propKey.toLowerCase()
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

/**
 * Built-in suggestions first (e.g. today’s date for date-like keys), then workspace values.
 * Respects `valueDraft` as a case-insensitive filter; omits the current saved value.
 */
export function buildPropertyValueSuggestions(
  workspaceValues: readonly string[],
  propKey: string,
  valueDraft: string,
  savedValue: string,
  now: Date = new Date()
): string[] {
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

  for (const v of smartValuesForPropertyKey(propKey, now)) {
    push(v)
  }
  for (const v of workspaceValues) {
    push(v)
  }
  return out
}

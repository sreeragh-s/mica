import type { JSX } from 'react'
import {
  AlignLeft,
  Calendar,
  Clock,
  CornerDownRight,
  Fingerprint,
  Hash,
  Link,
  MapPin,
  Tag,
  Type,
  User
} from 'lucide-react'

/**
 * Canonical keys surfaced in property key pickers (after workspace matches). Each entry is chosen
 * so `PropertyIcon` resolves to the same icon category as common real-world frontmatter names.
 */
export const SUGGESTED_PROPERTY_KEYS: readonly string[] = [
  'aliases',
  'alias',
  'tags',
  'category',
  'categories',
  'title',
  'status',
  'type',
  'description',
  'summary',
  'excerpt',
  'abstract',
  'author',
  'creator',
  'owner',
  'url',
  'link',
  'source',
  'date',
  'created',
  'published',
  'modified',
  'updated',
  'time',
  'duration',
  'deadline',
  'due',
  'guid',
  'uuid',
  'location',
  'place',
  'city',
  'country',
  'region',
  'rating',
  'order',
  'count',
  'weight'
]

/**
 * Workspace keys first (catalog order), then {@link SUGGESTED_PROPERTY_KEYS} not already present.
 * Matching is case-insensitive; `exclude` holds keys (e.g. already on the note) omitted from results.
 */
export function buildPropertyKeySuggestions(
  query: string,
  workspaceKeys: readonly string[],
  exclude: ReadonlySet<string>
): string[] {
  const q = query.trim().toLowerCase()
  const excluded = new Set([...exclude].map((k) => k.toLowerCase()))
  const seenLower = new Set<string>()
  const out: string[] = []

  const push = (key: string): void => {
    const kl = key.toLowerCase()
    if (excluded.has(kl) || seenLower.has(kl)) return
    if (!kl.includes(q)) return
    seenLower.add(kl)
    out.push(key)
  }

  for (const k of workspaceKeys) push(k)
  for (const k of SUGGESTED_PROPERTY_KEYS) push(k)
  return out
}

export function PropertyIcon({ propKey }: { propKey: string }): JSX.Element {
  const k = propKey.toLowerCase()
  const cls = 'size-4 shrink-0 text-muted-foreground'
  if (k === 'aliases') return <CornerDownRight className={cls} />
  if (k === 'tags' || k === 'category' || k === 'categories') return <Tag className={cls} />
  if (k === 'uuid' || k === 'guid' || k.includes('uuid')) {
    return <Fingerprint className={cls} />
  }
  if (k.includes('url') || k.includes('link') || k.includes('href') || k === 'source') {
    return <Link className={cls} />
  }
  if (
    k.includes('count') ||
    k.includes('num') ||
    k.includes('rating') ||
    k.includes('order') ||
    k.includes('weight')
  ) {
    return <Hash className={cls} />
  }
  if (
    k.includes('desc') ||
    k.includes('summary') ||
    k.includes('excerpt') ||
    k.includes('abstract')
  ) {
    return <AlignLeft className={cls} />
  }
  if (
    k.includes('author') ||
    k.includes('creator') ||
    k.includes('owner') ||
    k.includes('assign') ||
    k.includes('by')
  ) {
    return <User className={cls} />
  }
  if (
    k.includes('date') ||
    k.includes('created') ||
    k.includes('published') ||
    k.includes('modified') ||
    k.includes('updated')
  ) {
    return <Calendar className={cls} />
  }
  if (k.includes('time') || k.includes('duration') || k.includes('deadline') || k.includes('due')) {
    return <Clock className={cls} />
  }
  if (
    k.includes('location') ||
    k.includes('place') ||
    k.includes('city') ||
    k.includes('country') ||
    k.includes('region')
  ) {
    return <MapPin className={cls} />
  }
  return <Type className={cls} />
}

/** Hash fragment used in editor links to open another note or drawing in-app. */
const HASH_PREFIX = '#gitnotes/note/'

export function buildInternalNoteLinkHref(noteId: string): string {
  return `${HASH_PREFIX}${noteId}`
}

export function parseInternalNoteIdFromHref(href: string): string | null {
  const m = href.match(/#gitnotes\/note\/([^#?]+)/)
  if (m?.[1]) return m[1]
  try {
    const u = new URL(href, typeof window !== 'undefined' ? window.location.href : 'http://localhost/')
    if (u.hash.startsWith('#gitnotes/note/')) {
      const id = u.hash.slice('#gitnotes/note/'.length)
      return id || null
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Hash fragment used in editor links to open another note or drawing in-app. */
const HASH_PREFIX = '#notelab/note/'

export function buildInternalNoteLinkHref(notePath: string): string {
  return `${HASH_PREFIX}${notePath}`
}

export function parseInternalNotePathFromHref(href: string): string | null {
  const m = href.match(/#notelab\/note\/([^#?]+)/)
  if (m?.[1]) return m[1]
  try {
    const u = new URL(href, typeof window !== 'undefined' ? window.location.href : 'http://localhost/')
    if (u.hash.startsWith('#notelab/note/')) {
      const notePath = u.hash.slice('#notelab/note/'.length)
      return notePath || null
    }
  } catch {
    /* ignore */
  }
  return null
}

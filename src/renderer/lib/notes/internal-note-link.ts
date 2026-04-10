/** Hash fragment used in editor links to open another note or drawing in-app. */
const HASH_PREFIX = '#notelab/note/'

export function buildInternalNoteLinkHref(
  notePath: string,
  subpath = ''
): string {
  return `${HASH_PREFIX}${notePath}${subpath}`
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

/** Returns the `#heading` subpath portion of an internal note link href, or empty string if none. */
export function parseInternalNoteSubpathFromHref(href: string): string {
  // href looks like: #notelab/note/path/to/note.md#heading-text
  // The note path itself may not contain '#', so the second '#' is the subpath.
  const prefixMatch = href.match(/#notelab\/note\/[^#?]+/)
  if (!prefixMatch) return ''
  const afterPrefix = href.slice(prefixMatch.index! + prefixMatch[0].length)
  return afterPrefix.startsWith('#') ? afterPrefix : ''
}

import type { SearchMatchSegment } from './search-types'

/** Tokenize query into non-empty lower-case tokens. */
export function tokenizeQuery(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Check if all query tokens appear as prefixes of words in the text (stem match). */
export function matchAsPrefixes(text: string, tokens: string[]): boolean {
  const lowerText = text.toLowerCase()
  const words = lowerText.split(/[\s\-_/.,;:'"()[\]{}]+/)
  return tokens.every((tok) => words.some((word) => word.startsWith(tok)))
}

/** Find prefix match positions in text, returning indices of each token's start position. */
export function findPrefixPositions(
  text: string,
  tokens: string[]
): { tokenIdx: number; startIndex: number }[] {
  const lowerText = text.toLowerCase()
  const words = lowerText.split(/[\s\-_/.,;:'"()[\]{}]+/)
  const positions: { tokenIdx: number; startIndex: number }[] = []
  let wordOffset = 0
  for (const word of words) {
    for (let i = 0; i < tokens.length; i++) {
      if (word.startsWith(tokens[i]!)) {
        positions.push({ tokenIdx: i, startIndex: wordOffset })
      }
    }
    wordOffset += word.length + 1
  }
  return positions
}

/** Subsequence match positions in haystack (same length as query when matched). */
export function findSubsequenceIndices(haystack: string, query: string): number[] | null {
  const h = haystack.toLowerCase()
  const q = query.toLowerCase()
  if (!q.length) return []
  const indices: number[] = []
  let qi = 0
  for (let i = 0; i < h.length && qi < q.length; i++) {
    if (h[i] === q[qi]) {
      indices.push(i)
      qi++
    }
  }
  return qi === q.length ? indices : null
}

function segmentsFromIndexSet(str: string, highlight: Set<number>): SearchMatchSegment[] {
  if (str.length === 0) return []
  const out: SearchMatchSegment[] = []
  let i = 0
  while (i < str.length) {
    const hi = highlight.has(i)
    let j = i + 1
    while (j < str.length && highlight.has(j) === hi) j++
    out.push({ text: str.slice(i, j), highlight: hi })
    i = j
  }
  return out
}

export function buildSegmentsFromPositions(
  str: string,
  positions: { tokenIdx: number; startIndex: number }[],
  tokenLengths: number[]
): SearchMatchSegment[] {
  if (positions.length === 0) return [{ text: str, highlight: false }]
  const highlightRanges: [number, number][] = positions.map((p, i) => [
    p.startIndex,
    p.startIndex + tokenLengths[i]!
  ])
  highlightRanges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of highlightRanges) {
    if (merged.length > 0 && merged[merged.length - 1]![1] >= range[0]) {
      merged[merged.length - 1]![1] = Math.max(merged[merged.length - 1]![1], range[1])
    } else {
      merged.push(range)
    }
  }
  const segments: SearchMatchSegment[] = []
  let pos = 0
  for (const [start, end] of merged) {
    if (start > pos) segments.push({ text: str.slice(pos, start), highlight: false })
    segments.push({ text: str.slice(start, end), highlight: true })
    pos = end
  }
  if (pos < str.length) segments.push({ text: str.slice(pos), highlight: false })
  return segments
}

export function buildHighlightSegments(haystack: string, query: string): SearchMatchSegment[] {
  const q = query.trim()
  if (!q || !haystack) return [{ text: haystack, highlight: false }]
  const tokens = tokenizeQuery(q)
  if (tokens.length === 0) return [{ text: haystack, highlight: false }]
  if (tokens.length === 1) {
    const lowerH = haystack.toLowerCase()
    const lowerQ = tokens[0]!
    const idx = lowerH.indexOf(lowerQ)
    if (idx !== -1) {
      const parts: SearchMatchSegment[] = []
      if (idx > 0) parts.push({ text: haystack.slice(0, idx), highlight: false })
      parts.push({ text: haystack.slice(idx, idx + q.length), highlight: true })
      if (idx + q.length < haystack.length) {
        parts.push({ text: haystack.slice(idx + q.length), highlight: false })
      }
      return parts
    }
    const sub = findSubsequenceIndices(haystack, q)
    if (!sub) return [{ text: haystack, highlight: false }]
    const set = new Set(sub)
    return segmentsFromIndexSet(haystack, set)
  }
  const positions = findPrefixPositions(haystack, tokens)
  if (positions.length < tokens.length) return [{ text: haystack, highlight: false }]
  const tokenLengths = tokens.map((t) => t.length)
  return buildSegmentsFromPositions(haystack, positions, tokenLengths)
}

export function scoreMatch(query: string, haystack: string): number | null {
  const q = query.trim()
  if (!q.length) return null
  const h = haystack.toLowerCase()
  if (!h.length) return null
  const tokens = tokenizeQuery(q)
  if (tokens.length === 0) return null
  if (tokens.length === 1) {
    const idx = h.indexOf(tokens[0]!)
    if (idx !== -1) return 100_000 - idx - q.length
    let qi = 0
    let score = 0
    let streak = 0
    for (let i = 0; i < h.length && qi < q.length; i++) {
      if (h[i] === q[qi]) {
        streak++
        score += 40 + streak * 8
        if (i > 0 && (/\s/.test(h[i - 1]!) || h[i - 1] === '/' || h[i - 1] === '(')) {
          score += 12
        }
        qi++
      } else {
        streak = 0
      }
    }
    if (qi < q.length) return null
    return 500 + score
  }
  if (tokens.length > 1) {
    if (!matchAsPrefixes(haystack, tokens)) return null
    const positions = findPrefixPositions(haystack, tokens)
    if (positions.length < tokens.length) return null
    let score = 0
    const sortedPos = [...positions].sort((a, b) => a.startIndex - b.startIndex)
    for (let i = 0; i < sortedPos.length; i++) {
      score += 100 - sortedPos[i]!.startIndex
      if (i > 0) {
        const gap = sortedPos[i]!.startIndex - sortedPos[i - 1]!.startIndex
        if (gap < 8) score += 20
      }
    }
    return score
  }
  return null
}

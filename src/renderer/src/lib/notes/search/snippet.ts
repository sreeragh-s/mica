import type { SearchMatchSegment } from './search-types'
import {
  buildSegmentsFromPositions,
  findPrefixPositions,
  findSubsequenceIndices,
  tokenizeQuery
} from './query-match'

function firstMatchCharIndex(body: string, query: string): number {
  const q = query.trim()
  if (!q) return 0
  const lowerB = body.toLowerCase()
  const tokens = tokenizeQuery(q)
  if (tokens.length === 1) {
    const idx = lowerB.indexOf(tokens[0]!)
    if (idx !== -1) return idx
    const sub = findSubsequenceIndices(lowerB, tokens[0]!)
    return sub && sub.length > 0 ? sub[0]! : 0
  }
  const positions = findPrefixPositions(body, tokens)
  if (positions.length === 0) return 0
  return Math.min(...positions.map((p) => p.startIndex))
}

export function snippetSlice(body: string, query: string): { core: string; sliceStart: number } {
  const q = query.trim()
  if (!body) return { core: '', sliceStart: 0 }
  const fm = firstMatchCharIndex(body, q)
  const pad = 72
  const sliceStart = Math.max(0, fm - pad)
  const sliceEnd = Math.min(body.length, fm + q.length + pad)
  return { core: body.slice(sliceStart, sliceEnd), sliceStart }
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

export function highlightInBodySlice(
  fullBody: string,
  sliceStart: number,
  core: string,
  query: string
): SearchMatchSegment[] {
  const q = query.trim()
  if (!core) return []
  const prefix = sliceStart > 0 ? '…' : ''
  const suffix = sliceStart + core.length < fullBody.length ? '…' : ''
  const rel = core
  const tokens = tokenizeQuery(q)
  if (tokens.length === 0) return [{ text: rel, highlight: false }]
  if (tokens.length === 1) {
    const lowerRel = rel.toLowerCase()
    const lowerQ = tokens[0]!
    const idx = lowerRel.indexOf(lowerQ)
    if (idx !== -1) {
      const mid: SearchMatchSegment[] = []
      if (idx > 0) mid.push({ text: rel.slice(0, idx), highlight: false })
      mid.push({ text: rel.slice(idx, idx + tokens[0]!.length), highlight: true })
      if (idx + tokens[0]!.length < rel.length) {
        mid.push({ text: rel.slice(idx + tokens[0]!.length), highlight: false })
      }
      return [
        ...(prefix ? [{ text: prefix, highlight: false as const }] : []),
        ...mid,
        ...(suffix ? [{ text: suffix, highlight: false as const }] : [])
      ]
    }
    const sub = findSubsequenceIndices(rel, tokens[0]!)
    if (!sub) {
      return [
        ...(prefix ? [{ text: prefix, highlight: false as const }] : []),
        { text: rel, highlight: false },
        ...(suffix ? [{ text: suffix, highlight: false as const }] : [])
      ]
    }
    const set = new Set(sub)
    const mid = segmentsFromIndexSet(rel, set)
    return [
      ...(prefix ? [{ text: prefix, highlight: false as const }] : []),
      ...mid,
      ...(suffix ? [{ text: suffix, highlight: false as const }] : [])
    ]
  }
  const positions = findPrefixPositions(rel, tokens)
  if (positions.length < tokens.length) {
    return [
      ...(prefix ? [{ text: prefix, highlight: false as const }] : []),
      { text: rel, highlight: false },
      ...(suffix ? [{ text: suffix, highlight: false as const }] : [])
    ]
  }
  const tokenLengths = tokens.map((t) => t.length)
  const merged = buildSegmentsFromPositions(rel, positions, tokenLengths)
  return [
    ...(prefix ? [{ text: prefix, highlight: false as const }] : []),
    ...merged,
    ...(suffix ? [{ text: suffix, highlight: false as const }] : [])
  ]
}

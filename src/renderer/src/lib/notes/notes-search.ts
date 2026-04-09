import {
  DEFAULT_WORKSPACE_ID,
  extractPlainTextFromSerialized,
  type SavedNote,
  type Folder
} from '@/lib/notes/notes-storage'

import { isDrawingNote } from '@/components/notes/notes-app-utils'

export type SearchMatchSegment = { text: string; highlight: boolean }

export type NoteSearchResult = {
  note: SavedNote
  score: number
  titleSegments: SearchMatchSegment[]
  snippetSegments: SearchMatchSegment[]
  folderName: string
}

export type FolderSearchResult = {
  folder: Folder
  score: number
  nameSegments: SearchMatchSegment[]
}

/** Subsequence match positions in haystack (same length as query when matched). */
function findSubsequenceIndices(haystack: string, query: string): number[] | null {
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

export function buildHighlightSegments(haystack: string, query: string): SearchMatchSegment[] {
  const q = query.trim()
  if (!q || !haystack) return [{ text: haystack, highlight: false }]
  const lowerH = haystack.toLowerCase()
  const lowerQ = q.toLowerCase()
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

function scoreMatch(query: string, haystack: string): number | null {
  const q = query.trim().toLowerCase()
  const h = haystack.toLowerCase()
  if (!q.length) return null
  if (!h.length) return null
  const idx = h.indexOf(q)
  if (idx !== -1) {
    return 100_000 - idx - q.length
  }
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

function firstMatchCharIndex(body: string, query: string): number {
  const q = query.trim().toLowerCase()
  const lowerB = body.toLowerCase()
  const idx = lowerB.indexOf(q)
  if (idx !== -1) return idx
  const sub = findSubsequenceIndices(lowerB, q)
  return sub && sub.length > 0 ? sub[0]! : 0
}

function snippetSlice(body: string, query: string): { core: string; sliceStart: number } {
  const q = query.trim()
  if (!body) return { core: '', sliceStart: 0 }
  const fm = firstMatchCharIndex(body, q)
  const pad = 72
  const sliceStart = Math.max(0, fm - pad)
  const sliceEnd = Math.min(body.length, fm + q.length + pad)
  return { core: body.slice(sliceStart, sliceEnd), sliceStart }
}

function highlightInBodySlice(
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
  const lowerRel = rel.toLowerCase()
  const lowerQ = q.toLowerCase()
  const idx = lowerRel.indexOf(lowerQ)
  if (idx !== -1) {
    const mid: SearchMatchSegment[] = []
    if (idx > 0) mid.push({ text: rel.slice(0, idx), highlight: false })
    mid.push({ text: rel.slice(idx, idx + q.length), highlight: true })
    if (idx + q.length < rel.length) mid.push({ text: rel.slice(idx + q.length), highlight: false })
    return [
      ...(prefix ? [{ text: prefix, highlight: false as const }] : []),
      ...mid,
      ...(suffix ? [{ text: suffix, highlight: false as const }] : [])
    ]
  }
  const sub = findSubsequenceIndices(rel, q)
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

export function searchNotes(
  notes: SavedNote[],
  folders: Folder[],
  query: string,
  options?: { limit?: number }
): NoteSearchResult[] {
  const q = query.trim()
  if (!q) return []

  const folderName = (id: string): string =>
    id === DEFAULT_WORKSPACE_ID ? 'Root' : (folders.find((f) => f.id === id)?.name ?? 'Workspace')

  const limit = options?.limit ?? 50
  const scored: NoteSearchResult[] = []

  for (const note of notes) {
    const title = note.title?.trim() || 'Untitled'
    const body = isDrawingNote(note) ? '' : extractPlainTextFromSerialized(note.content)
    const st = scoreMatch(q, title)
    const sb = body ? scoreMatch(q, body) : null
    if (st === null && sb === null) continue
    const best = Math.max(st ?? 0, sb ?? 0)

    const titleSegments = buildHighlightSegments(title, q)
    let snippetSegments: SearchMatchSegment[]
    if (body && sb !== null) {
      const { core, sliceStart } = snippetSlice(body, q)
      snippetSegments = highlightInBodySlice(body, sliceStart, core, q)
    } else if (body) {
      const preview = body.length > 160 ? `${body.slice(0, 160)}…` : body
      snippetSegments = [{ text: preview, highlight: false }]
    } else {
      snippetSegments = [{ text: isDrawingNote(note) ? 'Drawing' : 'Empty note', highlight: false }]
    }

    scored.push({
      note,
      score: best,
      titleSegments,
      snippetSegments,
      folderName: folderName(note.folderId)
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.note.updatedAt - a.note.updatedAt
  })

  return scored.slice(0, limit)
}

/** Saved chat session row (same shape as `ChatHistoryMeta` in `useNotesChat`). */
export type ChatHistorySessionMeta = {
  sessionId: string
  title: string
  createdAt: number
  messageCount: number
}

export type ChatHistorySearchResult = {
  meta: ChatHistorySessionMeta
  titleSegments: SearchMatchSegment[]
  score: number
}

/**
 * Fuzzy-find chat history sessions by title (same scoring/highlight rules as note title search).
 */
export function searchChatHistorySessions(
  items: ChatHistorySessionMeta[],
  query: string,
  options?: { limit?: number }
): ChatHistorySearchResult[] {
  const q = query.trim()
  const limit = options?.limit ?? 100

  if (!q.length) {
    return items
      .map((meta) => {
        const title = meta.title?.trim() || 'Untitled'
        return {
          meta,
          score: 0,
          titleSegments: buildHighlightSegments(title, '')
        }
      })
      .sort((a, b) => b.meta.createdAt - a.meta.createdAt)
      .slice(0, limit)
  }

  const scored: ChatHistorySearchResult[] = []
  for (const meta of items) {
    const title = meta.title?.trim() || 'Untitled'
    const st = scoreMatch(q, title)
    if (st === null) continue
    scored.push({
      meta,
      score: st,
      titleSegments: buildHighlightSegments(title, q)
    })
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.meta.createdAt - a.meta.createdAt
  })
  return scored.slice(0, limit)
}

export function searchFolders(
  folders: Folder[],
  query: string,
  options?: { limit?: number }
): FolderSearchResult[] {
  const q = query.trim()
  if (!q) return []

  const limit = options?.limit ?? 50
  const scored: FolderSearchResult[] = []

  for (const folder of folders) {
    const name = folder.name?.trim() || 'Untitled folder'
    const st = scoreMatch(q, name)
    if (st === null) continue
    scored.push({
      folder,
      score: st,
      nameSegments: buildHighlightSegments(name, q)
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.folder.name.localeCompare(b.folder.name)
  })

  return scored.slice(0, limit)
}

import { basename } from 'node:path'

import { readNotelabIndexImpl } from './workspace-fs'

type DiskNote = {
  folder: string
  note: string
  title: string
  updatedAtMs: number
  markdownBody?: string
  kind: 'note' | 'drawing' | 'pdf'
}

type LinkMention = {
  source: string
  target: string
  linkText: string
  contextText: string
}

type RawLinkMention = {
  rawTarget: string
  linkText: string
  contextText: string
}

type WorkspaceLinkMentionIndexPayload = {
  backlinksByTarget: Record<string, LinkMention[]>
  outgoingBySource: Record<string, LinkMention[]>
  validPaths: string[]
}

type NoteRef = {
  path: string
  normalizedPath: string
  normalizedBaseName: string
  normalizedTitle: string
}

type CachedMarkdownNote = {
  path: string
  title: string
  rawMentions: RawLinkMention[]
}

type WorkspaceLinkCache = {
  notesByPath: Map<string, CachedMarkdownNote>
  payload: WorkspaceLinkMentionIndexPayload
}

const workspaceLinkCaches = new Map<string, WorkspaceLinkCache>()

function normalizePathCandidate(value: string): string {
  return value
    .trim()
    .replace(/^\.?\//, '')
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/^\/+/, '')
    .toLowerCase()
}

function normalizeTitleCandidate(value: string): string {
  return value.trim().toLowerCase()
}

function buildNoteRefs(notes: DiskNote[]): NoteRef[] {
  return notes.map((note) => {
    const baseName = basename(note.note).replace(/\.md$/i, '')
    return {
      path: note.note,
      normalizedPath: normalizePathCandidate(note.note),
      normalizedBaseName: normalizePathCandidate(baseName),
      normalizedTitle: normalizeTitleCandidate(note.title || baseName)
    }
  })
}

function resolveTargetPath(rawTarget: string, currentPath: string, refs: NoteRef[]): string | null {
  const trimmed = rawTarget.trim()
  if (!trimmed) return null

  const directNotelabMatch = trimmed.match(/#notelab\/note\/([^#?]+)/)
  if (directNotelabMatch?.[1]) return directNotelabMatch[1]

  if (/^(https?:|mailto:|obsidian:)/i.test(trimmed)) return null

  const withoutTitle = trimmed.match(/^<([^>]+)>$/)?.[1] ?? trimmed
  if (withoutTitle.startsWith('#')) return currentPath

  const decoded = (() => {
    try {
      return decodeURIComponent(withoutTitle)
    } catch {
      return withoutTitle
    }
  })()

  const beforeAlias = decoded.split('|', 1)[0] ?? decoded
  const beforeHash = beforeAlias.split('#', 1)[0] ?? beforeAlias
  const normalized = normalizePathCandidate(beforeHash)
  if (!normalized) return currentPath

  const resolved = refs.find((ref) => {
    return (
      normalized === ref.normalizedPath ||
      normalized === ref.normalizedBaseName ||
      normalized === ref.normalizedTitle
    )
  })

  return resolved?.path ?? null
}

function normalizeContextSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > 180 ? `${normalized.slice(0, 180).trimEnd()}…` : normalized
}

function buildContextText(markdown: string, start: number, end: number): string {
  const left = Math.max(0, start - 90)
  const right = Math.min(markdown.length, end + 90)
  return normalizeContextSnippet(markdown.slice(left, right))
}

function collectRawMarkdownMentions(markdown: string): RawLinkMention[] {
  const mentions: RawLinkMention[] = []
  const pushMention = (rawTarget: string, linkText: string, start: number, end: number): void => {
    mentions.push({
      rawTarget,
      linkText: linkText.trim(),
      contextText: buildContextText(markdown, start, end)
    })
  }

  const wikiRegex = /!?\[\[([\s\S]*?)\]\]/g
  for (const match of markdown.matchAll(wikiRegex)) {
    const fullMatch = match[0]
    const inner = match[1] ?? ''
    const [targetPart, aliasPart] = inner.split('|', 2)
    if (!targetPart) continue
    const start = match.index ?? 0
    pushMention(targetPart, aliasPart?.trim() || targetPart.trim(), start, start + fullMatch.length)
  }

  const markdownLinkRegex = /\[([^\]]+)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g
  for (const match of markdown.matchAll(markdownLinkRegex)) {
    const fullMatch = match[0]
    const label = match[1] ?? ''
    const rawDestination = (match[2] ?? '').replace(/\s+"[^"]*"$/, '')
    const start = match.index ?? 0
    pushMention(rawDestination, label, start, start + fullMatch.length)
  }

  return mentions
}

function createCachedMarkdownNote(path: string, markdown: string): CachedMarkdownNote {
  const title = basename(path).replace(/\.md$/i, '')
  return {
    path,
    title,
    rawMentions: collectRawMarkdownMentions(markdown)
  }
}

function buildPayloadFromCachedNotes(
  notesByPath: Map<string, CachedMarkdownNote>
): WorkspaceLinkMentionIndexPayload {
  const refs = buildNoteRefs(
    Array.from(notesByPath.values(), (note) => ({
      folder: '',
      note: note.path,
      title: note.title,
      updatedAtMs: 0,
      markdownBody: '',
      kind: 'note' as const
    }))
  )
  const outgoingBySource = new Map<string, LinkMention[]>()
  const backlinksByTarget = new Map<string, LinkMention[]>()
  const validPaths = Array.from(notesByPath.keys())

  for (const note of notesByPath.values()) {
    for (const rawMention of note.rawMentions) {
      const target = resolveTargetPath(rawMention.rawTarget, note.path, refs)
      if (!target || target === note.path) continue
      const mention: LinkMention = {
        source: note.path,
        target,
        linkText: rawMention.linkText,
        contextText: rawMention.contextText
      }
      const outgoing = outgoingBySource.get(mention.source) ?? []
      outgoing.push(mention)
      outgoingBySource.set(mention.source, outgoing)

      const backlinks = backlinksByTarget.get(mention.target) ?? []
      backlinks.push(mention)
      backlinksByTarget.set(mention.target, backlinks)
    }
  }

  return {
    backlinksByTarget: Object.fromEntries(backlinksByTarget),
    outgoingBySource: Object.fromEntries(outgoingBySource),
    validPaths
  }
}

function rebuildWorkspaceLinkCache(cache: WorkspaceLinkCache): void {
  cache.payload = buildPayloadFromCachedNotes(cache.notesByPath)
}

async function loadWorkspaceLinkCache(cwd: string): Promise<WorkspaceLinkCache> {
  const existing = workspaceLinkCaches.get(cwd)
  if (existing) return existing

  const { notes } = await readNotelabIndexImpl(cwd, { includeBody: true })
  const markdownNotes = notes.filter(
    (note): note is DiskNote => note.kind === 'note' && typeof note.markdownBody === 'string'
  )
  const notesByPath = new Map<string, CachedMarkdownNote>()
  for (const note of markdownNotes) {
    notesByPath.set(note.note, createCachedMarkdownNote(note.note, note.markdownBody ?? ''))
  }
  const cache: WorkspaceLinkCache = {
    notesByPath,
    payload: buildPayloadFromCachedNotes(notesByPath)
  }
  workspaceLinkCaches.set(cwd, cache)
  return cache
}

function renameCachedPath(path: string, from: string, to: string): string {
  if (path === from) return to
  const prefix = `${from}/`
  if (!path.startsWith(prefix)) return path
  return `${to}/${path.slice(prefix.length)}`
}

function isMarkdownNotePath(path: string): boolean {
  return /\.md$/i.test(path)
}

export function updateWorkspaceLinkCacheForWrite(
  cwd: string,
  relativePath: string,
  content: string
): void {
  const cache = workspaceLinkCaches.get(cwd)
  if (!cache) return
  if (!isMarkdownNotePath(relativePath)) return
  cache.notesByPath.set(relativePath, createCachedMarkdownNote(relativePath, content))
  rebuildWorkspaceLinkCache(cache)
}

export function updateWorkspaceLinkCacheForDelete(cwd: string, relativePath: string): void {
  const cache = workspaceLinkCaches.get(cwd)
  if (!cache) return
  if (!cache.notesByPath.delete(relativePath)) return
  rebuildWorkspaceLinkCache(cache)
}

export function updateWorkspaceLinkCacheForDeletePrefix(cwd: string, relativePrefix: string): void {
  const cache = workspaceLinkCaches.get(cwd)
  if (!cache) return
  let changed = false
  const prefix = `${relativePrefix}/`
  for (const notePath of Array.from(cache.notesByPath.keys())) {
    if (notePath === relativePrefix || notePath.startsWith(prefix)) {
      cache.notesByPath.delete(notePath)
      changed = true
    }
  }
  if (changed) rebuildWorkspaceLinkCache(cache)
}

export function updateWorkspaceLinkCacheForRename(
  cwd: string,
  fromRelativePath: string,
  toRelativePath: string
): void {
  const cache = workspaceLinkCaches.get(cwd)
  if (!cache) return

  const nextNotesByPath = new Map<string, CachedMarkdownNote>()
  let changed = false
  for (const note of cache.notesByPath.values()) {
    const nextPath = renameCachedPath(note.path, fromRelativePath, toRelativePath)
    changed ||= nextPath !== note.path
    nextNotesByPath.set(nextPath, {
      ...note,
      path: nextPath,
      title: basename(nextPath).replace(/\.md$/i, '')
    })
  }

  if (!changed) return
  cache.notesByPath = nextNotesByPath
  rebuildWorkspaceLinkCache(cache)
}

export async function readWorkspaceLinkIndexImpl(
  cwd: string
): Promise<WorkspaceLinkMentionIndexPayload> {
  return (await loadWorkspaceLinkCache(cwd)).payload
}

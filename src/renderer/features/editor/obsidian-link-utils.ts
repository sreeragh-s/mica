import type { NotelabEditorContextValue } from '@/features/editor/notelab-editor-context'
import type { SavedNote } from '@/lib/notes/notes-storage'

export type ObsidianLinkParts = {
  isEmbed: boolean
  target: string
  noteQuery: string
  subpath: string
  alias: string
}

const WIKI_LINK_WRAPPER_REGEX = /^(!)?\[\[([\s\S]*)\]\]$/

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripAngleWrappedDestination(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '')
}

function splitObsidianAlias(value: string): [string, string] {
  const separatorIndex = value.indexOf('|')
  if (separatorIndex === -1) return [value, '']
  return [value.slice(0, separatorIndex), value.slice(separatorIndex + 1)]
}

function splitObsidianSubpath(value: string): [string, string] {
  const hashIndex = value.indexOf('#')
  if (hashIndex === -1) return [value, '']
  return [value.slice(0, hashIndex), value.slice(hashIndex)]
}

export function parseObsidianLinkText(value: string): ObsidianLinkParts {
  const trimmed = value.trim()
  const wrapped = WIKI_LINK_WRAPPER_REGEX.exec(trimmed)
  const isEmbed = Boolean(wrapped?.[1]) || trimmed.startsWith('![[')
  const rawInner = wrapped?.[2] ?? trimmed.replace(/^!\[\[/, '').replace(/^\[\[/, '')
  const [rawTarget, rawAlias] = splitObsidianAlias(rawInner)
  const target = stripAngleWrappedDestination(safeDecodeURIComponent(rawTarget.trim()))
  const [rawNoteQuery, subpath] = splitObsidianSubpath(target)
  const noteQuery = stripMarkdownExtension(rawNoteQuery.trim())

  return {
    isEmbed,
    target,
    noteQuery,
    subpath: subpath.trim(),
    alias: rawAlias.trim()
  }
}

export function normalizeObsidianNoteSearch(query: string): string {
  const parsed = parseObsidianLinkText(query)
  const candidate = parsed.noteQuery || parsed.target || query
  return stripMarkdownExtension(candidate)
    .replace(/^#+\^?/, '')
    .replace(/^\^+/, '')
    .trim()
    .toLowerCase()
}

function normalizeObsidianPathCandidate(value: string): string {
  return stripMarkdownExtension(
    stripAngleWrappedDestination(safeDecodeURIComponent(value))
      .replace(/^\.?\//, '')
      .trim()
  ).toLowerCase()
}

export function resolveObsidianInternalLinkTarget(
  ctx: NotelabEditorContextValue,
  rawTarget: string
): { notePath: string; subpath: string } | null {
  if (/^#notelab\/note\//.test(rawTarget)) return null

  const parsed = parseObsidianLinkText(rawTarget)
  let target = parsed.target
  let noteQuery = parsed.noteQuery
  let subpath = parsed.subpath

  if (/^obsidian:\/\//i.test(target)) {
    try {
      const url = new URL(target)
      target = url.searchParams.get('file') ?? ''
      const next = parseObsidianLinkText(target)
      noteQuery = next.noteQuery
      subpath = next.subpath
    } catch {
      return null
    }
  }

  if (!noteQuery && subpath) {
    return ctx.currentNoteId ? { notePath: ctx.currentNoteId, subpath } : null
  }

  const normalizedQuery = normalizeObsidianPathCandidate(noteQuery)
  if (!normalizedQuery) return null

  const resolved = ctx.notes.find((note) => {
    const title = (note.title?.trim() || 'Untitled').toLowerCase()
    const path = normalizeObsidianPathCandidate(note.path)
    const basename = normalizeObsidianPathCandidate(note.path.split('/').pop() ?? note.path)
    return normalizedQuery === path || normalizedQuery === basename || normalizedQuery === title
  })

  return resolved ? { notePath: resolved.path, subpath } : null
}

export function getObsidianLinkDisplayText(
  noteTitle: string,
  parts: Pick<ObsidianLinkParts, 'alias' | 'subpath'>
): string {
  if (parts.alias) return parts.alias
  if (parts.subpath) return `${noteTitle}${parts.subpath}`
  return noteTitle
}

export function stripObsidianMarkdownExtension(value: string): string {
  return stripMarkdownExtension(value)
}

export function filterLinkableNotes(
  ctx: NotelabEditorContextValue,
  query: string,
  excludeNoteId?: string
): SavedNote[] {
  const q = normalizeObsidianNoteSearch(query)
  return ctx.notes
    .filter((n) => n.path !== excludeNoteId)
    .filter((n) => {
      if (!q) return true
      const title = (n.title?.trim() || 'Untitled').toLowerCase()
      const path = n.path.toLowerCase()
      const basename = stripMarkdownExtension(path.split('/').pop() ?? path).toLowerCase()
      return title.includes(q) || path.includes(q) || basename.includes(q)
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

import type { SerializedEditorState } from 'lexical'

import type { SavedNote } from '@/lib/notes/notes-storage'
import { parseInternalNotePathFromHref } from '@/lib/notes/internal-note-link'

/** Walk Lexical JSON and collect target note paths from internal note links. */
export function collectInternalNoteLinkTargets(
  serialized: SerializedEditorState | null | undefined
): string[] {
  const out = new Set<string>()

  function walk(node: unknown): void {
    if (node === null || node === undefined) return
    if (typeof node !== 'object') return
    const o = node as Record<string, unknown>
    if (o.type === 'link' && typeof o.url === 'string') {
      const id = parseInternalNotePathFromHref(o.url)
      if (id) out.add(id)
    }
    if (Array.isArray(o.children)) {
      for (const c of o.children) walk(c)
    }
  }

  walk(serialized?.root)
  return [...out]
}

export type InternalNoteLinkMention = {
  target: string
  linkText: string
  contextText: string
}

function extractNodeText(node: unknown): string {
  if (node === null || node === undefined) return ''
  if (typeof node !== 'object') return ''
  const o = node as Record<string, unknown>
  if (o.type === 'text' && typeof o.text === 'string') return o.text
  if (Array.isArray(o.children)) {
    return o.children.map(extractNodeText).join('')
  }
  return ''
}

function normalizeSnippet(text: string, maxLen = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen).trimEnd()}…` : normalized
}

/** Collect every internal note link with the surrounding block text for previews/highlights. */
export function collectInternalNoteLinkMentions(
  serialized: SerializedEditorState | null | undefined
): InternalNoteLinkMention[] {
  const mentions: InternalNoteLinkMention[] = []

  function walk(node: unknown): void {
    if (node === null || node === undefined) return
    if (typeof node !== 'object') return

    const o = node as Record<string, unknown>
    const children = Array.isArray(o.children) ? o.children : null

    if (children) {
      const contextText = normalizeSnippet(children.map(extractNodeText).join(''))
      for (const child of children) {
        if (child && typeof child === 'object') {
          const childObj = child as Record<string, unknown>
          if (childObj.type === 'link' && typeof childObj.url === 'string') {
            const target = parseInternalNotePathFromHref(childObj.url)
            if (target) {
              mentions.push({
                target,
                linkText: normalizeSnippet(extractNodeText(childObj), 80),
                contextText
              })
            }
          }
        }
        walk(child)
      }
    }
  }

  walk(serialized?.root)
  return mentions
}

export type NoteGraphNode = {
  id: string
  title: string
  kind: NonNullable<SavedNote['kind']>
  folder: string
}

export type NoteGraphLink = {
  source: string
  target: string
}

/** Nodes = all notes; edges = directed link from note A to B when A links to B. */
export function buildNoteLinkGraph(notes: SavedNote[]): {
  nodes: NoteGraphNode[]
  links: NoteGraphLink[]
} {
  const idSet = new Set(notes.map((n) => n.path))
  const linkKeys = new Set<string>()
  const links: NoteGraphLink[] = []

  for (const note of notes) {
    if (note.kind === 'drawing') continue
    const targets = collectInternalNoteLinkTargets(note.content)
    for (const t of targets) {
      if (!idSet.has(t)) continue
      if (t === note.path) continue
      const key = `${note.path}\0${t}`
      if (linkKeys.has(key)) continue
      linkKeys.add(key)
      links.push({ source: note.path, target: t })
    }
  }

  const nodes: NoteGraphNode[] = notes.map((n) => ({
    id: n.path,
    title: (n.title?.trim() || 'Untitled').slice(0, 80),
    kind: n.kind ?? 'note',
    folder: n.folder
  }))

  return { nodes, links }
}

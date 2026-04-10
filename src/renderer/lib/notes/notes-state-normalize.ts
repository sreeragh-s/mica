import type { SerializedEditorState } from 'lexical'

import {
  DEFAULT_WORKSPACE_ID,
  type NoteKind,
  type NotesState,
  type NotesStateV2,
  type NotesStateV3,
  type SavedNote,
  type Folder
} from './notes-types'

const BASE64_MARKER = ';base64,'

/**
 * Remove `data:…;base64,…` segments (linear scan; safe for very long payloads vs catastrophic regex).
 */
export function stripDataUrlBase64Payloads(text: string): string {
  const parts: string[] = []
  let cursor = 0
  while (cursor < text.length) {
    const j = text.indexOf(BASE64_MARKER, cursor)
    if (j === -1) {
      parts.push(text.slice(cursor))
      break
    }
    const dataStart = text.lastIndexOf('data:', j)
    if (dataStart === -1 || dataStart < cursor) {
      parts.push(text.slice(cursor, j))
      cursor = j + 1
      continue
    }
    parts.push(text.slice(cursor, dataStart))
    let k = j + BASE64_MARKER.length
    while (k < text.length && /[A-Za-z0-9+/=\r\n]/.test(text[k]!)) k++
    parts.push(' ')
    cursor = k
  }
  return parts.join('')
}

function walkNestedEditorCaption(caption: unknown): string {
  if (caption === null || caption === undefined || typeof caption !== 'object') return ''
  const c = caption as Record<string, unknown>
  const es = c.editorState
  if (es !== null && es !== undefined && typeof es === 'object') {
    const root = (es as Record<string, unknown>).root
    return walkSerializedPlainText(root)
  }
  const root = c.root
  if (root !== null && root !== undefined) {
    return walkSerializedPlainText(root)
  }
  return ''
}

/** Plain text for search/preview: no image `src` / data URLs; image alt + captions included. */
function walkSerializedPlainText(node: unknown): string {
  if (node === null || node === undefined) return ''
  if (typeof node !== 'object') return ''
  const o = node as Record<string, unknown>

  if (o.type === 'image') {
    const alt = typeof o.altText === 'string' ? o.altText.trim() : ''
    const cap = walkNestedEditorCaption(o.caption)
    return [alt, cap].filter(Boolean).join(' ')
  }

  if (o.type === 'text' && typeof o.text === 'string') {
    return stripDataUrlBase64Payloads(o.text)
  }

  if (Array.isArray(o.children)) {
    return o.children.map(walkSerializedPlainText).join('')
  }
  return ''
}

/** Full plain text from Lexical JSON (for search). Empty string if no text nodes. */
export function extractPlainTextFromSerialized(
  serialized: SerializedEditorState | null,
  maxLen?: number
): string {
  if (!serialized) return ''
  const text = stripDataUrlBase64Payloads(
    walkSerializedPlainText(serialized.root).replace(/\s+/g, ' ').trim()
  )
  if (!text) return ''
  if (maxLen !== undefined && text.length > maxLen) {
    return text.slice(0, maxLen)
  }
  return text
}

export function extractPreviewText(serialized: SerializedEditorState, maxLen = 72): string {
  const text = stripDataUrlBase64Payloads(
    walkSerializedPlainText(serialized.root).replace(/\s+/g, ' ').trim()
  )
  if (!text) return 'Untitled'
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}

function isSavedNote(n: unknown): n is Omit<SavedNote, 'title'> & { title?: string } {
  return (
    typeof n === 'object' &&
    n !== null &&
    typeof (n as SavedNote).path === 'string' &&
    typeof (n as SavedNote).updatedAt === 'number' &&
    typeof (n as SavedNote).folder === 'string'
  )
}

function deriveNoteTitle(n: {
  content: SerializedEditorState | null
  title?: string
  kind?: NoteKind
}): string {
  // Explicit empty string means the user cleared the title — preserve it.
  if (typeof n.title === 'string') return n.title.trim()
  // title is undefined (old data) — derive from content.
  if (n.kind === 'drawing') return 'New drawing'
  if (n.content != null) return extractPreviewText(n.content, 200)
  return ''
}

function withDerivedTitle(n: Omit<SavedNote, 'title'> & { title?: string }): SavedNote {
  return { ...n, title: deriveNoteTitle(n) }
}

function migrateV1ToV2(parsed: unknown[]): NotesState {
  return {
    version: 2,
    folders: [{ folder: DEFAULT_WORKSPACE_ID, name: 'Notes' }],
    notes: parsed
      .filter(
        (n): n is Omit<SavedNote, 'folder'> & { folder?: string } =>
          typeof n === 'object' &&
          n !== null &&
          typeof (n as SavedNote).path === 'string' &&
          typeof (n as SavedNote).updatedAt === 'number'
      )
      .map((n) =>
        withDerivedTitle({
          path: n.path,
          updatedAt: n.updatedAt,
          content: n.content ?? null,
          folder: n.folder ?? DEFAULT_WORKSPACE_ID,
          title: (n as { title?: string }).title
        })
      )
  }
}

/** Normalize notes state from localStorage JSON, config file, or API. */
export function normalizeNotesStateFromStorage(raw: unknown): NotesState {
  if (raw === undefined || raw === null) {
    return {
      version: 2,
      folders: [{ folder: DEFAULT_WORKSPACE_ID, name: 'Notes' }],
      notes: []
    }
  }
  try {
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
    if (Array.isArray(parsed)) {
      return migrateV1ToV2(parsed)
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { version?: number }).version === 3
    ) {
      const p = parsed as NotesStateV3
      const r = p.githubRemoteUrl
      return {
        version: 3,
        ...(typeof r === 'string' && r.trim() ? { githubRemoteUrl: r.trim() } : {})
      }
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as NotesStateV2).version === 2 &&
      Array.isArray((parsed as NotesStateV2).folders) &&
      Array.isArray((parsed as NotesStateV2).notes)
    ) {
      const folders = (parsed as NotesStateV2).folders.filter(
        (f): f is Folder =>
          typeof f === 'object' &&
          f !== null &&
          typeof f.folder === 'string' &&
          typeof f.name === 'string'
      )
      const notes = (parsed as NotesStateV2).notes.filter(isSavedNote).map(withDerivedTitle)
      const rawAppRemote = (parsed as NotesStateV2).githubRemoteUrl
      let githubRemoteUrl =
        typeof rawAppRemote === 'string' && rawAppRemote.trim() ? rawAppRemote.trim() : undefined
      if (!githubRemoteUrl) {
        githubRemoteUrl = folders.find((f) => f.githubRemoteUrl)?.githubRemoteUrl
      }
      if (folders.length === 0) {
        return {
          version: 2,
          folders: [{ folder: DEFAULT_WORKSPACE_ID, name: 'Notes' }],
          notes: notes.map((n) => ({
            ...n,
            folder: DEFAULT_WORKSPACE_ID
          })),
          ...(githubRemoteUrl ? { githubRemoteUrl } : {})
        }
      }
      return {
        version: 2,
        folders,
        notes,
        ...(githubRemoteUrl ? { githubRemoteUrl } : {})
      }
    }
    return {
      version: 2,
      folders: [{ folder: DEFAULT_WORKSPACE_ID, name: 'Notes' }],
      notes: []
    }
  } catch {
    return {
      version: 2,
      folders: [{ folder: DEFAULT_WORKSPACE_ID, name: 'Notes' }],
      notes: []
    }
  }
}

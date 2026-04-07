import type { SerializedEditorState } from "lexical"

import {
  DEFAULT_WORKSPACE_ID,
  type NoteKind,
  type NotesState,
  type NotesStateV2,
  type NotesStateV3,
  type SavedNote,
  type WorkspaceFolder,
} from "./notes-types"

function walkSerializedText(node: unknown): string {
  if (node === null || node === undefined) return ""
  if (typeof node !== "object") return ""
  const o = node as Record<string, unknown>
  if (o.type === "text" && typeof o.text === "string") return o.text
  if (Array.isArray(o.children)) {
    return o.children.map(walkSerializedText).join("")
  }
  return ""
}

/** Full plain text from Lexical JSON (for search). Empty string if no text nodes. */
export function extractPlainTextFromSerialized(
  serialized: SerializedEditorState | null,
  maxLen?: number
): string {
  if (!serialized) return ""
  const text = walkSerializedText(serialized.root).replace(/\s+/g, " ").trim()
  if (!text) return ""
  if (maxLen !== undefined && text.length > maxLen) {
    return text.slice(0, maxLen)
  }
  return text
}

export function extractPreviewText(
  serialized: SerializedEditorState,
  maxLen = 72
): string {
  const text = walkSerializedText(serialized.root).replace(/\s+/g, " ").trim()
  if (!text) return "Untitled"
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}

function isSavedNote(n: unknown): n is Omit<SavedNote, "title"> & { title?: string } {
  return (
    typeof n === "object" &&
    n !== null &&
    typeof (n as SavedNote).id === "string" &&
    typeof (n as SavedNote).updatedAt === "number" &&
    typeof (n as SavedNote).folderId === "string"
  )
}

function deriveNoteTitle(n: {
  content: SerializedEditorState | null
  title?: string
  kind?: NoteKind
}): string {
  // Explicit empty string means the user cleared the title — preserve it.
  if (typeof n.title === "string") return n.title.trim()
  // title is undefined (old data) — derive from content.
  if (n.kind === "drawing") return "New drawing"
  if (n.content != null) return extractPreviewText(n.content, 200)
  return ""
}

function withDerivedTitle(
  n: Omit<SavedNote, "title"> & { title?: string }
): SavedNote {
  return { ...n, title: deriveNoteTitle(n) }
}

function migrateV1ToV2(parsed: unknown[]): NotesState {
  return {
    version: 2,
    folders: [{ id: DEFAULT_WORKSPACE_ID, name: "Notes" }],
    notes: parsed
      .filter(
        (n): n is Omit<SavedNote, "folderId"> & { folderId?: string } =>
          typeof n === "object" &&
          n !== null &&
          typeof (n as SavedNote).id === "string" &&
          typeof (n as SavedNote).updatedAt === "number"
      )
      .map((n) =>
        withDerivedTitle({
          id: n.id,
          updatedAt: n.updatedAt,
          content: n.content ?? null,
          folderId: n.folderId ?? DEFAULT_WORKSPACE_ID,
          title: (n as { title?: string }).title,
        })
      ),
  }
}

/** Normalize notes state from localStorage JSON, config file, or API. */
export function normalizeNotesStateFromStorage(raw: unknown): NotesState {
  if (raw === undefined || raw === null) {
    return {
      version: 2,
      folders: [{ id: DEFAULT_WORKSPACE_ID, name: "Notes" }],
      notes: [],
    }
  }
  try {
    const parsed =
      typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw
    if (Array.isArray(parsed)) {
      return migrateV1ToV2(parsed)
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { version?: number }).version === 3
    ) {
      const p = parsed as NotesStateV3
      const r = p.githubRemoteUrl
      return {
        version: 3,
        ...(typeof r === "string" && r.trim() ? { githubRemoteUrl: r.trim() } : {}),
      }
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as NotesStateV2).version === 2 &&
      Array.isArray((parsed as NotesStateV2).folders) &&
      Array.isArray((parsed as NotesStateV2).notes)
    ) {
      const folders = (parsed as NotesStateV2).folders.filter(
        (f): f is WorkspaceFolder =>
          typeof f === "object" &&
          f !== null &&
          typeof f.id === "string" &&
          typeof f.name === "string"
      )
      const notes = (parsed as NotesStateV2).notes.filter(isSavedNote).map(withDerivedTitle)
      const rawAppRemote = (parsed as NotesStateV2).githubRemoteUrl
      let githubRemoteUrl =
        typeof rawAppRemote === "string" && rawAppRemote.trim()
          ? rawAppRemote.trim()
          : undefined
      if (!githubRemoteUrl) {
        githubRemoteUrl = folders.find((f) => f.githubRemoteUrl)?.githubRemoteUrl
      }
      if (folders.length === 0) {
        return {
          version: 2,
          folders: [{ id: DEFAULT_WORKSPACE_ID, name: "Notes" }],
          notes: notes.map((n) => ({
            ...n,
            folderId: DEFAULT_WORKSPACE_ID,
          })),
          ...(githubRemoteUrl ? { githubRemoteUrl } : {}),
        }
      }
      return {
        version: 2,
        folders,
        notes,
        ...(githubRemoteUrl ? { githubRemoteUrl } : {}),
      }
    }
    return {
      version: 2,
      folders: [{ id: DEFAULT_WORKSPACE_ID, name: "Notes" }],
      notes: [],
    }
  } catch {
    return {
      version: 2,
      folders: [{ id: DEFAULT_WORKSPACE_ID, name: "Notes" }],
      notes: [],
    }
  }
}

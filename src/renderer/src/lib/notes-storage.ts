import type { SerializedEditorState } from "lexical"

const STORAGE_KEY = "gitnotes-notes"

/** Stable id for migrated notes without a workspace. */
export const DEFAULT_WORKSPACE_ID = "default"

export type WorkspaceFolder = {
  id: string
  name: string
  /** Git remote URL (HTTPS or SSH) for this workspace, if configured. */
  githubRemoteUrl?: string
  /** Folder where the user ran in-app `git init` for this workspace. */
  localGitPath?: string
}

export type SavedNote = {
  id: string
  updatedAt: number
  /** Lexical document; null until the user types (new note). */
  content: SerializedEditorState | null
  /** Workspace folder containing this note. */
  folderId: string
  /** Sidebar label and base name for the synced Markdown file. */
  title: string
}

export type NotesStateV2 = {
  version: 2
  folders: WorkspaceFolder[]
  notes: SavedNote[]
  /** Shared Git remote URL for ~/.gitnotes (optional). */
  githubRemoteUrl?: string
}

/** Electron: note bodies live on disk under ~/.gitnotes; only remote URL is cached here. */
export type NotesStateV3 = {
  version: 3
  githubRemoteUrl?: string
}

export type NotesState = NotesStateV2 | NotesStateV3

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
}): string {
  if (typeof n.title === "string" && n.title.trim()) return n.title.trim()
  if (n.content != null) return extractPreviewText(n.content, 200)
  return "New note"
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

export function loadNotesState(): NotesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        version: 2,
        folders: [{ id: DEFAULT_WORKSPACE_ID, name: "Notes" }],
        notes: [],
      }
    }
    const parsed = JSON.parse(raw) as unknown
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

export function saveNotesState(state: NotesState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.error("Failed to persist notes", e)
  }
}

/** @deprecated Use loadNotesState; kept for narrow imports. */
export function loadNotes(): SavedNote[] {
  const s = loadNotesState()
  if (s.version === 3) return []
  return s.notes
}

/** @deprecated Use saveNotesState. */
export function saveNotes(notes: SavedNote[]): void {
  const state = loadNotesState()
  if (state.version === 3) return
  saveNotesState({ ...state, notes })
}

export function extractPreviewText(
  serialized: SerializedEditorState,
  maxLen = 72
): string {
  function walk(node: unknown): string {
    if (node === null || node === undefined) return ""
    if (typeof node !== "object") return ""
    const o = node as Record<string, unknown>
    if (o.type === "text" && typeof o.text === "string") return o.text
    if (Array.isArray(o.children)) {
      return o.children.map(walk).join("")
    }
    return ""
  }
  const text = walk(serialized.root).replace(/\s+/g, " ").trim()
  if (!text) return "New note"
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}

export function formatNoteTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts))
}

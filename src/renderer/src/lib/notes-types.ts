import type { SerializedEditorState } from "lexical"

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

export type NoteKind = "note" | "drawing"

export type SavedNote = {
  id: string
  updatedAt: number
  /** Lexical document; null until the user types (new note). Unused when kind is drawing. */
  content: SerializedEditorState | null
  /** Workspace folder containing this note. */
  folderId: string
  /** Sidebar label and base name for the synced Markdown file. */
  title: string
  /** Optional full-width cover image above the title (URL or data URL). */
  coverImageSrc?: string | null
  /** Optional emoji shown to the left of the title and in sidebar/search lists. */
  titleEmoji?: string | null
  /** Defaults to note. Drawings use Excalidraw scene JSON in excalidrawScene. */
  kind?: NoteKind
  /** Serialized Excalidraw document (serializeAsJSON) when kind is drawing. */
  excalidrawScene?: string | null
}

export type NotesStateV2 = {
  version: 2
  folders: WorkspaceFolder[]
  notes: SavedNote[]
  /** Shared Git remote URL for ~/.notelab (optional). */
  githubRemoteUrl?: string
}

/** Electron: note bodies live on disk under ~/.notelab; only remote URL is cached here. */
export type NotesStateV3 = {
  version: 3
  githubRemoteUrl?: string
  /** Preferred sidebar order of workspace folder ids (persists across reloads). */
  sidebarFolderOrder?: string[]
}

export type NotesState = NotesStateV2 | NotesStateV3

import type { SerializedEditorState } from "lexical"

import type { NotePropertyMap, NotePropertyValue } from "../../../../shared/note-markdown"

/** Stable folder name for migrated notes without a workspace. */
export const DEFAULT_WORKSPACE_ID = "default"

export type { NotePropertyMap, NotePropertyValue }

export type Folder = {
  folder: string
  name: string
  /** Git remote URL (HTTPS or SSH) for this workspace, if configured. */
  githubRemoteUrl?: string
  /** Folder where the user ran in-app `git init` for this workspace. */
  localGitPath?: string
}

export type NoteKind = "note" | "drawing"

export type SavedNote = {
  path: string
  updatedAt: number
  /** Lexical document; null until the user types (new note). Unused when kind is drawing. */
  content: SerializedEditorState | null
  /** Workspace folder containing this note. */
  folder: string
  /** Sidebar label and base name for the synced Markdown file. */
  title: string
  /** Optional full-width cover image above the title (URL or data URL). */
  coverImageSrc?: string | null
  /** Optional emoji shown to the left of the title and in sidebar/search lists. */
  titleEmoji?: string | null
  /** Raw frontmatter properties preserved from disk. */
  properties?: NotePropertyMap
  /** True when the markdown file contains a frontmatter block, even if empty. */
  hasFrontmatterBlock?: boolean
  /** Defaults to note. Drawings use Excalidraw scene JSON in excalidrawScene. */
  kind?: NoteKind
  /** Serialized Excalidraw document (serializeAsJSON) when kind is drawing. */
  excalidrawScene?: string | null
}

export type NotesStateV2 = {
  version: 2
  folders: Folder[]
  notes: SavedNote[]
  /** Shared Git remote URL for ~/.notelab (optional). */
  githubRemoteUrl?: string
}

/** Electron: note bodies live on disk under ~/.notelab; only remote URL is cached here. */
export type NotesStateV3 = {
  version: 3
  githubRemoteUrl?: string
}

export type NotesState = NotesStateV2 | NotesStateV3

/** Left activity rail + sidebar content: notes tree, Git, or settings navigation. */
export type AppSidebarView = "explorer" | "source-control" | "settings"

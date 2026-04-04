export type GitNotesSyncMode = "git" | "github_api" | "local"

export type GitNotesSetupState = {
  /** User finished first-run setup (or chose skip). */
  complete: boolean
  syncMode?: GitNotesSyncMode
  /** `owner/repo` when using GitHub API sync */
  githubRepoFullName?: string
  /** Last known default branch tip on remote (API sync) */
  lastRemoteCommitSha?: string
}

/** Persisted at ~/.gitnotes/gitnotes.config (Electron). */
export type GitnotesConfigFileV1 = {
  version: 1
  setup?: GitNotesSetupState
  shortcuts?: Record<string, { mod: boolean; key?: string; code?: string }>
  /** @see appearance-storage UiFontId */
  uiFont?: string
  /** Serialized notes index / remote cache (see notes-types NotesState). */
  notes?: unknown
  githubContentShas?: Record<string, string>
}

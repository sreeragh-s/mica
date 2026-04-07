import type { ThemeStyleProps } from "../components/appearance/theme-presets"

export type NotelabSyncMode = "git" | "github_api" | "local"

export type NotelabSetupState = {
  /** User finished first-run setup (or chose skip). */
  complete: boolean
  syncMode?: NotelabSyncMode
  /** `owner/repo` when using GitHub API sync */
  githubRepoFullName?: string
  /** Last known default branch tip on remote (API sync) */
  lastRemoteCommitSha?: string
  /** Absolute path to the workspace root directory chosen by the user. Defaults to ~/.notelab. */
  workspaceRoot?: string
}

/** Persisted at ~/.notelab/notelab.config (Electron). */
export type NotelabConfigFileV1 = {
  version: 1
  setup?: NotelabSetupState
  shortcuts?: Record<string, { mod: boolean; key?: string; code?: string }>
  /** @see appearance-storage UiFontId */
  uiFont?: string
  /** Built-in color theme preset id, `"default"`, or `"custom"` when `themeConfig` is used. */
  themePresetId?: string
  /** Full editable light/dark design tokens; used when `themePresetId` is `"custom"`. */
  themeConfig?: NotelabThemeConfigV1
  /** Serialized notes index / remote cache (see notes-types NotesState). */
  notes?: unknown
  githubContentShas?: Record<string, string>
}

export type NotelabThemeConfigV1 = {
  light: Partial<ThemeStyleProps>
  dark: Partial<ThemeStyleProps>
}

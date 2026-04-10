import { ThemeStyleProps } from "@/components/appearance/theme-presets"

export type NotelabSyncMode = "git" | "github_api" | "local"

export type NotelabSetupState = {
  /** User finished first-run setup (or chose skip). */
  complete: boolean
  syncMode?: NotelabSyncMode
  /** `owner/repo` when using GitHub API sync */
  githubRepoFullName?: string
  /** Last known default branch tip on remote (API sync) */
  lastRemoteCommitSha?: string
  /** Absolute path to the workspace root directory chosen by the user. Defaults to ~/Documents/notelab. */
  workspaceRoot?: string
}

export type SavedWorkspace = {
  /** Absolute path to the workspace root directory. */
  path: string
  /** Display name (defaults to the last path segment). */
  name: string
  /** Git remote URL for this workspace, if configured. */
  remoteUrl?: string
}

export type NotelabEditorSettingsV1 = {
  enableEmojiProperty?: boolean
  enableCoverProperty?: boolean
  newNotesStartWithFrontmatter?: boolean
}

export type NotelabAppearanceSettingsV1 = {
  animationsEnabled?: boolean
}

/** Persisted at <workspaceRoot>/.notelab.config (Notelab). */
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
  editorSettings?: NotelabEditorSettingsV1
  appearanceSettings?: NotelabAppearanceSettingsV1
  /** All known workspaces (path, name, optional remoteUrl). */
  workspaces?: SavedWorkspace[]
}

export type NotelabThemeConfigV1 = {
  light: Partial<ThemeStyleProps>
  dark: Partial<ThemeStyleProps>
}

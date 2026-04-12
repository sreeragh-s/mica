import { ThemeStyleProps } from '@/features/appearance/theme-presets'

export type NotelabSyncMode = 'git' | 'local'

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
}

export type NotelabEditorSettingsV1 = {
  enableEmojiProperty?: boolean
  enableCoverProperty?: boolean
  newNotesStartWithFrontmatter?: boolean
  confirmNoteDeletion?: boolean
}

export type NotelabAppearanceSettingsV1 = {
  animationsEnabled?: boolean
}

/**
 * UI snapshot stored under `workspaceView` in `<notesWorkspace>/notelab.json`
 * (not the global ~/.notelab config file).
 */
export type NotelabWorkspaceViewSnapshotV1 = {
  selectedNotePath: string | null
  openNoteTabPaths: string[]
  chatSidebarOpen: boolean
  chatSidebarPanel: 'chat' | 'links'
  chatSidebarLinkMode: 'linked' | 'linking'
  sidebarCollapsed: boolean
  zenMode: boolean
  graphViewOpen: boolean
  canvasViewOpen: boolean
  journalViewOpen: boolean
  tabOverviewOpen: boolean
  appSidebarView: 'explorer' | 'source-control' | 'settings'
  appMode: 'notes' | 'settings'
  settingsSection:
    | 'account'
    | 'workspace'
    | 'github'
    | 'appearance'
    | 'editor'
    | 'shortcuts'
    | 'debug'
    | 'indexing'
  focusedFolderId: string | null
  newNoteDestinationFolderId: string
  workspaceSettingsFolderId: string | null
}

/** Global app config: ~/.notelab/notelab.json (configRoot) - workspace list only */
export type NotelabConfigFileV1 = {
  version: 1
  /** All known workspaces (path, name). */
  workspaces?: SavedWorkspace[]
}

/** Per-workspace settings: <workspace>/notelab.json */
export type NotelabWorkspaceConfigV1 = {
  version: 1
  setup?: NotelabSetupState
  shortcuts?: Record<string, { mod: boolean; key?: string; code?: string }>
  uiFont?: string
  themePresetId?: string
  themeConfig?: NotelabThemeConfigV1
  notes?: unknown
  githubContentShas?: Record<string, string>
  editorSettings?: NotelabEditorSettingsV1
  appearanceSettings?: NotelabAppearanceSettingsV1
}

export type NotelabThemeConfigV1 = {
  light: Partial<ThemeStyleProps>
  dark: Partial<ThemeStyleProps>
}

const SETUP_KEY = 'gitnotes-setup'

export type GitNotesSyncMode = 'git' | 'github_api' | 'local'

export type GitNotesSetupState = {
  /** User finished first-run setup (or chose skip). */
  complete: boolean
  syncMode?: GitNotesSyncMode
  /** `owner/repo` when using GitHub API sync */
  githubRepoFullName?: string
  /** Last known default branch tip on remote (API sync) */
  lastRemoteCommitSha?: string
}

const defaultState: GitNotesSetupState = {
  complete: false,
}

export function loadSetupState(): GitNotesSetupState {
  try {
    const raw = localStorage.getItem(SETUP_KEY)
    if (!raw) {
      /** No persisted setup — show setup until the user finishes or taps Get started. */
      return { ...defaultState }
    }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return { ...defaultState }
    const o = parsed as Record<string, unknown>
    return {
      complete: o.complete === true,
      ...(typeof o.syncMode === 'string' &&
      (o.syncMode === 'git' || o.syncMode === 'github_api' || o.syncMode === 'local')
        ? { syncMode: o.syncMode }
        : {}),
      ...(typeof o.githubRepoFullName === 'string' && o.githubRepoFullName.trim()
        ? { githubRepoFullName: o.githubRepoFullName.trim() }
        : {}),
      ...(typeof o.lastRemoteCommitSha === 'string' && o.lastRemoteCommitSha.trim()
        ? { lastRemoteCommitSha: o.lastRemoteCommitSha.trim() }
        : {}),
    }
  } catch {
    return { ...defaultState }
  }
}

export function saveSetupState(state: GitNotesSetupState): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(state))
  } catch (e) {
    console.error('Failed to persist setup state', e)
  }
}

/** GitHub/GitLab-style rejection when the remote branch has commits you do not have locally. */
export function isPushRejectedFetchFirst(errorText: string): boolean {
  const m = errorText.toLowerCase()
  return (
    m.includes('fetch first') ||
    m.includes('non-fast-forward') ||
    (m.includes('rejected') && m.includes('remote contains')) ||
    m.includes('updates were rejected')
  )
}

export function isGitRebaseStateError(errorText: string): boolean {
  const m = errorText.toLowerCase()
  return (
    m.includes('rebase_in_progress') ||
    m.includes('rebase_conflicts') ||
    m.includes('detached_head') ||
    m.includes('could not apply')
  )
}

export function friendlyGitSyncError(errorText: string): string {
  const m = errorText.toLowerCase()
  // Pull --rebase stopped with merge conflicts; user must fix files first.
  if (m.includes('rebase_conflicts')) {
    return 'Sync paused: this rebase has conflicts. In Source Control, resolve each conflicted file, stage if needed, then click Continue rebase.'
  }
  // Repo is mid-rebase but there may be no conflicts left — user must continue or abort.
  if (m.includes('rebase_in_progress')) {
    return 'Sync paused: a rebase is still in progress. Open Source Control and click Continue rebase when your changes are ready (or Abort rebase to cancel).'
  }
  if (m.includes('detached_head') || m.includes('could not apply')) {
    return 'Sync paused: Git needs you to finish the rebase in Source Control (Continue or Abort), then try syncing again.'
  }
  return errorText
}

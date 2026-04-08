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
  if (isGitRebaseStateError(errorText)) {
    return 'Sync paused because a rebase is in progress. Open Source Control to resolve the conflict, then continue or abort the rebase.'
  }
  return errorText
}

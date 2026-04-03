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

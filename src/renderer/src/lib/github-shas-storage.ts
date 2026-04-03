const KEY = 'gitnotes-github-content-shas'

export function loadGithubContentShas(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (typeof p !== 'object' || p === null) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveGithubContentShas(map: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch (e) {
    console.error('Failed to persist GitHub content SHAs', e)
  }
}

export function mergeGithubContentShas(
  patch: Record<string, string | undefined>
): void {
  const cur = loadGithubContentShas()
  for (const [k, v] of Object.entries(patch)) {
    if (v) cur[k] = v
    else delete cur[k]
  }
  saveGithubContentShas(cur)
}

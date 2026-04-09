const GUEST_KEY = 'notelab-guest'

/** User chose “Continue as guest” — skip GitHub on launch; can connect in Settings. */
export function isGuestMode(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1'
  } catch {
    return false
  }
}

export function setGuestMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(GUEST_KEY, '1')
    else localStorage.removeItem(GUEST_KEY)
  } catch (e) {
    console.error('Failed to persist guest mode', e)
  }
}

export function clearGuestMode(): void {
  setGuestMode(false)
}

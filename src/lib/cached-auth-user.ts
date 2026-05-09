import type { BetterFetchError } from "@better-fetch/fetch"

const STORAGE_KEY = "mica_cached_auth_user"

export type CachedAuthUser = {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}

export function readCachedAuthUser(): CachedAuthUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const id = (parsed as { id?: unknown }).id
    if (typeof id !== "string" || !id) return null
    const { name, email, image } = parsed as CachedAuthUser
    return { id, name, email, image }
  } catch {
    return null
  }
}

export function writeCachedAuthUser(user: CachedAuthUser) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
      }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearCachedAuthUser() {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function isRecoverableSessionError(error: BetterFetchError | null): boolean {
  if (!error) return false
  if (error.status === 401) return false
  return true
}

/**
 * When the server session is missing but we should not treat the user as signed out
 * (offline, transport failure, 5xx, etc.), reuse the last known profile from localStorage.
 */
function isGuestSessionFlag(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem("guest_session") === "true"
}

export function offlineSessionUser(raw: {
  isPending: boolean
  data: { user?: CachedAuthUser | null } | null | undefined
  error: BetterFetchError | null
}): CachedAuthUser | null {
  if (typeof window === "undefined") return null
  if (isGuestSessionFlag()) return null

  const cached = readCachedAuthUser()
  if (!cached) return null

  if (raw.data?.user) return null

  if (raw.error?.status === 401) return null

  const online =
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true

  if (raw.isPending && online) return null

  if (!online) return cached

  if (!raw.isPending && isRecoverableSessionError(raw.error)) return cached

  return null
}

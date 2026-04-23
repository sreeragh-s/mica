import * as React from "react"
import { createAuthClient } from "better-auth/react"
import {
  clearCachedAuthUser,
  offlineSessionUser,
  writeCachedAuthUser,
} from "@/lib/cached-auth-user"

/** Must match the Worker `BETTER_AUTH_URL` origin (see `server/.dev.vars` for local wrangler). */
const authApiOrigin =
  (import.meta.env.VITE_BETTER_AUTH_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8787"

export const authClient = createAuthClient({
  baseURL: authApiOrigin,
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
})

function appCallbackURL(path = "/") {
  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).href
  }
  const fallback =
    (import.meta.env.VITE_APP_ORIGIN as string | undefined) ?? "http://localhost:1420"
  return new URL(path, fallback).href
}

export const signInWithGitHub = () =>
  authClient.signIn.social({
    provider: "github",
    callbackURL: appCallbackURL("/"),
  })

export const signOut = () => {
  clearCachedAuthUser()
  return authClient.signOut()
}

export const getSession = () => authClient.getSession()

export function useSession() {
  const raw = authClient.useSession()

  React.useEffect(() => {
    const live = raw.data?.user
    if (live) writeCachedAuthUser(live)
  }, [raw.data?.user])

  React.useEffect(() => {
    if (raw.error && "status" in raw.error && raw.error.status === 401) {
      clearCachedAuthUser()
    }
  }, [raw.error])

  return React.useMemo(() => {
    const offlineUser = offlineSessionUser({
      isPending: raw.isPending,
      data: raw.data,
      error: raw.error,
    })
    const liveUser = raw.data?.user ?? null
    const effectiveUser = liveUser ?? offlineUser

    if (!effectiveUser) {
      return raw
    }

    return {
      ...raw,
      data: {
        ...(raw.data ?? {}),
        user: effectiveUser,
        session: raw.data?.session ?? null,
      },
    }
  }, [raw])
}

export const isGuestSession = () => {
  if (typeof window === "undefined") return false
  return localStorage.getItem("guest_session") === "true"
}

export const setGuestSession = (isGuest: boolean) => {
  if (typeof window === "undefined") return
  if (isGuest) {
    localStorage.setItem("guest_session", "true")
  } else {
    localStorage.removeItem("guest_session")
  }
}

export const createGuestSession = () => {
  clearCachedAuthUser()
  setGuestSession(true)
}

export const clearGuestSession = () => {
  setGuestSession(false)
}

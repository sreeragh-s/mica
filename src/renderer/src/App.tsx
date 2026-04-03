import { useCallback, useEffect, useState } from "react"
import type { JSX } from "react"

import { LoginScreen } from "@/components/auth/LoginScreen"
import { NotesApp } from "@/components/notes/NotesApp"
import { getApi, parseSession } from "@/lib/auth-bridge"

export default function App(): JSX.Element {
  const api = getApi()
  const [phase, setPhase] = useState<"loading" | "auth" | "app">("loading")
  const [user, setUser] = useState<{
    name?: string
    email?: string
    image?: string | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    if (!api) {
      setPhase("app")
      setUser(null)
      return
    }
    const r = await api.auth.getSession()
    if (!r.ok) {
      setPhase("auth")
      setUser(null)
      return
    }
    const parsed = parseSession(r.data)
    if (parsed?.user) {
      setUser(parsed.user)
      setPhase("app")
    } else {
      setPhase("auth")
      setUser(null)
    }
  }, [api])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const handleGitHub = useCallback(async () => {
    if (!api) return
    setBusy(true)
    setLoginError(null)
    try {
      await api.auth.signInWithGithub()
      await refreshSession()
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Sign-in failed")
    } finally {
      setBusy(false)
    }
  }, [api, refreshSession])

  const handleSignOut = useCallback(async () => {
    if (!api) return
    await api.auth.signOut()
    await refreshSession()
  }, [api, refreshSession])

  if (phase === "loading") {
    return (
      <div className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
        Loading…
      </div>
    )
  }

  if (api && (phase === "auth" || !user)) {
    return (
      <LoginScreen onGitHub={handleGitHub} busy={busy} error={loginError} />
    )
  }

  return (
    <NotesApp
      user={user ?? undefined}
      onSignOut={api ? handleSignOut : undefined}
    />
  )
}

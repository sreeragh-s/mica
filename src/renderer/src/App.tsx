import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'

import { ThemeProvider } from 'next-themes'

import { LoginScreen } from '@/components/auth/LoginScreen'
import { SetupScreen } from '@/components/setup/SetupScreen'
import { NotesApp } from '@/components/notes/NotesApp'
import { applyUiFontToDocument, loadUiFont } from '@/lib/appearance-storage'
import { getApi, parseSession } from '@/lib/auth-bridge'
import { hydrateAppConfig } from '@/lib/gitnotes-app-config'
import { clearGuestMode, isGuestMode, setGuestMode } from '@/lib/guest-session'
import { loadSetupState, saveSetupState } from '@/lib/setup-storage'

type AppPhase = 'loading' | 'auth' | 'setup' | 'app'

export default function App(): JSX.Element {
  const api = getApi()
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [user, setUser] = useState<{
    name?: string
    email?: string
    image?: string | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    if (!api) {
      console.info('[gitnotes-app] session: no preload API — phase app (dev/browser)')
      setPhase('app')
      setUser(null)
      return
    }
    const r = await api.auth.getSession()
    if (!r.ok) {
      console.info('[gitnotes-app] session: get-session failed', r)
      setPhase('auth')
      setUser(null)
      return
    }
    const parsed = parseSession(r.data)
    if (parsed?.user) {
      clearGuestMode()
      setUser(parsed.user)
      const setup = loadSetupState()
      const setupKeyRaw = localStorage.getItem('gitnotes-setup')
      const hasNotesKey = localStorage.getItem('gitnotes-notes') != null
      const hasConfigBlob = localStorage.getItem('gitnotes-config-v1') != null
      const nextPhase: AppPhase = !setup.complete ? 'setup' : 'app'
      console.info('[gitnotes-app] session: signed in', {
        setupKeyInStorage: setupKeyRaw != null,
        setupComplete: setup.complete,
        setupSyncMode: setup.syncMode ?? null,
        hasNotesKey,
        hasConfigBlob,
        nextPhase,
        reason:
          nextPhase === 'setup'
            ? 'setup.complete is false — show SetupScreen until Get started or GitHub flow completes'
            : 'setup.complete is true (hydrated from ~/.gitnotes/gitnotes.config or localStorage) — go to notes'
      })
      if (!setup.complete) {
        setPhase('setup')
      } else {
        setPhase('app')
      }
    } else if (isGuestMode()) {
      console.info('[gitnotes-app] session: guest mode — phase app (no GitHub session)')
      setUser(null)
      const setup = loadSetupState()
      setPhase(!setup.complete ? 'setup' : 'app')
    } else {
      console.info('[gitnotes-app] session: no user in session — phase auth')
      setUser(null)
      setPhase('auth')
    }
  }, [api])

  useEffect(() => {
    void (async () => {
      const api = getApi()
      let dataRoot: string | null = null
      if (api?.workspace?.ensureDataRoot) {
        const r = await api.workspace.ensureDataRoot()
        if (r.ok) dataRoot = r.path
      }
      await hydrateAppConfig(dataRoot)
      applyUiFontToDocument(loadUiFont())
      await refreshSession()
    })()
  }, [refreshSession])

  const handleGitHub = useCallback(async () => {
    if (!api) return
    setBusy(true)
    setLoginError(null)
    try {
      await api.auth.signInWithGithub()
      await refreshSession()
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }, [api, refreshSession])

  const handleContinueAsGuest = useCallback(() => {
    setGuestMode(true)
    saveSetupState({
      complete: true,
      syncMode: 'local'
    })
    setUser(null)
    setPhase('app')
    console.info('[gitnotes-app] guest: continuing without GitHub — finish setup in Settings')
  }, [])

  const handleSignOut = useCallback(async () => {
    if (!api) return
    clearGuestMode()
    await api.auth.signOut()
    setUser(null)
    setPhase('auth')
  }, [api])

  const handleSetupDone = useCallback(() => {
    console.info('[gitnotes-app] setup: finished — phase app', loadSetupState())
    setPhase('app')
  }, [])

  let content: JSX.Element
  if (phase === 'loading') {
    content = (
      <div className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
        Loading…
      </div>
    )
  } else if (api && phase === 'auth') {
    content = (
      <LoginScreen
        onGitHub={handleGitHub}
        onGuest={handleContinueAsGuest}
        busy={busy}
        error={loginError}
      />
    )
  } else if (api && phase === 'setup') {
    content = <SetupScreen api={api} onDone={handleSetupDone} />
  } else {
    content = (
      <NotesApp
        user={user ?? undefined}
        guestMode={isGuestMode()}
        onSignOut={api ? handleSignOut : undefined}
        onConnectGitHub={api ? handleGitHub : undefined}
      />
    )
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="gitnotes-theme">
      {content}
    </ThemeProvider>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'

import { ThemeProvider } from 'next-themes'

import { LoginScreen } from '@/components/auth/LoginScreen'
import { SetupScreen } from '@/components/setup/SetupScreen'
import { NotesApp } from '@/components/notes/NotesApp'
import { ThemePresetRuntime } from '@/components/appearance/ThemePresetRuntime'
import {
  applyUiFontToDocument,
  loadThemeConfig,
  loadThemePresetId,
  loadUiFont,
} from '@/lib/theme/appearance-storage'
import {
  applyThemeToDocument,
  getResolvedAppearanceMode,
} from '@/lib/theme/theme-preset-apply'
import { getApi, parseSession } from '@/lib/auth/auth-bridge'
import { hydrateAppConfig } from '@/lib/config/notelab-app-config'
import { clearGuestMode, isGuestMode, setGuestMode } from '@/lib/auth/guest-session'
import { loadSetupState, saveSetupState } from '@/lib/workspace/setup-storage'
import { UpdateBanner } from '@/components/update/UpdateBanner'

type AppPhase = 'loading' | 'auth' | 'setup' | 'app'

type InitialRootResult = {
  path: string
  configRoot: string
  gitAvailable: boolean
  gitInitialized: boolean
  filesystemOnly: boolean
}

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
  const [initialRoot, setInitialRoot] = useState<InitialRootResult | null>(null)

  const refreshSession = useCallback(async () => {
    if (!api) {
      console.info('[notelab-app] session: no preload API — phase app (dev/browser)')
      setPhase('app')
      setUser(null)
      return
    }
    const r = await api.auth.getSession()
    if (!r.ok) {
      console.info('[notelab-app] session: get-session failed', r)
      setPhase('auth')
      setUser(null)
      return
    }
    const parsed = parseSession(r.data)
    if (parsed?.user) {
      clearGuestMode()
      setUser(parsed.user)
      const setup = loadSetupState()
      const setupKeyRaw = localStorage.getItem('notelab-setup')
      const hasNotesKey = localStorage.getItem('notelab-notes') != null
      const hasConfigBlob = localStorage.getItem('notelab-config-v1') != null
      const nextPhase: AppPhase = !setup.complete ? 'setup' : 'app'
      console.info('[notelab-app] session: signed in', {
        setupKeyInStorage: setupKeyRaw != null,
        setupComplete: setup.complete,
        setupSyncMode: setup.syncMode ?? null,
        hasNotesKey,
        hasConfigBlob,
        nextPhase,
        reason:
          nextPhase === 'setup'
            ? 'setup.complete is false — show SetupScreen until Get started or GitHub flow completes'
            : 'setup.complete is true (hydrated from ~/.notelab/notelab.config or localStorage) — go to notes'
      })
      if (!setup.complete) {
        setPhase('setup')
      } else {
        setPhase('app')
      }
    } else if (isGuestMode()) {
      console.info('[notelab-app] session: guest mode — phase app (no GitHub session)')
      setUser(null)
      const setup = loadSetupState()
      setPhase(!setup.complete ? 'setup' : 'app')
    } else {
      console.info('[notelab-app] session: no user in session — phase auth')
      setUser(null)
      setPhase('auth')
    }
  }, [api])

  useEffect(() => {
    void (async () => {
      const savedRoot = loadSetupState().workspaceRoot
      if (api?.workspace?.ensureDataRoot) {
        const r = await api.workspace.ensureDataRoot(savedRoot ? { path: savedRoot } : undefined)
        if (r.ok) {
          setInitialRoot(r)
          await hydrateAppConfig(r.configRoot)
        }
      } else {
        await hydrateAppConfig(null)
      }
      applyUiFontToDocument(loadUiFont())
      applyThemeToDocument(
        loadThemePresetId(),
        getResolvedAppearanceMode(),
        loadThemeConfig()
      )
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
    console.info('[notelab-app] guest: continuing without GitHub — finish setup in Settings')
  }, [])

  const handleSignOut = useCallback(async () => {
    if (!api) return
    clearGuestMode()
    await api.auth.signOut()
    setUser(null)
    setPhase('auth')
  }, [api])

  const handleSetupDone = useCallback(() => {
    console.info('[notelab-app] setup: finished — phase app', loadSetupState())
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
    content = <SetupScreen api={api} initialRoot={initialRoot} onDone={handleSetupDone} />
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="notelab-theme">
      <ThemePresetRuntime />
      <div className="flex h-screen flex-col">
        <UpdateBanner />
        <div className="min-h-0 flex-1">{content}</div>
      </div>
    </ThemeProvider>
  )
}

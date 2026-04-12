import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'

import { ThemeProvider } from 'next-themes'

import { SetupScreen } from '@/features/setup/SetupScreen'
import { NotesApp } from '@/features/notes/NotesApp'
import { ThemePresetRuntime } from '@/features/appearance/ThemePresetRuntime'
import {
  applyUiFontToDocument,
  loadThemeConfig,
  loadThemePresetId,
  loadUiFont
} from '@/lib/theme/appearance-storage'
import { applyThemeToDocument, getResolvedAppearanceMode } from '@/lib/theme/theme-preset-apply'
import { getApi } from '@/bridges/auth/auth-bridge'
import { hydrateAppConfig } from '@/lib/config/notelab-app-config-write'
import { loadSetupState } from '@/lib/workspace/setup-storage'
import { UpdateBanner } from '@/features/update/UpdateBanner'
import { useAuth } from '@/hooks/app/useAuth'

type AppPhase = 'loading' | 'setup' | 'app'

type InitialRootResult = {
  path: string
  configRoot: string
  gitAvailable: boolean
  gitInitialized: boolean
  filesystemOnly: boolean
}

export default function App(): JSX.Element {
  const api = getApi()
  const { refreshSession: refreshAuthSession } = useAuth()
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [initialRoot, setInitialRoot] = useState<InitialRootResult | null>(null)

  const resolvePhaseFromSetup = useCallback((): AppPhase => {
    const setup = loadSetupState()
    return setup.workspaceRoot ? 'app' : 'setup'
  }, [])

  const initializeSession = useCallback(async () => {
    if (!api) {
      console.info('[notelab-app] session: no preload API — phase app (dev/browser)')
      setPhase('app')
      return
    }
    const nextUser = await refreshAuthSession()
    if (!nextUser) {
      console.info('[notelab-app] session: no user in session — continuing without auth')
      setPhase(resolvePhaseFromSetup())
      return
    }
    if (nextUser) {
      const setup = loadSetupState()
      const nextPhase = resolvePhaseFromSetup()
      console.info('[notelab-app] session: signed in', {
        workspaceRoot: setup.workspaceRoot ?? null,
        nextPhase,
        reason:
          nextPhase === 'setup'
            ? 'no workspace configured in app config yet'
            : 'workspace configured in app config — go to notes'
      })
      setPhase(nextPhase)
    }
  }, [api, refreshAuthSession, resolvePhaseFromSetup])

  useEffect(() => {
    void (async () => {
      const savedRoot = loadSetupState().workspaceRoot
      const [configRootResult] = await Promise.all([
        api?.workspace?.ensureDataRoot
          ? api.workspace.ensureDataRoot(savedRoot ? { path: savedRoot } : undefined)
          : Promise.resolve(null),
        Promise.resolve(null)
      ])
      if (configRootResult?.ok) {
        setInitialRoot(configRootResult)
        await hydrateAppConfig(configRootResult.configRoot)
      } else {
        setPhase('setup')
        return
      }
      applyUiFontToDocument(loadUiFont())
      applyThemeToDocument(loadThemePresetId(), getResolvedAppearanceMode(), loadThemeConfig())
      await initializeSession()
    })()
  }, [initializeSession])

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
  } else if (api && phase === 'setup') {
    content = <SetupScreen api={api} initialRoot={initialRoot} onDone={handleSetupDone} />
  } else {
    content = <NotesApp />
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

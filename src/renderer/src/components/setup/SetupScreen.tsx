import { useCallback, useEffect, useState, type JSX } from 'react'

import { Check, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { isMacNotelab } from '@/lib/core/electron-env'
import { saveSetupState } from '@/lib/workspace/setup-storage'
import { cn } from '@/lib/utils'
import type { NotelabApi } from '@/lib/auth/auth-bridge'

type InitialRootResult = {
  path: string
  configRoot: string
  gitAvailable: boolean
  gitInitialized: boolean
  filesystemOnly: boolean
}

type Props = {
  api: NotelabApi
  initialRoot: InitialRootResult | null
  onDone: () => void
}

export function SetupScreen({ api, initialRoot, onDone }: Props): JSX.Element {
  const mac = isMacNotelab()
  const ws = api.workspace

  const [rootLoading, setRootLoading] = useState(!initialRoot)
  const [rootPath, setRootPath] = useState<string | null>(initialRoot?.path ?? null)
  const [gitAvailable, setGitAvailable] = useState<boolean | null>(initialRoot?.gitAvailable ?? null)
  const [gitInitialized, setGitInitialized] = useState(initialRoot?.gitInitialized ?? false)
  const [rootError, setRootError] = useState<string | null>(null)
  const [pickBusy, setPickBusy] = useState(false)

  const runDataRoot = useCallback(async (path?: string): Promise<void> => {
    if (!ws?.ensureDataRoot) {
      setRootLoading(false)
      return
    }
    setRootLoading(true)
    setRootError(null)
    const root = await ws.ensureDataRoot(path ? { path } : undefined)
    if (!root.ok) {
      setRootError(root.error)
      setRootLoading(false)
      return
    }
    setRootPath(root.path)
    setGitAvailable(root.gitAvailable)
    setGitInitialized(root.gitInitialized)
    setRootLoading(false)
  }, [ws])

  useEffect(() => {
    // Only call ensureDataRoot if we didn't get an initial result from App.tsx
    if (!initialRoot) void runDataRoot()
  }, [initialRoot, runDataRoot])

  const handlePickDirectory = useCallback(async (): Promise<void> => {
    if (!ws?.pickDirectory) return
    setPickBusy(true)
    try {
      const result = await ws.pickDirectory()
      if (!result.ok) return // cancelled
      await runDataRoot(result.path)
    } finally {
      setPickBusy(false)
    }
  }, [ws, runDataRoot])

  const getStarted = useCallback(() => {
    saveSetupState({
      complete: true,
      syncMode: gitInitialized ? 'git' : 'local',
      workspaceRoot: rootPath ?? undefined,
    })
    onDone()
  }, [gitInitialized, rootPath, onDone])

  const rootOk = Boolean(rootPath)

  return (
    <div className="bg-background text-foreground flex h-screen w-full flex-col overflow-hidden">
      <div
        className={cn(
          'mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center gap-4 overflow-x-hidden overflow-y-auto px-6 py-4',
          mac && 'pt-6'
        )}
      >
        <div className="space-y-0.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Set up notelab</h1>
          <p className="text-muted-foreground text-sm">
            Choose where your notes will be stored.
          </p>
        </div>

        {/* Workspace directory */}
        <div className="border-border space-y-2 rounded-lg border px-3 py-2.5">
          <h2 className="text-foreground text-sm font-semibold">Workspace folder</h2>
          <p className="text-muted-foreground text-xs leading-snug">
            All notes and config will be stored here. Defaults to{' '}
            <code className="text-xs">~/.notelab</code>.
          </p>
          <div className="flex items-center gap-2">
            <div className="border-input bg-muted/30 min-w-0 flex-1 truncate rounded-md border px-2.5 py-1.5 font-mono text-xs">
              {rootLoading ? (
                <span className="text-muted-foreground">Loading…</span>
              ) : rootPath ? (
                <span className="text-foreground">{rootPath}</span>
              ) : (
                <span className="text-destructive">Not set</span>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={pickBusy || rootLoading}
              onClick={() => void handlePickDirectory()}
            >
              {pickBusy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <FolderOpen className="size-3.5" aria-hidden />
              )}
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-8 shrink-0"
              disabled={rootLoading || pickBusy}
              onClick={() => void runDataRoot(rootPath ?? undefined)}
              aria-label="Refresh"
            >
              {rootLoading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
            </Button>
          </div>
          {rootError && (
            <p className="text-destructive text-xs">{rootError}</p>
          )}
        </div>

        {/* Status checklist */}
        <ul className="space-y-2 text-sm">
          <li className="border-border flex items-start gap-3 rounded-lg border px-3 py-2.5">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {rootLoading ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : rootOk ? (
                <Check className="text-foreground size-4" strokeWidth={2} />
              ) : (
                <X className="text-destructive size-4" strokeWidth={2} />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-medium">Workspace folder</p>
              {rootPath ? (
                <p className="text-muted-foreground text-xs break-all leading-snug">{rootPath}</p>
              ) : rootLoading ? (
                <p className="text-muted-foreground text-xs">Preparing…</p>
              ) : (
                <p className="text-destructive text-xs">Could not create the folder. Check permissions.</p>
              )}
            </div>
          </li>

          <li className="border-border flex items-start gap-3 rounded-lg border px-3 py-2.5">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {rootLoading ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : gitAvailable === true ? (
                <Check className="text-foreground size-4" strokeWidth={2} />
              ) : (
                <span className="text-muted-foreground text-xs font-medium">—</span>
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-medium">Git (optional)</p>
              <p className="text-muted-foreground text-xs leading-snug">
                {rootLoading
                  ? 'Checking…'
                  : gitAvailable
                    ? gitInitialized
                      ? 'Git repo ready. Initialize or connect a remote in Source Control.'
                      : 'Available. Initialize a repo from Source Control when ready.'
                    : 'Not installed. You can still use notelab with local notes.'}
              </p>
            </div>
          </li>
        </ul>
      </div>

      <div className="bg-background shrink-0 px-6 pt-4 pb-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!rootOk || rootLoading}
            onClick={getStarted}
          >
            Get started
          </Button>
          <p className="text-muted-foreground text-center text-xs leading-snug">
            You can change the workspace and connect GitHub sync in Settings anytime.
          </p>
        </div>
      </div>
    </div>
  )
}

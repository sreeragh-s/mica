import { useCallback, useEffect, useState, type JSX } from 'react'

import { Check, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { GitNotesApi } from '@/lib/auth-bridge'
import { isMacElectron } from '@/lib/electron-env'
import { cn } from '@/lib/utils'

type CheckState = 'idle' | 'ok' | 'fail'

type Props = {
  api: GitNotesApi
  onReady: () => void
}

export function OnboardingScreen({ api, onReady }: Props): JSX.Element {
  const mac = isMacElectron()
  const [busy, setBusy] = useState(true)
  const [gitState, setGitState] = useState<CheckState>('idle')
  const [gitDetail, setGitDetail] = useState<string | null>(null)
  const [rootState, setRootState] = useState<CheckState>('idle')
  const [rootDetail, setRootDetail] = useState<string | null>(null)

  const runChecks = useCallback(async (): Promise<void> => {
    const ws = api.workspace
    if (!ws?.checkGit || !ws.ensureDataRoot) {
      setBusy(false)
      setGitState('fail')
      setGitDetail(
        'App workspace API is missing. Fully restart the app so the latest preload loads.'
      )
      setRootState('idle')
      return
    }
    setBusy(true)
    setGitState('idle')
    setRootState('idle')
    setGitDetail(null)
    setRootDetail(null)

    const git = await ws.checkGit()
    if (!git.ok) {
      setGitState('fail')
      setGitDetail(git.error)
      setRootState('idle')
      setBusy(false)
      return
    }
    setGitState('ok')
    setGitDetail(git.version)

    const root = await ws.ensureDataRoot()
    if (!root.ok) {
      setRootState('fail')
      setRootDetail(root.error)
      setBusy(false)
      return
    }
    setRootState('ok')
    setRootDetail(root.path)
    setBusy(false)
  }, [api])

  useEffect(() => {
    queueMicrotask(() => {
      void runChecks()
    })
  }, [runChecks])

  const checksPassed = !busy && gitState === 'ok' && rootState === 'ok' && Boolean(rootDetail)
  const showRetry = !busy && (gitState === 'fail' || rootState === 'fail')
  const showContinue = checksPassed

  return (
    <div className="bg-background text-foreground flex h-screen w-full flex-col items-center justify-center p-8">
      <div className={cn('flex w-full max-w-md flex-col gap-8', mac && 'pt-8')}>
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Git setup</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            GitNotes needs Git on your system and a local notes folder before you can sign in.
          </p>
        </div>

        <ul className="space-y-3 text-sm">
          <li className="border-border flex items-start gap-3 rounded-lg border px-4 py-3">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {busy || gitState === 'idle' ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : gitState === 'ok' ? (
                <Check className="text-foreground size-4" strokeWidth={2} />
              ) : (
                <X className="text-destructive size-4" strokeWidth={2} />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-medium">Git</p>
              {gitDetail ? (
                <p
                  className={cn(
                    'text-xs leading-relaxed',
                    gitState === 'fail' ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {gitDetail}
                </p>
              ) : busy ? (
                <p className="text-muted-foreground text-xs">Checking…</p>
              ) : null}
            </div>
          </li>

          <li className="border-border flex items-start gap-3 rounded-lg border px-4 py-3">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {gitState !== 'ok' ? (
                <span className="text-muted-foreground block size-4" />
              ) : busy || rootState === 'idle' ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : rootState === 'ok' ? (
                <Check className="text-foreground size-4" strokeWidth={2} />
              ) : (
                <X className="text-destructive size-4" strokeWidth={2} />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-medium">Notes folder</p>
              {rootDetail && gitState === 'ok' ? (
                <p
                  className={cn(
                    'text-xs leading-relaxed break-all',
                    rootState === 'fail' ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {rootDetail}
                </p>
              ) : gitState === 'ok' && (busy || rootState === 'idle') ? (
                <p className="text-muted-foreground text-xs">Preparing…</p>
              ) : gitState !== 'ok' ? (
                <p className="text-muted-foreground text-xs">Waiting for Git</p>
              ) : null}
            </div>
          </li>
        </ul>

        {showContinue ? (
          <div className="flex flex-col items-center gap-2">
            <Button type="button" onClick={onReady}>
              Continue to sign in
            </Button>
          </div>
        ) : null}

        {showRetry ? (
          <div className="flex flex-col items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void runChecks()}>
              Try again
            </Button>
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              Install Git from{' '}
              <a
                className="text-foreground underline underline-offset-2"
                href="https://git-scm.com/downloads"
                target="_blank"
                rel="noreferrer"
              >
                git-scm.com
              </a>
              , then restart the app or tap Try again.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

import { useCallback, useState, type JSX } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getApi } from '@/lib/auth/auth-bridge'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cwd: string
  /** e.g. "my-workspace--a1b2c3" → default repo name suggestion */
  defaultRepoName: string
  githubUsername: string | null
  onRemoteSet: (remoteUrl: string) => Promise<void>
  /** Called when setGitRemote fails due to missing git user.name/email config. */
  onRequestUserConfig?: () => void
  /** The operation to retry after the user configures git. */
  onRetryWithUserConfig?: (retry: () => Promise<void>) => void
}

export function GitRemoteDialog({
  open,
  onOpenChange,
  cwd,
  defaultRepoName: _defaultRepoName,
  githubUsername: _githubUsername,
  onRemoteSet,
  onRequestUserConfig,
  onRetryWithUserConfig,
}: Props): JSX.Element {
  const [existingUrl, setExistingUrl] = useState('')
  const [existingBusy, setExistingBusy] = useState(false)
  const [existingError, setExistingError] = useState<string | null>(null)

  const handleConnectExisting = useCallback(async () => {
    const api = getApi()
    const workspace = api?.workspace
    if (!workspace?.setGitRemote) return
    const url = existingUrl.trim()
    if (!url) { setExistingError('Enter a repository URL.'); return }
    setExistingBusy(true)
    setExistingError(null)
    try {
      const r = await workspace.setGitRemote({ cwd, url })
      if (!r.ok) {
        const err = r.error.toLowerCase()
        if (
          err.includes('user.name') ||
          err.includes('user.email') ||
          err.includes('please tell me who you are')
        ) {
          onRequestUserConfig?.()
          if (onRetryWithUserConfig) {
            onRetryWithUserConfig(async () => {
              setExistingBusy(true)
              setExistingError(null)
              try {
                const retryR = await workspace.setGitRemote({ cwd, url })
                if (!retryR.ok) { setExistingError(retryR.error); return }
                await onRemoteSet(url)
                onOpenChange(false)
              } finally {
                setExistingBusy(false)
              }
            })
          }
          return
        }
        setExistingError(r.error)
        return
      }
      await onRemoteSet(url)
      onOpenChange(false)
    } finally {
      setExistingBusy(false)
    }
  }, [cwd, existingUrl, onRemoteSet, onOpenChange, onRequestUserConfig, onRetryWithUserConfig])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Connect GitHub repo</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[11px]">Paste an existing repo URL</p>
          <input
            type="text"
            className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-xs focus-visible:ring-1 focus-visible:outline-none"
            placeholder="https://github.com/username/repo.git"
            value={existingUrl}
            onChange={(e) => setExistingUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleConnectExisting()}
            disabled={existingBusy}
            autoFocus
          />
          {existingError && (
            <p className="text-destructive text-[11px]">{existingError}</p>
          )}
          <Button
            type="button"
            className="w-full gap-1.5 text-xs"
            size="sm"
            disabled={existingBusy || !existingUrl.trim()}
            onClick={() => void handleConnectExisting()}
          >
            Add existing repo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

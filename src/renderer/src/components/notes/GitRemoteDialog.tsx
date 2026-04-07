import { useCallback, useState, type JSX } from 'react'

import { Loader2, Lock, Globe } from 'lucide-react'
import github from '@/assets/icons/github.svg'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getApi } from '@/lib/auth-bridge'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cwd: string
  /** e.g. "my-workspace--a1b2c3" → default repo name suggestion */
  defaultRepoName: string
  githubUsername: string | null
  onRemoteSet: (remoteUrl: string) => Promise<void>
}

export function GitRemoteDialog({
  open,
  onOpenChange,
  cwd,
  defaultRepoName,
  githubUsername,
  onRemoteSet,
}: Props): JSX.Element {
  // Existing repo
  const [existingUrl, setExistingUrl] = useState('')
  const [existingBusy, setExistingBusy] = useState(false)
  const [existingError, setExistingError] = useState<string | null>(null)

  // New repo
  const [repoName, setRepoName] = useState(() => {
    const base = defaultRepoName.includes('--')
      ? defaultRepoName.slice(0, defaultRepoName.lastIndexOf('--'))
      : defaultRepoName
    return base.replace(/-/g, '-') || 'my-notes'
  })
  const [creatingVisibility, setCreatingVisibility] = useState<'private' | 'public' | null>(null)
  const [newError, setNewError] = useState<string | null>(null)

  const handleConnectExisting = useCallback(async () => {
    const api = getApi()
    if (!api?.workspace?.setGitRemote) return
    const url = existingUrl.trim()
    if (!url) { setExistingError('Enter a repository URL.'); return }
    setExistingBusy(true)
    setExistingError(null)
    try {
      const r = await api.workspace.setGitRemote({ cwd, url })
      if (!r.ok) { setExistingError(r.error); return }
      await onRemoteSet(url)
      onOpenChange(false)
    } finally {
      setExistingBusy(false)
    }
  }, [cwd, existingUrl, onRemoteSet, onOpenChange])

  const handleCreateRepo = useCallback(async (visibility: 'private' | 'public') => {
    const api = getApi()
    if (!api?.auth?.fetch || !api?.workspace?.setGitRemote) return
    const name = repoName.trim()
    if (!name) { setNewError('Enter a repository name.'); return }
    if (!githubUsername) { setNewError('Not signed in to GitHub.'); return }
    setCreatingVisibility(visibility)
    setNewError(null)
    try {
      const resp = await api.auth.fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, private: visibility === 'private', auto_init: false }),
      })
      if (!resp.ok) {
        const body = JSON.parse(resp.body) as { message?: string }
        setNewError(body.message ?? `GitHub error ${resp.status}`)
        return
      }
      const created = JSON.parse(resp.body) as { clone_url?: string; ssh_url?: string }
      const remoteUrl = created.clone_url ?? `https://github.com/${githubUsername}/${name}.git`

      const r = await api.workspace.setGitRemote({ cwd, url: remoteUrl })
      if (!r.ok) { setNewError(r.error); return }
      await onRemoteSet(remoteUrl)
      onOpenChange(false)
    } finally {
      setCreatingVisibility(null)
    }
  }, [cwd, repoName, githubUsername, onRemoteSet, onOpenChange])

  const isLoading = (v: 'private' | 'public') => creatingVisibility === v
  const canCreate = repoName.trim() && githubUsername && !creatingVisibility

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Connect GitHub repo</DialogTitle>
        </DialogHeader>

        {/* Existing repo URL */}
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
            {existingBusy ? <Loader2 className="size-3.5 animate-spin" /> : <img src={github} alt="" className="size-3.5" />}
            Add existing repo
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="border-border w-full border-t" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background text-muted-foreground text-[10px] px-2">or create new</span>
          </div>
        </div>

        {/* New repo name */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 rounded-md border border-input bg-muted/40 px-3 py-2 text-xs">
            {githubUsername ? (
              <>
                <img src={github} alt="" className="text-muted-foreground size-3 shrink-0" />
                <span className="text-muted-foreground shrink-0">{githubUsername}/</span>
              </>
            ) : (
              <img src={github} alt="" className="text-muted-foreground size-3 shrink-0" />
            )}
            <input
              type="text"
              className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder="repo-name"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
              disabled={!!creatingVisibility}
            />
          </div>

          {newError && (
            <p className="text-destructive text-[11px]">{newError}</p>
          )}
          {!githubUsername && (
            <p className="text-muted-foreground text-[11px]">Sign in to GitHub first.</p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 gap-1.5 text-xs"
              size="sm"
              disabled={!canCreate}
              onClick={() => void handleCreateRepo('private')}
            >
              {isLoading('private') ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
              Private
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1 gap-1.5 text-xs"
              size="sm"
              disabled={!canCreate}
              onClick={() => void handleCreateRepo('public')}
            >
              {isLoading('public') ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
              Public
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

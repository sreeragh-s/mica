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
  onConfigured: () => void
}

export function GitUserConfigDialog({
  open,
  onOpenChange,
  cwd,
  onConfigured,
}: Props): JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDone = useCallback(async () => {
    const api = getApi()
    if (!api?.workspace?.gitSetConfig) return
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName) { setError('Enter your Git user name.'); return }
    if (!trimmedEmail) { setError('Enter your Git email address.'); return }
    setBusy(true)
    setError(null)
    try {
      const r = await api.workspace.gitSetConfig({ cwd, name: trimmedName, email: trimmedEmail })
      if (!r.ok) { setError(r.error); return }
      onConfigured()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }, [cwd, name, email, onConfigured, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Configure Git user</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-[11px]">
          Git needs your user name and email to commit. These are stored locally in your repository
          config and never shared.
        </p>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px]" htmlFor="git-config-name">
              User name
            </label>
            <input
              id="git-config-name"
              type="text"
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-xs focus-visible:ring-1 focus-visible:outline-none"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleDone()}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px]" htmlFor="git-config-email">
              Email address
            </label>
            <input
              id="git-config-email"
              type="email"
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-xs focus-visible:ring-1 focus-visible:outline-none"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleDone()}
              disabled={busy}
            />
          </div>

          {error && (
            <p className="text-destructive text-[11px]">{error}</p>
          )}

          <Button
            type="button"
            className="w-full gap-1.5 text-xs"
            size="sm"
            disabled={busy || !name.trim() || !email.trim()}
            onClick={() => void handleDone()}
          >
            {busy ? 'Saving…' : 'Done'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

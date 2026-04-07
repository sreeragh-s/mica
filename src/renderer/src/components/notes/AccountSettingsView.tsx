import type { JSX } from 'react'

import { GitBranch, LogOut, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MacTitlebarStyles, NotesUser } from './notes-app-types'

export type AccountSettingsViewProps = {
  user?: NotesUser | null
  guestMode?: boolean
  onSignOut?: () => void
  onConnectGitHub?: () => void | Promise<void>
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
}

export function AccountSettingsView({
  user,
  guestMode = false,
  onSignOut,
  onConnectGitHub,
  isMacNotelab,
  macTitlebarStyles
}: AccountSettingsViewProps): JSX.Element {
  /** Session user with something to show (avoids treating `{}` or null as “signed in with GitHub”). */
  const hasAccountIdentity = Boolean(
    user && (user.email?.trim() || user.name?.trim() || user.image)
  )
  const showGuest = Boolean(guestMode && !hasAccountIdentity)

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        {user?.image ? (
          <img
            src={user.image}
            alt=""
            className="border-border size-16 shrink-0 rounded-full border object-cover"
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-full">
            <User className="size-8" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground text-lg font-semibold tracking-tight">
              {showGuest ? 'Guest' : user?.name ?? 'Account'}
            </h2>
            {showGuest ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                Notes stay on this device until you connect GitHub. You can finish repo and sync setup under{' '}
                <span className="text-foreground font-medium">Settings → GitHub</span>.
              </p>
            ) : user?.email ? (
              <p className="text-muted-foreground truncate text-sm leading-relaxed">{user.email}</p>
            ) : hasAccountIdentity ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                You are signed in with GitHub.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">
                You are not signed in. Use Continue with GitHub on the welcome screen or below to sync.
              </p>
            )}
          </div>
        </div>
      </div>
      {showGuest && onConnectGitHub ? (
        <Button
          type="button"
          className="w-full gap-2 sm:w-auto"
          onClick={() => void onConnectGitHub()}
        >
          <GitBranch className="size-4" aria-hidden />
          Continue with GitHub
        </Button>
      ) : null}
      {onSignOut ? (
        <Button
          type="button"
          variant="destructive"
          className="w-full gap-2 sm:w-auto"
          onClick={() => void onSignOut()}
        >
          <LogOut className="size-4" aria-hidden />
          {showGuest ? 'Back to welcome' : 'Log out'}
        </Button>
      ) : null}
    </div>
  )
}

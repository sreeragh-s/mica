import type { JSX } from 'react'

import { GitBranch, LogOut, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MacTitlebarStyles } from '@/features/notes/notes-app-types'
import { useAuth } from '@/hooks/app/useAuth'

export type AccountSettingsViewProps = {
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
}

export function AccountSettingsView({
  isMacNotelab,
  macTitlebarStyles
}: AccountSettingsViewProps): JSX.Element {
  const { user, signInWithGitHub, signOut } = useAuth()
  /** Session user with something to show (avoids treating `{}` or null as “signed in with GitHub”). */
  const hasAccountIdentity = Boolean(
    user && (user.email?.trim() || user.name?.trim() || user.image)
  )

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
              {user?.name ?? 'Account'}
            </h2>
            {user?.email ? (
              <p className="text-muted-foreground truncate text-sm leading-relaxed">{user.email}</p>
            ) : hasAccountIdentity ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                You are signed in with GitHub.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">
                You are not signed in. Connect GitHub below whenever you want to enable sync.
              </p>
            )}
          </div>
        </div>
      </div>
      {!hasAccountIdentity ? (
        <Button
          type="button"
          className="w-full gap-2 sm:w-auto"
          onClick={() => void signInWithGitHub()}
        >
          <GitBranch className="size-4" aria-hidden />
          Continue with GitHub
        </Button>
      ) : null}
      {hasAccountIdentity ? (
        <Button
          type="button"
          variant="destructive"
          className="w-full gap-2 sm:w-auto"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </Button>
      ) : null}
    </div>
  )
}

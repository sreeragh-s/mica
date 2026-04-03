import type { JSX } from 'react'

import { LogOut, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MacTitlebarStyles, NotesUser } from './notes-app-types'

export type AccountSettingsViewProps = {
  user?: NotesUser | null
  onSignOut?: () => void
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
}

export function AccountSettingsView({
  user,
  onSignOut,
  macElectron,
  macTitlebarStyles
}: AccountSettingsViewProps): JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col gap-6 p-6"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
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
          <h2 className="text-foreground text-lg font-semibold leading-tight">
            {user?.name ?? 'Account'}
          </h2>
          {user?.email ? (
            <p className="text-muted-foreground mt-1 truncate text-sm">{user.email}</p>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">You are signed in with GitHub.</p>
          )}
        </div>
      </div>
      {onSignOut ? (
        <Button
          type="button"
          variant="destructive"
          className="w-full gap-2 sm:w-auto"
          onClick={() => void onSignOut()}
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </Button>
      ) : null}
    </div>
  )
}

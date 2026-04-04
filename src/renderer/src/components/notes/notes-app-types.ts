import type { CSSProperties } from 'react'

export type MacTitlebarStyles = {
  drag: CSSProperties
  noDrag: CSSProperties
}

export type NotesUser = {
  name?: string
  email?: string
  image?: string | null
}

export type NotesAppProps = {
  /** Signed-in user (Electron + GitHub); shown on the account settings page. */
  user?: NotesUser | null
  /** True when the user chose “Continue as guest” (no GitHub session yet). */
  guestMode?: boolean
  onSignOut?: () => void
  /** Open GitHub OAuth (e.g. from Account when guest). */
  onConnectGitHub?: () => void | Promise<void>
}

export type AppMode = 'notes' | 'settings'
export type SettingsSection = 'account' | 'github' | 'appearance' | 'shortcuts' | 'debug' | 'indexing'

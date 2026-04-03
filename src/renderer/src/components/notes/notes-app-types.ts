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
  onSignOut?: () => void
}

export type AppMode = 'notes' | 'settings'
export type SettingsSection = 'account' | 'github' | 'debug'

import type { CSSProperties } from 'react'
import type { AuthUser } from '@/hooks/app/useAuth'

export type MacTitlebarStyles = {
  drag: CSSProperties
  noDrag: CSSProperties
}

export type NotesUser = AuthUser

export type AppMode = 'notes' | 'settings'
export type SettingsSection =
  | 'account'
  | 'workspace'
  | 'github'
  | 'appearance'
  | 'editor'
  | 'shortcuts'
  | 'debug'
  | 'indexing'

import type { JSX } from 'react'

import type { Folder } from '@/lib/notes-storage'
import type { MacTitlebarStyles } from './notes-app-types'
import { useWorkspaceSettings } from './useWorkspaceSettings'
import { WorkspaceSettingsView } from './WorkspaceSettingsView'

export type WorkspaceSettingsPanelProps = {
  folder: Folder
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  onRename: (name: string) => void
  canDelete: boolean
  onDeleteWorkspace: () => Promise<void>
}

export function WorkspaceSettingsPanel({
  folder,
  isMacNotelab,
  macTitlebarStyles,
  onRename,
  canDelete,
  onDeleteWorkspace,
}: WorkspaceSettingsPanelProps): JSX.Element {
  const model = useWorkspaceSettings({
    folder,
    onRename,
    canDelete,
    onDelete: onDeleteWorkspace,
  })
  return (
    <WorkspaceSettingsView
      folder={folder}
      isMacNotelab={isMacNotelab}
      macTitlebarStyles={macTitlebarStyles}
      {...model}
    />
  )
}

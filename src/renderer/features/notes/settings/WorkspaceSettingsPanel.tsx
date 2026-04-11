import type { JSX } from 'react'

import type { Folder } from '@/lib/notes/notes-storage'
import type { MacTitlebarStyles } from '@/features/notes/notes-app-types'
import { useWorkspaceSettings } from '@/features/notes/app-state/useWorkspaceSettings'
import { WorkspaceSettingsView } from '@/features/notes/settings/WorkspaceSettingsView'

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
  onDeleteWorkspace
}: WorkspaceSettingsPanelProps): JSX.Element {
  const model = useWorkspaceSettings({
    folder,
    onRename,
    canDelete,
    onDelete: onDeleteWorkspace
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

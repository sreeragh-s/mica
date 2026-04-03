import type { JSX } from 'react'

import type { WorkspaceFolder } from '@/lib/notes-storage'
import type { MacTitlebarStyles } from './notes-app-types'
import { useWorkspaceSettings } from './useWorkspaceSettings'
import { WorkspaceSettingsView } from './WorkspaceSettingsView'

export type WorkspaceSettingsPanelProps = {
  folder: WorkspaceFolder
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
  onRename: (name: string) => void
}

export function WorkspaceSettingsPanel({
  folder,
  macElectron,
  macTitlebarStyles,
  onRename,
}: WorkspaceSettingsPanelProps): JSX.Element {
  const model = useWorkspaceSettings({
    folder,
    onRename,
  })
  return (
    <WorkspaceSettingsView
      folder={folder}
      macElectron={macElectron}
      macTitlebarStyles={macTitlebarStyles}
      {...model}
    />
  )
}

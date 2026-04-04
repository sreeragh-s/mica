import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { WorkspaceFolder } from '@/lib/notes-storage'
import type { MacTitlebarStyles } from './notes-app-types'
import type { WorkspaceSettingsModel } from './useWorkspaceSettings'

export type WorkspaceSettingsViewProps = {
  folder: WorkspaceFolder
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
} & WorkspaceSettingsModel

export function WorkspaceSettingsView({
  folder,
  macElectron,
  macTitlebarStyles,
  nameDraft,
  setNameDraft,
  handleSaveName,
}: WorkspaceSettingsViewProps): JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">
          Workspace settings
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Rename this workspace. GitHub and Git live under Settings → GitHub & Git.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-foreground text-sm font-medium">Name</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`ws-name-${folder.id}`}>Workspace name</Label>
            <Input
              id={`ws-name-${folder.id}`}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSaveName()
                }
              }}
            />
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={handleSaveName}
            disabled={!nameDraft.trim() || nameDraft.trim() === folder.name}
          >
            Save name
          </Button>
        </div>
      </section>
    </div>
  )
}

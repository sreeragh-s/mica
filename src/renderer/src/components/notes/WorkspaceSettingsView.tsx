import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
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
  canDelete,
  deleteOpen,
  setDeleteOpen,
  deleteConfirmDraft,
  setDeleteConfirmDraft,
  deleteConfirmMatches,
  deleteBusy,
  handleConfirmDelete
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

      {canDelete ? (
        <section className="border-destructive/30 flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-destructive text-sm font-medium">Delete workspace</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Permanently remove this workspace and all of its notes from disk. This cannot be undone.
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete workspace…
            </Button>
          </div>
        </section>
      ) : null}

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && deleteBusy) return
          setDeleteOpen(open)
        }}
      >
        <DialogContent showCloseButton={!deleteBusy} className="gap-4">
          <DialogHeader>
            <DialogTitle>Delete this workspace?</DialogTitle>
            <DialogDescription>
              Type the workspace name <span className="text-foreground font-medium">{folder.name}</span> to
              confirm. The folder and all notes inside it will be removed from your data directory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`ws-delete-confirm-${folder.id}`}>Workspace name</Label>
            <Input
              id={`ws-delete-confirm-${folder.id}`}
              value={deleteConfirmDraft}
              onChange={(e) => setDeleteConfirmDraft(e.target.value)}
              placeholder={folder.name}
              autoComplete="off"
              disabled={deleteBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deleteConfirmMatches && !deleteBusy) {
                  e.preventDefault()
                  void handleConfirmDelete()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteConfirmMatches || deleteBusy}
              onClick={() => void handleConfirmDelete()}
            >
              {deleteBusy ? 'Deleting…' : 'Delete workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

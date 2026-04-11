import type { JSX } from 'react'

import { ExternalLink, FolderOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getApi } from '@/bridges/auth/auth-bridge'

export type OpenWorkspaceDialogProps = {
  /** The workspace path the user clicked. */
  workspacePath: string
  /** Display name for the workspace. */
  workspaceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open in the current window (replaces workspace). */
  onOpen: (path: string) => void
}

export function OpenWorkspaceDialog({
  workspacePath,
  workspaceName,
  open,
  onOpenChange,
  onOpen
}: OpenWorkspaceDialogProps): JSX.Element {
  const handleOpen = (): void => {
    onOpenChange(false)
    onOpen(workspacePath)
  }

  const handleOpenInNewWindow = (): void => {
    onOpenChange(false)
    const api = getApi()
    void api?.multiWindow?.openWorkspaceInNewWindow(workspacePath)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">Open "{workspaceName}"</DialogTitle>
          <DialogDescription>How do you want to open this workspace?</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          <Button variant="default" className="w-full justify-start gap-2" onClick={handleOpen}>
            <FolderOpen className="size-4 shrink-0" aria-hidden />
            Open
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleOpenInNewWindow}
          >
            <ExternalLink className="size-4 shrink-0" aria-hidden />
            Open in New Window
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

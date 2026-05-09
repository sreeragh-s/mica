import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { applyUpdate, useUpdaterStore } from "@/lib/updater"

export function UpdateNotificationDialog() {
  const status = useUpdaterStore((s) => s.status)
  const [dismissedVersion, setDismissedVersion] = React.useState<string | null>(null)

  const open =
    status.phase === "available" && status.version !== dismissedVersion

  const version = status.phase === "available" ? status.version : ""

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && status.phase === "available") {
          setDismissedVersion(status.version)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            NoteLab v{version} is ready to install. The app will restart to apply
            the update.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => setDismissedVersion(version)}
          >
            Later
          </Button>
          <Button onClick={() => void applyUpdate()}>Install &amp; restart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

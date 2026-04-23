"use client"

import { useState } from "react"
import { FolderOpenIcon, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { openWorkspacePicker } from "@/lib/workspace"

export function SetupScreen() {
  const [isLoading, setIsLoading] = useState(false)

  const handleSelectFolder = async () => {
    setIsLoading(true)
    try {
      await openWorkspacePicker()
    } catch (error) {
      console.error("Failed to select folder:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <div className="flex size-16 items-center justify-center rounded-full bg-sidebar-accent">
        <FolderOpenIcon className="size-8 text-sidebar-accent-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-medium">No Workspace Open</h2>
        <p className="text-sm text-muted-foreground">
          Select a folder to use as your workspace
        </p>
      </div>
      <Button onClick={handleSelectFolder} disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Opening...
          </>
        ) : (
          <>
            <FolderOpenIcon className="mr-2 size-4" />
            Open Folder
          </>
        )}
      </Button>
    </div>
  )
}

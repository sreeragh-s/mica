import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ChevronDownIcon, FolderOpenIcon, SearchIcon } from "lucide-react"

import {
  getCurrentWorkspace,
  getRecentWorkspaces,
  getWorkspaceName,
  openWorkspacePicker,
  setCurrentWorkspace,
} from "@/lib/workspace"

export const WorkspaceSwitcher = React.memo(function WorkspaceSwitcher() {
  const [workspace, setWorkspace] = React.useState<string | null>(() => getCurrentWorkspace())
  const [recentWorkspaces, setRecentWorkspaces] = React.useState<string[]>(() => getRecentWorkspaces())
  const [isPickerLoading, setIsPickerLoading] = React.useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = React.useState(false)
  const [workspaceSearch, setWorkspaceSearch] = React.useState("")

  React.useEffect(() => {
    const handleWorkspaceChange = () => {
      setWorkspace(getCurrentWorkspace())
      setRecentWorkspaces(getRecentWorkspaces())
    }

    window.addEventListener("workspace-changed", handleWorkspaceChange)
    return () => window.removeEventListener("workspace-changed", handleWorkspaceChange)
  }, [])

  const filteredWorkspaces = recentWorkspaces.filter((path) =>
    getWorkspaceName(path).toLowerCase().includes(workspaceSearch.toLowerCase())
  )

  const handleOpenWorkspace = async () => {
    setIsPickerLoading(true)
    try {
      await openWorkspacePicker()
    } catch (error) {
      console.error("Failed to open workspace picker:", error)
    } finally {
      setIsPickerLoading(false)
    }
  }

  return (
    <DropdownMenu
      modal={false}
      open={workspaceMenuOpen}
      onOpenChange={(open) => {
        setWorkspaceMenuOpen(open)
        if (!open) {
          setWorkspaceSearch("")
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 w-full items-center justify-between rounded-md px-2 text-left text-xs hover:bg-sidebar-accent/50"
        >
          <span className="min-w-0 truncate font-medium text-sidebar-foreground">
            {workspace ? getWorkspaceName(workspace) : "Open workspace"}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-sidebar-foreground/60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-1">
        <div className="px-1 pt-1 pb-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={workspaceSearch}
              onChange={(event) => setWorkspaceSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search workspaces"
              className="h-8 border-0 bg-sidebar-accent/40 pr-2 pl-7 text-xs shadow-none focus-visible:ring-1"
            />
          </div>
        </div>
        {filteredWorkspaces.length > 0 ? (
          filteredWorkspaces.map((path) => {
            const isActive = path === workspace

            return (
              <DropdownMenuItem
                key={path}
                className={[
                  "px-2 py-1.5 text-xs",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "",
                ].join(" ")}
                onSelect={(event) => {
                  event.preventDefault()
                  setCurrentWorkspace(path)
                  setWorkspaceMenuOpen(false)
                }}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {getWorkspaceName(path)}
                </span>
              </DropdownMenuItem>
            )
          })
        ) : (
          <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">
            {recentWorkspaces.length > 0 ? "No matching workspaces" : "No recent workspaces yet"}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="px-2 py-1.5 text-xs"
          onSelect={(event) => {
            event.preventDefault()
            void handleOpenWorkspace().finally(() => {
              setWorkspaceMenuOpen(false)
            })
          }}
          disabled={isPickerLoading}
        >
          <FolderOpenIcon className="size-3.5" />
          {isPickerLoading ? "Opening..." : "Open new workspace"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

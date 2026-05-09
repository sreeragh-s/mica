import * as React from "react"

import { SidebarView, useSidebarViewStore } from "@/components/sidebar-view"
import { Button } from "@/components/ui/button"
import {
  FolderTreeIcon,
  GitBranchIcon,
  Loader2,
  Settings2Icon,
} from "lucide-react"

type RailAction = {
  key: SidebarView
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const railActions: RailAction[] = [
  {
    label: "Explorer",
    icon: FolderTreeIcon,
    key: "explorer",
  },
  {
    label: "Source control",
    icon: GitBranchIcon,
    key: "source-control",
  },
  {
    label: "Settings",
    icon: Settings2Icon,
    key: "settings",
  },
]

type SidebarLeftRailProps = {
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
}

export const SidebarLeftRail = React.memo(function SidebarLeftRail({
  activeView,
  onViewChange,
}: SidebarLeftRailProps) {
  const viewStatuses = useSidebarViewStore((state) => state.views)

  const handleEmptyClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) return
    window.dispatchEvent(
      new CustomEvent("active-file-changed", { detail: { path: null } })
    )
  }, [])

  return (
    <div
      className="flex w-11 shrink-0 flex-col items-center border-r border-sidebar-border/60 bg-sidebar/95 px-1 py-2"
      onClick={handleEmptyClick}
    >
      <div className="titlebar-spacer w-full shrink-0" />
      <div className="mt-1 flex flex-1 flex-col items-center gap-1">
        {railActions.map((action) => {
          const Icon = action.icon
          const isActive = activeView === action.key
          const isLoading = viewStatuses[action.key].isLoading

          return (
            <Button
              key={action.label}
              type="button"
              variant="ghost"
              size="icon-sm"
              className={[
                "size-8 rounded-md text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                isActive ? "bg-sidebar-accent/70 text-sidebar-foreground" : "",
              ].join(" ")}
              onClick={() => onViewChange(action.key)}
              aria-label={action.label}
              title={action.label}
            >
              <span className="relative flex items-center justify-center">
                <Icon className="size-4" />
                {isLoading ? (
                  <Loader2 className="absolute -right-2 -top-1 size-3 animate-spin rounded-full bg-sidebar text-sidebar-foreground" />
                ) : null}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
})

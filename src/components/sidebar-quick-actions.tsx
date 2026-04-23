import * as React from "react"

import { Button } from "@/components/ui/button"
import { requestOpenWikiLinkGraph } from "@/lib/wikilink-utils"
import {
  FolderPlusIcon,
  SquarePenIcon,
  FilePlusIcon,
  SquareCode,
  Share2Icon,
} from "lucide-react"

type QuickAction = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}

const dispatch = (eventName: string) => () => {
  window.dispatchEvent(new CustomEvent(eventName))
}

const quickActions: QuickAction[] = [
  { label: "New folder", icon: FolderPlusIcon, onClick: dispatch("workspace-new-folder") },
  { label: "New note", icon: FilePlusIcon, onClick: dispatch("workspace-new-note") },
  { label: "New Excalidraw", icon: SquarePenIcon, onClick: dispatch("workspace-new-excalidraw") },
  { label: "New Code Drawing", icon: SquareCode, onClick: dispatch("workspace-new-codedrawing") },
  { label: "Open Graph", icon: Share2Icon, onClick: requestOpenWikiLinkGraph },
]

export const SidebarQuickActions = React.memo(function SidebarQuickActions() {
  return (
    <div className="px-2 py-2">
      <div className="grid grid-cols-5 gap-1">
        {quickActions.map(({ label, icon: Icon, onClick }) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            onClick={onClick}
            aria-label={label}
            title={label}
          >
            <Icon className="size-4" />
          </Button>
        ))}
      </div>
    </div>
  )
})

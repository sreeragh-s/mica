import * as React from "react"
import {
  KeyboardIcon,
  MoonStarIcon,
  Settings2Icon,
  UserRoundIcon,
  BotIcon,
  Link2Icon,
} from "lucide-react"
import type { SettingsPanelId } from "@/lib/settings-panel"
import { cn } from "@/lib/utils"

type SettingsSection = {
  id: SettingsPanelId
  icon: React.ComponentType<{ className?: string }>
  title: string
}

const settingsSections: SettingsSection[] = [
  { id: "account", title: "Account", icon: UserRoundIcon },
  { id: "workspace", title: "Workspace", icon: Settings2Icon },
  { id: "wiki", title: "Wiki", icon: Link2Icon },
  { id: "shortcuts", title: "Shortcuts", icon: KeyboardIcon },
  { id: "theme", title: "Appearance", icon: MoonStarIcon },
  { id: "models", title: "Models", icon: BotIcon },
]

export type SettingsSidebarProps = {
  activePanel: SettingsPanelId
  onPanelChange: (panel: SettingsPanelId) => void
}

export const SettingsSidebar = React.memo(function SettingsSidebar({
  activePanel,
  onPanelChange,
}: SettingsSidebarProps) {
  return (
    <div className="flex h-full flex-col px-2 py-3">
      <div className="px-2 pb-3">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Settings</h2>
      </div>
      <div className="space-y-1">
        {settingsSections.map((section) => {
          const Icon = section.icon
          const isActive = activePanel === section.id

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onPanelChange(section.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/65",
                )}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-xs",
                    isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground",
                  )}
                >
                  {section.title}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
})

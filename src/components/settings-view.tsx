import * as React from "react"
import type { SettingsPanelId } from "@/lib/settings-panel"
import { AccountSettingsPanel } from "@/components/settings/account-settings-panel"
import { WorkspaceSettingsPanel } from "@/components/settings/workspace-settings-panel"
import { WikiSettingsPanel } from "@/components/settings/wiki-settings-panel"
import { ShortcutsSettingsPanel } from "@/components/settings/shortcuts-settings-panel"
import { ThemeSettingsPanel } from "@/components/settings/theme-settings-panel"
import { ModelsSettingsPanel } from "@/components/settings/models-settings-panel"
import { Button } from "@/components/ui/button"
import type { ShortcutAction, ShortcutConfig } from "@/lib/shortcuts"

const panelHeadings: Record<
  SettingsPanelId,
  { title: string; description: string }
> = {
  account: {
    title: "Account",
    description: "Sign in, identity, and session for sync and cloud features.",
  },
  workspace: {
    title: "Workspace",
    description: "Folders, recents, and how the editor treats your projects.",
  },
  wiki: {
    title: "Wiki",
    description: "Backlinks, wikilink indexing, freshness checks, and manual rebuilds.",
  },
  shortcuts: {
    title: "Shortcuts",
    description: "Keyboard shortcuts and command bindings.",
  },
  theme: {
    title: "Appearance",
    description: "Theme, accent, and interface density.",
  },
  models: {
    title: "Models",
    description: "Configure AI models and provider settings.",
  },
}

export type SettingsViewProps = {
  panel: SettingsPanelId
  shortcuts: ShortcutConfig
  onShortcutChange: (action: ShortcutAction, binding: string) => void
  onResetShortcuts: () => void
}

export const SettingsView = React.memo(function SettingsView({
  panel,
  shortcuts,
  onShortcutChange,
  onResetShortcuts,
}: SettingsViewProps) {
  const { title, description } = panelHeadings[panel]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background px-8 py-7">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          {panel === "shortcuts" && (
            <Button type="button" variant="outline" size="sm" onClick={onResetShortcuts}>
              Reset Defaults
            </Button>
          )}
        </div>
        {panel === "account" && <AccountSettingsPanel />}
        {panel === "workspace" && <WorkspaceSettingsPanel />}
        {panel === "wiki" && <WikiSettingsPanel />}
        {panel === "shortcuts" && (
          <ShortcutsSettingsPanel
            shortcuts={shortcuts}
            onShortcutChange={onShortcutChange}
          />
        )}
        {panel === "theme" && <ThemeSettingsPanel />}
        {panel === "models" && <ModelsSettingsPanel />}
      </div>
    </div>
  )
})

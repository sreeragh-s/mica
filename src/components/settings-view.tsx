import * as React from "react"
import type { SettingsPanelId } from "@/lib/settings-panel"
import { WorkspaceSettingsPanel } from "@/components/settings/workspace-settings-panel"
import { WikiSettingsPanel } from "@/components/settings/wiki-settings-panel"
import { ShortcutsSettingsPanel } from "@/components/settings/shortcuts-settings-panel"
import { ThemeSettingsPanel } from "@/components/settings/theme-settings-panel"
import { ModelsSettingsPanel } from "@/components/settings/models-settings-panel"
import { Button } from "@/components/ui/button"
import type { ShortcutAction, ShortcutConfig } from "@/lib/shortcuts"

const AccountSettingsPanel = React.lazy(() =>
  import("@/components/settings/account-settings-panel").then((module) => ({
    default: module.AccountSettingsPanel,
  })),
)

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

function SettingsPanelFallback() {
  return (
    <section className="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="mt-4 space-y-3">
        <div className="h-14 rounded-md bg-muted/50" />
        <div className="h-9 rounded-md bg-muted/40" />
      </div>
    </section>
  )
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
        {panel === "account" && (
          <React.Suspense fallback={<SettingsPanelFallback />}>
            <AccountSettingsPanel />
          </React.Suspense>
        )}
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

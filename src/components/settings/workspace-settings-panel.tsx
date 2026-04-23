import * as React from "react"

import { Switch } from "@/components/ui/switch"
import {
  BROWSER_SETTINGS_EVENT,
  loadOpenLinksInApp,
  saveOpenLinksInApp,
} from "@/lib/browser-settings"

export const WorkspaceSettingsPanel = React.memo(function WorkspaceSettingsPanel() {
  const [openLinksInApp, setOpenLinksInApp] = React.useState<boolean>(() =>
    loadOpenLinksInApp(),
  )

  React.useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ openLinksInApp?: boolean }>).detail
      if (typeof detail?.openLinksInApp === "boolean") {
        setOpenLinksInApp(detail.openLinksInApp)
      }
    }

    window.addEventListener(BROWSER_SETTINGS_EVENT, handleChange)
    return () => window.removeEventListener(BROWSER_SETTINGS_EVENT, handleChange)
  }, [])

  const handleToggle = React.useCallback((next: boolean) => {
    setOpenLinksInApp(next)
    saveOpenLinksInApp(next)
  }, [])

  return (
    <section className="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/85">
        Browser
      </h2>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Control how external links from the editor are opened.
      </p>
      <div className="mt-3">
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md bg-muted/50 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-foreground">
              Open links in in-app browser
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Links clicked in notes open in a new tab with an embedded browser.
              When off, links open in your system browser.
            </span>
          </span>
          <Switch
            checked={openLinksInApp}
            onCheckedChange={handleToggle}
            aria-label="Open links in in-app browser"
          />
        </label>
      </div>
    </section>
  )
})

import * as React from "react"

import { getCurrentWindow } from "@tauri-apps/api/window"
import { Button } from "./ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { SidebarLeftIcon } from "@hugeicons/core-free-icons"
import { LinkIcon, MessageSquareIcon } from "lucide-react"
import type { RightSidebarView } from "./app-sidebar-right"
import type { WikiLinkIndexingState } from "@/lib/wikilink-utils"
import { applyUpdate, useUpdaterStore } from "@/lib/updater"

type AppTopbarProps = {
  isFullscreen: boolean
  selectedFileName: string | null
  wikiLinkIndexingState: WikiLinkIndexingState
  rightSidebarOpen: boolean
  rightSidebarView: RightSidebarView
  onChatSidebarToggle: () => void
  onWikiLinksSidebarToggle: () => void
  leftSidebarOpen: boolean
  onLeftSidebarToggle: () => void
  leftSidebarShortcutLabel: string
  rightSidebarShortcutLabel: string
}

export const AppTopbar = React.memo(function AppTopbar({
  isFullscreen,
  selectedFileName,
  wikiLinkIndexingState,
  rightSidebarOpen,
  rightSidebarView,
  onChatSidebarToggle,
  onWikiLinksSidebarToggle,
  leftSidebarOpen,
  onLeftSidebarToggle,
  leftSidebarShortcutLabel,
  rightSidebarShortcutLabel,
}: AppTopbarProps) {
  const [showCompletedState, setShowCompletedState] = React.useState(false)

  React.useEffect(() => {
    if (wikiLinkIndexingState.phase === "complete" && wikiLinkIndexingState.workspace) {
      setShowCompletedState(true)

      const timeoutId = window.setTimeout(() => {
        setShowCompletedState(false)
      }, 1800)

      return () => window.clearTimeout(timeoutId)
    }

    if (wikiLinkIndexingState.phase !== "idle") {
      setShowCompletedState(false)
    }
  }, [wikiLinkIndexingState.phase, wikiLinkIndexingState.workspace])

  const showIndexingStatus =
    Boolean(wikiLinkIndexingState.workspace) &&
    (wikiLinkIndexingState.phase === "scanning" ||
      wikiLinkIndexingState.phase === "saving" ||
      wikiLinkIndexingState.phase === "error" ||
      showCompletedState)
  const indexingProgress =
    wikiLinkIndexingState.totalFiles > 0
      ? Math.min(
          100,
          Math.round(
            (wikiLinkIndexingState.processedFiles / wikiLinkIndexingState.totalFiles) * 100
          )
        )
      : 0
  const indexingLabel =
    wikiLinkIndexingState.phase === "complete"
      ? "Index complete"
      : wikiLinkIndexingState.phase === "saving"
        ? "Saving wiki-link index"
        : wikiLinkIndexingState.phase === "error"
          ? wikiLinkIndexingState.error ?? "Indexing failed"
          : wikiLinkIndexingState.currentFile
            ? `Indexing ${wikiLinkIndexingState.currentFile}`
            : "Scanning workspace"

  return (
    <div
      className="titlebar-strip border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      style={{ paddingLeft: isFullscreen ? "0px" : "env(titlebar-area-x, 80px)" }}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement
        if (e.button === 0 && !target.closest("button, a, input, [role='button']")) {
          getCurrentWindow().startDragging()
        }
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement
        if (!target.closest("button, a, input, [role='button']")) {
          const win = getCurrentWindow()
          win.isMaximized().then((maximized) => (maximized ? win.unmaximize() : win.maximize()))
        }
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={[
          "rounded-md hover:bg-sidebar-accent/50",
          leftSidebarOpen ? "bg-sidebar-accent/70 text-sidebar-foreground" : "text-sidebar-foreground/65",
        ].join(" ")}
        onClick={onLeftSidebarToggle}
        aria-label="Toggle Sidebar"
        title={`Toggle Sidebar (${leftSidebarShortcutLabel})`}
      >
        <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} className="size-3" />
      </Button>
      <div className="ml-2 flex min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1 truncate select-none text-xs text-muted-foreground">
          {selectedFileName ?? "No file selected"}
        </span>
        {showIndexingStatus ? (
          <div className="flex w-full max-w-64 shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
            <div className="h-1.5 min-w-14 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={[
                  "h-full rounded-full transition-all",
                  wikiLinkIndexingState.phase === "error" ? "bg-destructive" : "bg-foreground/80",
                ].join(" ")}
                style={{
                  width: `${wikiLinkIndexingState.phase === "complete" || showCompletedState ? 100 : indexingProgress}%`,
                }}
              />
            </div>
            <span className="truncate text-[11px] text-muted-foreground" title={indexingLabel}>
              {indexingLabel}
            </span>
          </div>
        ) : null}
        <UpdateStatusChip />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={[
          "rounded-md hover:bg-sidebar-accent/50",
          rightSidebarOpen && rightSidebarView === "wiki-links"
            ? "bg-sidebar-accent/70 text-sidebar-foreground"
            : "text-sidebar-foreground/65",
        ].join(" ")}
        onClick={onWikiLinksSidebarToggle}
        aria-label="Toggle Wiki Links Sidebar"
        title="Wiki Links"
      >
        <LinkIcon className="size-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={[
          "mr-2 rounded-md hover:bg-sidebar-accent/50",
          rightSidebarOpen && rightSidebarView === "chat"
            ? "bg-sidebar-accent/70 text-sidebar-foreground"
            : "text-sidebar-foreground/65",
        ].join(" ")}
        onClick={onChatSidebarToggle}
        aria-label="Toggle Chat Sidebar"
        title={`Chat (${rightSidebarShortcutLabel})`}
      >
        <MessageSquareIcon className="size-3" />
      </Button>
    </div>
  )
})

function UpdateStatusChip() {
  const status = useUpdaterStore((s) => s.status)

  if (status.phase === "idle" || status.phase === "checking" || status.phase === "error") {
    return null
  }

  if (status.phase === "available") {
    return (
      <button
        type="button"
        onClick={() => void applyUpdate()}
        className="shrink-0 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-sidebar-accent/50"
        title={`Click to install v${status.version}`}
      >
        Update available
      </button>
    )
  }

  if (status.phase === "downloading") {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
        <span>Downloading update… {status.percent}%</span>
      </div>
    )
  }

  return (
    <div className="shrink-0 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
      Restarting to update…
    </div>
  )
}

import * as React from "react"

import { FileTree } from "@/components/FileTree"
import { SettingsSidebar } from "@/components/settings-sidebar"
import { SourceControlSidebar } from "@/components/source-control-sidebar"
import { SetupScreen } from "@/components/SetupScreen"
import { SidebarLeftRail } from "@/components/sidebar-left-rail"
import { SidebarView } from "@/components/sidebar-view"
import type { SettingsPanelId } from "@/lib/settings-panel"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export const AppSidebar = React.memo(function AppSidebar({
  activeView,
  onViewChange,
  settingsPanel,
  onSettingsPanelChange,
  onSourceControlDiff,
  onSourceControlDiffLoaded,
  diffState,
  onCloseDiff,
  sidebarOpen,
  onSidebarOpenChange,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
  settingsPanel: SettingsPanelId
  onSettingsPanelChange: (panel: SettingsPanelId) => void
  onSourceControlDiff?: (path: string, staged: boolean) => void
  onSourceControlDiffLoaded?: (path: string, diff: string) => void
  diffState?: { selectedPath: string | null; diffContent: string | null; diffLoading: boolean }
  onCloseDiff?: () => void
  sidebarOpen?: boolean
  onSidebarOpenChange?: (open: boolean) => void
}) {
  const [workspace, setWorkspace] = React.useState<string | null>(() => localStorage.getItem("workspace"))

  React.useEffect(() => {
    const handleWorkspaceChange = () => {
      setWorkspace(localStorage.getItem("workspace"))
    }

    window.addEventListener("workspace-changed", handleWorkspaceChange)
    return () => window.removeEventListener("workspace-changed", handleWorkspaceChange)
  }, [])

  const explorerContent = React.useMemo(() => {
    if (!workspace) return <SetupScreen />
    return <FileTree />
  }, [workspace])

  const isWorkspaceView = activeView === "explorer"

  return (
    <Sidebar className="bg-sidebar" sidebarOpen={sidebarOpen} onSidebarOpenChange={onSidebarOpenChange} {...props}>
      <div className="flex min-h-0 flex-1">
        <SidebarLeftRail activeView={activeView} onViewChange={onViewChange} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="titlebar-spacer w-full shrink-0" />
          <div className={isWorkspaceView ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <SidebarContent className="min-h-0 bg-sidebar flex-1">
              <TooltipProvider>
                <div className="bg-sidebar text-sidebar-foreground h-full">{explorerContent}</div>
              </TooltipProvider>
            </SidebarContent>
            <SidebarFooter>
              <WorkspaceSwitcher />
            </SidebarFooter>
          </div>
          <div className={activeView === "source-control" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <SidebarContent className="min-h-0 bg-sidebar flex-1">
              <TooltipProvider>
                <div className="bg-sidebar text-sidebar-foreground h-full">
                  <SourceControlSidebar
                    onViewDiff={onSourceControlDiff}
                    onDiffLoaded={onSourceControlDiffLoaded}
                  />
                </div>
              </TooltipProvider>
            </SidebarContent>
          </div>
          <div className={activeView === "settings" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <SidebarContent className="min-h-0 bg-sidebar flex-1">
              <TooltipProvider>
                <div className="bg-sidebar text-sidebar-foreground h-full">
                  <SettingsSidebar
                    activePanel={settingsPanel}
                    onPanelChange={onSettingsPanelChange}
                  />
                </div>
              </TooltipProvider>
            </SidebarContent>
          </div>
        </div>
      </div>
    </Sidebar>
  )
})

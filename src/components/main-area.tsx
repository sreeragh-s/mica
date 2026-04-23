import * as React from "react"

import { PlateEditor } from "@/components/editor/plate-editor"
import { EditorTabsPanel, type OpenFileTab } from "@/components/editor-tabs-panel"
import { ExcalidrawFileView } from "@/components/excalidraw-file-view"
import { SettingsView } from "@/components/settings-view"
import { SidebarView } from "@/components/sidebar-view"
import { WikiGraphView } from "@/components/wiki-graph-view"
import type { SettingsPanelId } from "@/lib/settings-panel"
import type { ShortcutAction, ShortcutConfig } from "@/lib/shortcuts"
import { WIKI_GRAPH_TAB_PATH, type WikiLinkIndexingState } from "@/lib/wikilink-utils"
import { isBrowserUrl, isExcalidrawFile, isCodeDrawingFile, isHtmlFile, isImageFile, isPdfFile, isVideoFile } from "@/lib/file-types"
import { FileTextIcon } from "lucide-react"
import { CodeDrawingFileView } from "@/components/code-drawing-file-view"
import { PdfFileView } from "@/components/pdf-file-view"
import { HtmlFileView } from "@/components/html-file-view"
import { ImageFileView } from "@/components/image-file-view"
import { VideoFileView } from "@/components/video-file-view"

type SelectedFile = {
  id: string
  path: string
  name: string
}

type MainAreaProps = {
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
  settingsPanel: SettingsPanelId
  shortcuts: ShortcutConfig
  onShortcutChange: (action: ShortcutAction, binding: string) => void
  onResetShortcuts: () => void
  zenMode: boolean
  onActivateFile: (file: SelectedFile) => void
  onCloseFile: (tabId: string) => void
  openFiles: OpenFileTab[]
  selectedFile: SelectedFile | null
  wikiLinkIndexingState: WikiLinkIndexingState
}

const EditorTabPane = React.memo(function EditorTabPane({
  file,
  isActive,
  zenMode,
  wikiLinkIndexingState,
}: {
  file: SelectedFile
  isActive: boolean
  zenMode: boolean
  wikiLinkIndexingState: WikiLinkIndexingState
}) {
  return (
    <div className={isActive ? "flex h-full min-h-0 flex-1" : "hidden"}>
      {file.path === WIKI_GRAPH_TAB_PATH ? (
        <WikiGraphView activeFilePath={null} indexingState={wikiLinkIndexingState} />
      ) : isExcalidrawFile(file.path) ? (
        <ExcalidrawFileView filePath={file.path} />
      ) : isCodeDrawingFile(file.path) ? (
        <CodeDrawingFileView filePath={file.path} />
      ) : isPdfFile(file.path) ? (
        <PdfFileView filePath={file.path} />
      ) : isHtmlFile(file.path) || isBrowserUrl(file.path) ? (
        <HtmlFileView filePath={file.path} />
      ) : isImageFile(file.path) ? (
        <ImageFileView filePath={file.path} />
      ) : isVideoFile(file.path) ? (
        <VideoFileView filePath={file.path} />
      ) : (
        <PlateEditor
          fileName={file.name}
          filePath={file.path}
          isActive={isActive}
          zenMode={zenMode}
        />
      )}
    </div>
  )
})

function ExplorerEmptyState() {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileTextIcon className="size-12 opacity-30" />
        <p className="text-sm">Select a note, Excalidraw, or Code Drawing file to get started</p>
      </div>
      <div className="bottom-bar bg-background/85 px-4 text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/70 flex items-center h-full">
        <span className="truncate">Choose a note or drawing to begin</span>
      </div>
    </>
  )
}

export const MainArea = React.memo(function MainArea({
  activeView,
  onViewChange,
  settingsPanel,
  shortcuts,
  onShortcutChange,
  onResetShortcuts,
  zenMode,
  onActivateFile,
  onCloseFile,
  openFiles,
  selectedFile,
  wikiLinkIndexingState,
}: MainAreaProps) {
  if (activeView === "settings") {
    return (
      <SettingsView
        panel={settingsPanel}
        shortcuts={shortcuts}
        onShortcutChange={onShortcutChange}
        onResetShortcuts={onResetShortcuts}
      />
    )
  }

  if (!selectedFile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ExplorerEmptyState />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!zenMode && (
        <EditorTabsPanel
          openFiles={openFiles}
          selectedTabId={selectedFile.id}
          onActivate={(file) => {
            onViewChange("explorer")
            onActivateFile(file)
          }}
          onClose={onCloseFile}
        />
      )}
      <div className="min-h-0 flex-1">
        {openFiles.map((file) => (
          <EditorTabPane
            key={file.id}
            file={file}
            isActive={selectedFile.id === file.id}
            zenMode={zenMode}
            wikiLinkIndexingState={wikiLinkIndexingState}
          />
        ))}
      </div>
    </div>
  )
})

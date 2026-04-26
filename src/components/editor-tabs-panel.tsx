import * as React from "react"

import { XIcon } from "lucide-react"
import {
  FileCodeIcon,
  FileTextIcon,
  FileImageIcon,
  VideoIcon,
  FileIcon,
} from "lucide-react"
import { getFileTypeIcon } from "@/lib/file-types"

export interface OpenFileTab {
  id: string
  path: string
  name: string
  closable?: boolean
  faviconUrl?: string | null
}

type EditorTabsPanelProps = {
  openFiles: OpenFileTab[]
  selectedTabId: string
  onActivate: (file: OpenFileTab) => void
  onClose: (tabId: string) => void
}

export const EditorTabsPanel = React.memo(function EditorTabsPanel({
  openFiles,
  selectedTabId,
  onActivate,
  onClose,
}: EditorTabsPanelProps) {
  return (
    <div className="editor-tabs bg-muted/40 text-muted-foreground">
      <div className="flex min-w-0 items-stretch overflow-x-auto scrollbar-hide">
        {openFiles.map((file) => {
          const isActive = selectedTabId === file.id

          return (
            <TabItem
              key={file.id}
              file={file}
              isActive={isActive}
              onActivate={onActivate}
              onClose={onClose}
            />
          )
        })}
      </div>
    </div>
  )
})

function TabItem({
  file,
  isActive,
  onActivate,
  onClose,
}: {
  file: OpenFileTab
  isActive: boolean
  onActivate: (file: OpenFileTab) => void
  onClose: (tabId: string) => void
}) {
  const [isClosing, setIsClosing] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    requestAnimationFrame(() => {
      setIsMounted(true)
    })
  }, [])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose(file.id)
    }, 150)
  }

  return (
    <div
      style={{
        maxWidth: isClosing || !isMounted ? "0px" : "240px",
        opacity: isClosing || !isMounted ? 0 : 1,
        overflow: "hidden",
      }}
      className="transition-all duration-200 ease-out"
    >
      <div
        onClick={() => onActivate(file)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onActivate(file)
          }
        }}
        role="button"
        tabIndex={0}
        className={[
          "group flex min-w-0 max-w-60 cursor-pointer items-center rounded-t-lg border border-border/50 px-3 py-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          isActive
            ? "border-border/60 border-b-transparent bg-background text-foreground"
            : "border-transparent bg-inherit text-inherit hover:bg-accent/60 hover:text-accent-foreground",
        ].join(" ")}
      >
        {(() => {
          const iconType = getFileTypeIcon(file.path)
          let IconComponent = FileIcon
          switch (iconType) {
            case "markdown":
              IconComponent = FileTextIcon
              break
            case "excalidraw":
            case "codedrawing":
            case "pdf":
            case "html":
            case "code":
              IconComponent = FileCodeIcon
              break
            case "image":
              IconComponent = FileImageIcon
              break
            case "video":
              IconComponent = VideoIcon
              break
          }
          return <IconComponent className="mr-1.5 size-3.5 shrink-0" />
        })()}
        <span
          className="min-w-0 flex-1 truncate text-left"
          title={file.name}
        >
          {file.name}
        </span>
        {file.closable !== false ? (
          <button
            type="button"
            className="ml-2 rounded p-0.5 text-muted-foreground/80 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 group-focus-within:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              handleClose()
            }}
            aria-label={`Close ${file.name}`}
          >
            <XIcon className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

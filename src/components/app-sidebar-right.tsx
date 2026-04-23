import * as React from "react"

import { Chat } from "@/components/ai/chat"
import { Button } from "@/components/ui/button"
import { SidebarContent } from "@/components/ui/sidebar"
import {
  getWorkspaceFileName,
  type WikiLinkListItem,
  useActiveFilePath,
  useWikiLinkSidebarData,
} from "@/lib/wikilink-utils"
import {
  AlertCircle,
  FileText,
  HistoryIcon,
  LinkIcon,
  LoaderCircle,
  PlusIcon,
} from "lucide-react"

export type RightSidebarView = "chat" | "wiki-links"

type AppSidebarRightProps = {
  open: boolean
  view: RightSidebarView
}

export const AppSidebarRight = React.memo(function AppSidebarRight({
  open,
  view,
}: AppSidebarRightProps) {
  if (!open) return null

  return (
    <div
      data-side="right"
      className="flex w-[26rem] shrink-0 flex-col border-l border-border/60 bg-background text-foreground"
    >
      <div className="titlebar-spacer w-full shrink-0" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SidebarContent className="min-h-0 flex-1 overflow-hidden bg-background">
          {view === "chat" ? <ChatWorkspacePanel /> : <WikiLinksPanel />}
        </SidebarContent>
      </div>
    </div>
  )
})

type ChatTab = {
  id: string
}

const ChatWorkspacePanel = React.memo(function ChatWorkspacePanel() {
  const nextChatNumberRef = React.useRef(2)
  const tabStripRef = React.useRef<HTMLDivElement | null>(null)
  const tabRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const [chatTabs, setChatTabs] = React.useState<ChatTab[]>([{ id: "chat-1" }])
  const [activeChatId, setActiveChatId] = React.useState("chat-1")
  const [chatHasConversation, setChatHasConversation] = React.useState<Record<string, boolean>>({})

  const scrollTabIntoView = React.useCallback((chatId: string) => {
    tabRefs.current[chatId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    })
  }, [])

  React.useEffect(() => {
    scrollTabIntoView(activeChatId)
  }, [activeChatId, scrollTabIntoView])

  const handleNewChat = React.useCallback(() => {
    if (!chatHasConversation[activeChatId]) {
      return
    }

    const nextChatNumber = nextChatNumberRef.current
    const nextChatId = `chat-${nextChatNumber}`
    const nextChat = { id: nextChatId }

    nextChatNumberRef.current += 1
    setChatTabs(currentTabs => [...currentTabs, nextChat])
    setActiveChatId(nextChatId)
  }, [activeChatId, chatHasConversation])

  const handleHistoryClick = React.useCallback(() => {
    tabStripRef.current?.scrollTo({
      left: 0,
      behavior: "smooth",
    })
  }, [])

  const handleCloseChat = React.useCallback((chatId: string) => {
    setChatTabs((currentTabs) => {
      if (currentTabs.length === 1) {
        return currentTabs
      }

      const nextTabs = currentTabs.filter((chatTab) => chatTab.id !== chatId)

      setActiveChatId((currentActiveChatId) => {
        if (currentActiveChatId !== chatId) {
          return currentActiveChatId
        }

        const closedTabIndex = currentTabs.findIndex((chatTab) => chatTab.id === chatId)
        const fallbackTab = nextTabs[closedTabIndex] ?? nextTabs[closedTabIndex - 1] ?? nextTabs[0]
        return fallbackTab?.id ?? currentActiveChatId
      })

      setChatHasConversation((currentState) => {
        const nextState = { ...currentState }
        delete nextState[chatId]
        return nextState
      })

      delete tabRefs.current[chatId]
      return nextTabs
    })
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatWorkspaceHeader
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6"
              onClick={handleNewChat}
              aria-label="New Chat"
              title="New Chat"
            >
              <PlusIcon className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6"
              onClick={handleHistoryClick}
              aria-label="Chat History"
              title="Chat History"
            >
              <HistoryIcon className="size-3" />
            </Button>
          </>
        }
        tabStrip={(
          <div
            ref={tabStripRef}
            className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-hide"
          >
            {chatTabs.map((chatTab) => (
              <ChatSessionTab
                key={chatTab.id}
                active={activeChatId === chatTab.id}
                closable={chatTabs.length > 1}
                label="New Chat"
                onClick={() => setActiveChatId(chatTab.id)}
                onClose={() => handleCloseChat(chatTab.id)}
                tabRef={(node) => {
                  tabRefs.current[chatTab.id] = node
                }}
              />
            ))}
          </div>
        )}
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {chatTabs.map((chatTab) => {
          const isActive = activeChatId === chatTab.id

          return (
            <div
              key={chatTab.id}
              aria-hidden={!isActive}
              className={isActive ? "flex h-full min-h-0 flex-col" : "hidden h-full min-h-0 flex-col"}
            >
              <Chat
                onConversationStateChange={(hasConversation) => {
                  setChatHasConversation((currentState) => {
                    if (currentState[chatTab.id] === hasConversation) {
                      return currentState
                    }

                    return {
                      ...currentState,
                      [chatTab.id]: hasConversation,
                    }
                  })
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
})

function ChatWorkspaceHeader({
  actions,
  tabStrip,
}: {
  actions?: React.ReactNode
  tabStrip: React.ReactNode
}) {
  return (
    <div className="editor-tabs shrink-0 bg-muted/40 text-muted-foreground">
      <div className="flex min-w-0 items-stretch">
        {tabStrip}
        <div className="flex shrink-0 items-center gap-1 px-2">
          {actions}
        </div>
      </div>
    </div>
  )
}

const WikiLinksPanel = React.memo(function WikiLinksPanel() {
  const activeFilePath = useActiveFilePath()
  const { backlinks, outgoingLinks, isIndexed, isLoading, meta } = useWikiLinkSidebarData(activeFilePath)
  const [activeTab, setActiveTab] = React.useState<"backlinks" | "outgoing-links">(
    "backlinks"
  )

  const isBacklinks = activeTab === "backlinks"
  const currentItems = isBacklinks ? backlinks : outgoingLinks
  const showPartialResults = isLoading && currentItems.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="editor-tabs bg-muted/40 text-muted-foreground">
        <div className="flex min-w-0 items-stretch overflow-x-auto scrollbar-hide">
          <WikiLinksTab
            active={isBacklinks}
            label={`Backlinks${backlinks.length ? ` (${backlinks.length})` : ""}`}
            onClick={() => setActiveTab("backlinks")}
          />
          <WikiLinksTab
            active={!isBacklinks}
            label={`Outgoing Links${outgoingLinks.length ? ` (${outgoingLinks.length})` : ""}`}
            onClick={() => setActiveTab("outgoing-links")}
          />
        </div>
      </div>

      <div className="border-b border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        {activeFilePath ? (
          <div className="space-y-0.5">
            <p className="truncate font-medium text-foreground">{getWorkspaceFileName(activeFilePath)}</p>
            <p>
              {isIndexed && meta
                ? meta.status === "indexing"
                  ? `Indexing… ${meta.processedFiles}/${meta.totalFiles}`
                  : `Indexed ${meta.totalFiles} files`
                : isLoading
                  ? "Loading index…"
                  : "No wiki-link index yet"}
            </p>
          </div>
        ) : (
          "Open a note to inspect backlinks and outgoing links."
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!activeFilePath ? (
          <WikiLinksEmptyState
            icon={<FileText className="size-4" />}
            title="No active note"
            description="Select a note from the workspace to inspect its graph."
          />
        ) : isLoading && !showPartialResults ? (
          <WikiLinksEmptyState
            icon={<LoaderCircle className="size-4 animate-spin" />}
            title="Loading links"
            description="Reading the workspace index for this note."
          />
        ) : !isIndexed ? (
          <WikiLinksEmptyState
            icon={<LinkIcon className="size-4" />}
            title="Index not ready"
            description="Open the workspace to build the wiki-link index first."
          />
        ) : currentItems.length === 0 ? (
          <WikiLinksEmptyState
            icon={isBacklinks ? <LinkIcon className="size-4" /> : <AlertCircle className="size-4" />}
            title={isBacklinks ? "No backlinks yet" : "No outgoing links yet"}
            description={
              isBacklinks
                ? "No indexed notes currently point at this note."
                : "This note does not point at any indexed notes yet."
            }
          />
        ) : (
          <div className="flex flex-col p-2">
            {showPartialResults ? (
              <div className="px-3 py-1 text-[11px] text-muted-foreground">
                Partial results while indexing continues…
              </div>
            ) : null}
            {currentItems.map((item) => (
              <WikiLinkListRow
                key={`${item.path ?? item.title}-${item.relativePath ?? "dangling"}-${item.taggedText ?? "none"}`}
                item={item}
                mode={isBacklinks ? "backlinks" : "outgoing-links"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

function WikiLinksEmptyState({
  description,
  icon,
  title,
}: {
  description: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 p-2 text-sidebar-foreground/80">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function WikiLinkListRow({
  item,
  mode,
}: {
  item: WikiLinkListItem
  mode: "backlinks" | "outgoing-links"
}) {
  const handleOpen = React.useCallback(() => {
    if (!item.path) {
      return
    }

    window.dispatchEvent(
      new CustomEvent("file-selected", {
        detail: {
          name: getWorkspaceFileName(item.path),
          path: item.path,
        },
      })
    )
  }, [item.path])

  const handleTaggedTextClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      if (!item.taggedText) {
        return
      }

      window.dispatchEvent(
        new CustomEvent("wiki-link-focus-request", {
          detail: {
            text: item.taggedText,
          },
        })
      )
    },
    [item.taggedText]
  )

  return (
    <div
      role={item.path ? "button" : undefined}
      tabIndex={item.path ? 0 : -1}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (!item.path) {
          return
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          handleOpen()
        }
      }}
      className={[
        "flex w-full flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left transition-colors",
        item.path
          ? "cursor-pointer hover:border-border/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          : "cursor-default opacity-85",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
        {mode === "backlinks" ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {item.count}
          </span>
        ) : null}
        {item.isDangling && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            Dangling
          </span>
        )}
      </div>
      {mode === "outgoing-links" && item.taggedText ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTaggedTextClick}
            className="max-w-full truncate rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent"
          >
            {item.taggedText}
          </button>
        </div>
      ) : null}
      {item.relativePath && (
        <p className="truncate text-[11px] text-muted-foreground">{item.relativePath}</p>
      )}
      {item.previewSnippet && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{item.previewSnippet}</p>
      )}
    </div>
  )
}

function WikiLinksTab({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 items-center justify-center rounded-t-lg border px-3 py-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        active
          ? "border-border/60 border-b-transparent bg-background text-foreground"
          : "border-transparent bg-inherit text-inherit hover:bg-accent/60 hover:text-accent-foreground",
      ].join(" ")}
    >
      <span className="truncate text-center">{label}</span>
    </button>
  )
}

function ChatSessionTab({
  active,
  closable,
  label,
  onClick,
  onClose,
  tabRef,
}: {
  active: boolean
  closable: boolean
  label: string
  onClick: () => void
  onClose: () => void
  tabRef?: (node: HTMLDivElement | null) => void
}) {
  return (
    <div
      ref={tabRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick()
        }
      }}
      className={[
        "group flex min-w-0 max-w-40 items-center rounded-t-lg border border-border/50 px-3 py-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        active
          ? "border-border/60 border-b-transparent bg-background text-foreground"
          : "border-transparent bg-inherit text-inherit hover:bg-accent/60 hover:text-accent-foreground",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {closable ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className="ml-2 rounded p-0.5 text-muted-foreground/80 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label={`Close ${label}`}
        >
          <span className="text-[10px]">×</span>
        </button>
      ) : null}
    </div>
  )
}

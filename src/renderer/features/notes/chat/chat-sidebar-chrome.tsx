import { PlusIcon, Search } from 'lucide-react'
import { type JSX, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Folder } from '@/lib/notes/notes-storage'
import { macTitlebarStyles } from '@/features/notes/notes-app-utils'
import { toolbarChromeFieldClass } from '@/lib/platform/toolbar-chrome'

/** macOS: row uses `pointer-events-none` so the window drag band receives hits; interactive chrome opts back in. */
export function ChatSidebarMacHitLayer({
  isMacNotelab,
  className,
  children
}: {
  isMacNotelab?: boolean
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div
      className={cn(className, isMacNotelab && 'pointer-events-auto')}
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      {children}
    </div>
  )
}

/** Full-height title strip (h-12): workspace / history search → icon tabs → actions. */
export function ChatSidebarTopBar({
  isMacNotelab,
  leading,
  tabs,
  trailing,
  tabsFill
}: {
  isMacNotelab?: boolean
  /** Workspace filter or history search; omit when empty (e.g. links panel). */
  leading?: ReactNode
  tabs: ReactNode
  trailing?: ReactNode | null
  /** When true, tab strip grows to full row width (links Linked / Linking). */
  tabsFill?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'border-border relative z-10 flex h-12 min-h-12 w-full shrink-0 items-center gap-2 border-b px-2',
        isMacNotelab && 'pointer-events-none'
      )}
    >
      {leading != null ? (
        <div className="min-w-0 flex-1">
          <ChatSidebarMacHitLayer isMacNotelab={isMacNotelab} className="min-w-0 w-full">
            {leading}
          </ChatSidebarMacHitLayer>
        </div>
      ) : null}
      <ChatSidebarMacHitLayer
        isMacNotelab={isMacNotelab}
        className={tabsFill ? 'min-w-0 flex-1' : 'shrink-0'}
      >
        {tabs}
      </ChatSidebarMacHitLayer>
      {trailing != null ? (
        <ChatSidebarMacHitLayer isMacNotelab={isMacNotelab} className="shrink-0">
          {trailing}
        </ChatSidebarMacHitLayer>
      ) : null}
    </div>
  )
}

export function ChatSidebarNewChatButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="text-muted-foreground size-7 shrink-0 rounded-md"
            onClick={onClick}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-3.5" aria-hidden />
            <span className="sr-only">New chat</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>New chat</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Workspace filter or history search only (no tab strip / new chat). */
export function ChatSidebarToolbarLeading({
  folders,
  filterWorkspaceId,
  setFilterWorkspaceId,
  showHistory,
  historySearch,
  setHistorySearch
}: {
  folders: Folder[]
  filterWorkspaceId: string | null
  setFilterWorkspaceId: (id: string | null) => void
  showHistory: boolean
  historySearch: string
  setHistorySearch: (v: string) => void
}): JSX.Element | null {
  if (showHistory) {
    return (
      <div className={cn(toolbarChromeFieldClass, 'min-w-0 max-w-full')}>
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 opacity-70"
        />
        <Input
          aria-label="Search chat history"
          className="h-7 w-full min-w-0 flex-1 border-0 bg-transparent pl-8 pr-2 text-xs shadow-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0"
          onChange={(e) => setHistorySearch(e.target.value)}
          placeholder="Search history…"
          type="search"
          value={historySearch}
        />
      </div>
    )
  }
  if (folders.length > 0) {
    return (
      <div className={cn(toolbarChromeFieldClass, 'min-w-0 max-w-full')}>
        <Select
          onValueChange={(v) => setFilterWorkspaceId(v === '__all__' ? null : v)}
          value={filterWorkspaceId ?? '__all__'}
        >
          <SelectTrigger
            className={cn(
              'h-7 min-h-0 w-full min-w-0 flex-1 border-0 bg-transparent px-2 py-0 text-[11px] shadow-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0',
              '[&_svg]:size-3 [&_svg]:opacity-70'
            )}
            size="sm"
          >
            <SelectValue placeholder="All folders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem className="text-xs" value="__all__">
              All Folders
            </SelectItem>
            {folders.map((f) => (
              <SelectItem className="text-xs" key={f.folder} value={f.folder}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  return null
}

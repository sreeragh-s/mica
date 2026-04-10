import type { JSX } from 'react'

import { LayoutGrid, Link2, MessageCircle, PanelLeft, PanelLeftClose, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toolbarShellClass } from '@/lib/platform/toolbar-chrome'

import type { MacTitlebarStyles } from '@/components/notes/notes-app-types'

export type SidebarEdgeToolbarPillProps = {
  macTitlebarStyles: MacTitlebarStyles
  /** `true` when the sidebar column is open; `false` when collapsed (show “expand” icon). */
  expanded: boolean
  onClick: () => void
  /** Set on the shell so sidebar pointer-capture logic treats this as interactive. */
  markSidebarInteractive?: boolean
}

/** Single control matching {@link NotesToolbarPill} shell + icon sizing (collapse / expand). */
export function SidebarEdgeToolbarPill({
  macTitlebarStyles,
  expanded,
  onClick,
  markSidebarInteractive
}: SidebarEdgeToolbarPillProps): JSX.Element {
  return (
    <div
      className={toolbarShellClass}
      style={macTitlebarStyles.noDrag}
      data-sidebar-interactive={markSidebarInteractive ? '' : undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-7 shrink-0 rounded-md"
        aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={expanded}
        onClick={onClick}
      >
        {expanded ? (
          <PanelLeftClose className="size-3.5" aria-hidden />
        ) : (
          <PanelLeft className="size-3.5" aria-hidden />
        )}
      </Button>
    </div>
  )
}

export type NotesToolbarPillProps = {
  macTitlebarStyles: MacTitlebarStyles
  onOpenTabOverview: () => void
  onNewNote: () => void
  chatSidebarOpen: boolean
  onToggleChatSidebar: () => void
  linkSidebarActive: boolean
  onOpenLinkedSidebar: () => void
}

export function NotesToolbarPill({
  macTitlebarStyles,
  onOpenTabOverview,
  onNewNote,
  chatSidebarOpen,
  onToggleChatSidebar,
  linkSidebarActive,
  onOpenLinkedSidebar
}: NotesToolbarPillProps): JSX.Element {
  return (
    <div className={toolbarShellClass} style={macTitlebarStyles.noDrag}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-7 shrink-0 rounded-md"
        aria-label="New note"
        onClick={onNewNote}
      >
        <Plus className="size-3.5" aria-hidden />
      </Button>
      <span className="bg-border/80 h-3.5 w-px shrink-0" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-7 shrink-0 rounded-md"
        aria-label="Open tab overview"
        onClick={onOpenTabOverview}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
      </Button>
      <span className="bg-border/80 h-3.5 w-px shrink-0" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={
          chatSidebarOpen
            ? 'bg-accent text-accent-foreground size-7 shrink-0 rounded-md'
            : 'text-muted-foreground size-7 shrink-0 rounded-md'
        }
        aria-label={chatSidebarOpen ? 'Close chat panel' : 'Open chat panel'}
        aria-pressed={chatSidebarOpen}
        onClick={onToggleChatSidebar}
      >
        <MessageCircle className="size-3.5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={
          linkSidebarActive
            ? 'bg-accent text-accent-foreground size-7 shrink-0 rounded-md'
            : 'text-muted-foreground size-7 shrink-0 rounded-md'
        }
        aria-label={linkSidebarActive ? 'Close note links panel' : 'Open note links panel'}
        aria-pressed={linkSidebarActive}
        onClick={onOpenLinkedSidebar}
      >
        <Link2 className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}

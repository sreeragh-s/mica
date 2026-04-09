import type { JSX } from 'react'

import { LayoutGrid, Link2, MessageCircle, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { liquidGlassToolbarShellClass } from '@/lib/platform/liquid-glass-toolbar'

import type { MacTitlebarStyles } from '@/components/notes/notes-app-types'

export type NotesToolbarPillProps = {
  isMacNotelab?: boolean
  macTitlebarStyles: MacTitlebarStyles
  /** Main-process `electron-liquid-glass` attached (macOS). */
  nativeLiquidGlassAttached: boolean
  onOpenTabOverview: () => void
  onNewNote: () => void
  chatSidebarOpen: boolean
  onToggleChatSidebar: () => void
  linkSidebarActive: boolean
  onOpenLinkedSidebar: () => void
}

export function NotesToolbarPill({
  isMacNotelab = false,
  macTitlebarStyles,
  nativeLiquidGlassAttached,
  onOpenTabOverview,
  onNewNote,
  chatSidebarOpen,
  onToggleChatSidebar,
  linkSidebarActive,
  onOpenLinkedSidebar
}: NotesToolbarPillProps): JSX.Element {
  return (
    <div
      className={cn(
        liquidGlassToolbarShellClass(nativeLiquidGlassAttached),
        isMacNotelab && 'mt-2'
      )}
      style={macTitlebarStyles.noDrag}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-8 shrink-0 rounded-full"
        aria-label="New note"
        onClick={onNewNote}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
      <span className="bg-border/80 h-5 w-px shrink-0" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-8 shrink-0 rounded-full"
        aria-label="Open tab overview"
        onClick={onOpenTabOverview}
      >
        <LayoutGrid className="size-4" aria-hidden />
      </Button>
      <span className="bg-border/80 h-5 w-px shrink-0" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={
          chatSidebarOpen
            ? 'bg-accent text-accent-foreground size-8 shrink-0 rounded-full'
            : 'text-muted-foreground size-8 shrink-0 rounded-full'
        }
        aria-label={chatSidebarOpen ? 'Close chat panel' : 'Open chat panel'}
        aria-pressed={chatSidebarOpen}
        onClick={onToggleChatSidebar}
      >
        <MessageCircle className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={
          linkSidebarActive
            ? 'bg-accent text-accent-foreground size-8 shrink-0 rounded-full'
            : 'text-muted-foreground size-8 shrink-0 rounded-full'
        }
        aria-label={linkSidebarActive ? 'Close note links panel' : 'Open note links panel'}
        aria-pressed={linkSidebarActive}
        onClick={onOpenLinkedSidebar}
      >
        <Link2 className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

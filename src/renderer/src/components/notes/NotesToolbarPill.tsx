import type { JSX } from 'react'

import { LayoutGrid, MessageCircle, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { liquidGlassToolbarShellClass } from '@/lib/liquid-glass-toolbar'

import type { MacTitlebarStyles } from './notes-app-types'

export type NotesToolbarPillProps = {
  macElectron?: boolean
  macTitlebarStyles: MacTitlebarStyles
  /** Main-process `electron-liquid-glass` attached (macOS). */
  nativeLiquidGlassAttached: boolean
  onOpenTabOverview: () => void
  onNewNote: () => void
  chatSidebarOpen: boolean
  onToggleChatSidebar: () => void
}

export function NotesToolbarPill({
  macElectron = false,
  macTitlebarStyles,
  nativeLiquidGlassAttached,
  onOpenTabOverview,
  onNewNote,
  chatSidebarOpen,
  onToggleChatSidebar
}: NotesToolbarPillProps): JSX.Element {
  return (
    <div
      className={cn(
        liquidGlassToolbarShellClass(nativeLiquidGlassAttached),
        macElectron && 'mt-2'
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
    </div>
  )
}

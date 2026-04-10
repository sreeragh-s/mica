import { memo, type JSX } from 'react'

import { cn } from '@/lib/utils'
import type { SavedNote } from '@/lib/notes/notes-storage'
import type { MacTitlebarStyles } from '@/components/notes/notes-app-types'
import { NoteTabStrip } from '@/components/notes/editor-area/NoteTabStrip'
import {
  NotesToolbarPill,
  SidebarEdgeToolbarPill
} from '@/components/notes/editor-area/NotesToolbarPill'
import { TimelineRuler } from '@/components/ui/timeline-ruler'

export type NotesMainTopBarProps = {
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  /** When the file sidebar column is collapsed, show expand in the main top bar; when open, collapse lives in {@link NotesSidebar}. */
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  showJournalTimeline: boolean
  journalTimelineDate: string
  onJournalTimelineDateChange: (isoDate: string) => void
  availableDates?: string[]
  showTabs: boolean
  openNoteTabPaths: string[]
  notes: SavedNote[]
  selectedNotePath: string | null
  reorderOpenNoteTabs: (fn: (prev: string[]) => string[]) => void
  closeNoteTab: (id: string) => void
  selectNote: (id: string) => void
  showNotesToolbar: boolean
  onOpenTabOverview: () => void
  onNewNote: () => void
  chatSidebarOpen: boolean
  onToggleChatSidebar: () => void
  linkSidebarActive: boolean
  onOpenLinkedSidebar: () => void
}

function NotesMainTopBarInner({
  isMacNotelab,
  macTitlebarStyles,
  sidebarCollapsed,
  onToggleSidebar,
  showJournalTimeline,
  journalTimelineDate,
  onJournalTimelineDateChange,
  availableDates,
  showTabs,
  openNoteTabPaths,
  notes,
  selectedNotePath,
  reorderOpenNoteTabs,
  closeNoteTab,
  selectNote,
  showNotesToolbar,
  onOpenTabOverview,
  onNewNote,
  chatSidebarOpen,
  onToggleChatSidebar,
  linkSidebarActive,
  onOpenLinkedSidebar
}: NotesMainTopBarProps): JSX.Element {
  return (
    <div
      className={cn(
        'border-border bg-background relative z-10 flex h-12 min-h-12 w-full shrink-0 items-center gap-2 border-b pr-2',
        isMacNotelab && 'pointer-events-none'
      )}
    >
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 items-center gap-2',
          isMacNotelab && sidebarCollapsed && 'pl-[92px]',
          isMacNotelab && 'pointer-events-none'
        )}
      >
        {sidebarCollapsed ? (
          <div className="pointer-events-auto shrink-0">
            <SidebarEdgeToolbarPill
              macTitlebarStyles={macTitlebarStyles}
              expanded={false}
              onClick={onToggleSidebar}
            />
          </div>
        ) : null}
        {showJournalTimeline ? (
          <div className="pointer-events-auto min-w-0 w-full flex-1">
            <TimelineRuler
              selectedDate={journalTimelineDate}
              availableDates={availableDates ?? []}
              onDateSelect={onJournalTimelineDateChange}
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
              className="mt-0 mb-0"
            />
          </div>
        ) : showTabs ? (
          <div className="pointer-events-auto min-w-0 flex-1">
            <NoteTabStrip
              openNoteTabPaths={openNoteTabPaths}
              notes={notes}
              selectedNotePath={selectedNotePath}
              reorderOpenNoteTabs={reorderOpenNoteTabs}
              closeNoteTab={closeNoteTab}
              selectNote={selectNote}
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
            />
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1" aria-hidden />
        )}
      </div>
      {showNotesToolbar ? (
        <div
          className="pointer-events-auto flex shrink-0 items-center"
          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
        >
          <NotesToolbarPill
            macTitlebarStyles={macTitlebarStyles}
            onOpenTabOverview={onOpenTabOverview}
            onNewNote={onNewNote}
            chatSidebarOpen={chatSidebarOpen}
            onToggleChatSidebar={onToggleChatSidebar}
            linkSidebarActive={linkSidebarActive}
            onOpenLinkedSidebar={onOpenLinkedSidebar}
          />
        </div>
      ) : null}
    </div>
  )
}

export const NotesMainTopBar = memo(NotesMainTopBarInner)

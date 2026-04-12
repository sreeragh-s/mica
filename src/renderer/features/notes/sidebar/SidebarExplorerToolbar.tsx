import { AnimatePresence, motion } from 'framer-motion'
import {
  FolderPlus,
  Network,
  PencilRuler,
  Search,
  SquarePen,
  X
} from 'lucide-react'
import { type JSX, type RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'

export type SidebarExplorerToolbarProps = {
  animationsEnabled: boolean
  isMacNotelab: boolean
  macTitlebarStyles: NotesAppViewModel['macTitlebarStyles']
  searchOpen: boolean
  searchQuery: string
  setSearchQuery: (q: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  openSearch: () => void
  closeSearch: () => void
  startFolderCreate: NotesAppViewModel['startFolderCreate']
  canCreateNote: boolean
  handleNewNote: NotesAppViewModel['handleNewNote']
  handleNewDrawing: NotesAppViewModel['handleNewDrawing']
  graphViewOpen: boolean
  openGraphView: NotesAppViewModel['openGraphView']
  closeGraphView: NotesAppViewModel['closeGraphView']
}

export function SidebarExplorerToolbar({
  animationsEnabled,
  isMacNotelab,
  macTitlebarStyles,
  searchOpen,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  openSearch,
  closeSearch,
  startFolderCreate,
  canCreateNote,
  handleNewNote,
  handleNewDrawing,
  graphViewOpen,
  openGraphView,
  closeGraphView
}: SidebarExplorerToolbarProps): JSX.Element {
  const rowClass = (extra: string) =>
    cn(
      'relative z-10 flex w-full shrink-0 flex-row flex-nowrap items-stretch justify-start gap-0.5 py-1.5',
      isMacNotelab ? 'pointer-events-none px-4 pr-2' : 'px-2',
      extra
    )

  const searchInner = (
    <div
      className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <Input
        ref={searchInputRef}
        placeholder="Search notes…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-8 flex-1"
        aria-label="Search notes"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground size-8 shrink-0 p-0"
        aria-label="Close search"
        onClick={closeSearch}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  )

  const toolbarLeading = (
    <div className="flex min-w-0 flex-none items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground size-8 shrink-0 p-0"
        aria-label="New folder"
        onClick={startFolderCreate}
        data-sidebar-interactive=""
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <FolderPlus className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground size-8 shrink-0 p-0"
        aria-label="New note"
        disabled={!canCreateNote}
        onClick={handleNewNote}
        data-sidebar-interactive=""
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <SquarePen className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground size-8 shrink-0 p-0"
        title="New drawing"
        aria-label="New drawing"
        disabled={!canCreateNote}
        onClick={handleNewDrawing}
        data-sidebar-interactive=""
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <PencilRuler className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={graphViewOpen ? 'secondary' : 'ghost'}
        className={cn(
          'size-8 shrink-0 p-0',
          graphViewOpen ? 'text-foreground' : 'text-muted-foreground'
        )}
        title="Note link graph"
        aria-label="Note link graph"
        aria-pressed={graphViewOpen}
        disabled={!canCreateNote}
        onClick={() => (graphViewOpen ? closeGraphView() : openGraphView())}
        data-sidebar-interactive=""
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <Network className="size-4" aria-hidden />
      </Button>
    </div>
  )

  const toolbarInner = (
    <div
      className="pointer-events-auto flex min-w-0 flex-1 items-center justify-between gap-0.5"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      {toolbarLeading}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground size-8 shrink-0 p-0"
        title="Search notes"
        aria-label="Search notes"
        onClick={openSearch}
        data-sidebar-interactive=""
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <Search className="size-4" aria-hidden />
      </Button>
    </div>
  )

  return (
    <AnimatePresence mode="wait" initial={false}>
      {searchOpen ? (
        animationsEnabled ? (
          <motion.div
            key="search-bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={rowClass('')}
          >
            {searchInner}
          </motion.div>
        ) : (
          <div key="search-bar" className={rowClass('')}>
            {searchInner}
          </div>
        )
      ) : animationsEnabled ? (
        <motion.div
          key="toolbar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={rowClass('')}
        >
          {toolbarInner}
        </motion.div>
      ) : (
        <div key="toolbar" className={rowClass('')}>
          {toolbarInner}
        </div>
      )}
    </AnimatePresence>
  )
}

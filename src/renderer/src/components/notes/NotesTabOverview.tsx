import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'

import { FileText, PenLine, Plus, Search, X } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DEFAULT_WORKSPACE_ID, extractPreviewText, formatNoteTime } from '@/lib/notes-storage'
import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'

import { isDrawingNote } from './notes-app-utils'
import type { MacTitlebarStyles } from './notes-app-types'

const OVERVIEW_PREVIEW_CHARS = 260

/** No stagger — all tab tiles share one entrance so nothing trails or wobbles out of sync. */
const gridContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0, delayChildren: 0 }
  }
}

const gridItemVariants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: 10
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }
  }
}

export type NotesTabOverviewProps = {
  notes: SavedNote[]
  folders: WorkspaceFolder[]
  openNoteTabIds: string[]
  selectedId: string | null
  macTitlebarStyles: MacTitlebarStyles
  macElectron: boolean
  /** When true (macOS + expanded sidebar), align with the main column beside the overlay sidebar. */
  sidebarOverlayActive: boolean
  onClose: () => void
  onSelectNote: (noteId: string) => void
  onNewNote: () => void
  onCloseTab: (noteId: string) => void
}

export function NotesTabOverview({
  notes,
  folders,
  openNoteTabIds,
  selectedId,
  macTitlebarStyles,
  macElectron,
  sidebarOverlayActive,
  onClose,
  onSelectNote,
  onNewNote,
  onCloseTab
}: NotesTabOverviewProps): JSX.Element {
  const [query, setQuery] = useState('')

  const folderNameById = useMemo(() => {
    const m = new Map(folders.map((f) => [f.id, f.name]))
    m.set(DEFAULT_WORKSPACE_ID, 'Root')
    return m
  }, [folders])

  const tabNotes = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list: SavedNote[] = []
    for (const id of openNoteTabIds) {
      const n = notes.find((x) => x.id === id)
      if (!n) continue
      if (q) {
        const title = (n.title || 'Untitled').toLowerCase()
        const folder = (folderNameById.get(n.folderId) ?? '').toLowerCase()
        if (!title.includes(q) && !folder.includes(q)) continue
      }
      list.push(n)
    }
    return list
  }, [notes, openNoteTabIds, query, folderNameById])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onCardClick = useCallback(
    (id: string) => {
      onSelectNote(id)
    },
    [onSelectNote]
  )

  return (
    <motion.div
      className={cn(
        // NotesMainArea uses pointer-events-none on macOS so titlebar dragging works; overlays must opt back in.
        'pointer-events-auto bg-background/75 fixed inset-0 z-[200] flex min-h-0 w-full flex-col backdrop-blur-2xl backdrop-saturate-150',
        sidebarOverlayActive && 'pl-[min(100%,320px)]'
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Tab overview"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className={cn(
          'flex shrink-0 items-center gap-2 px-4 pb-2 pt-3',
          macElectron && 'pt-10'
        )}
        style={macTitlebarStyles.noDrag}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search
            className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 opacity-70"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tabs…"
            className="border-border bg-background/90 h-9 w-full rounded-full border pl-9 pr-3 text-sm shadow-sm backdrop-blur-md"
            aria-label="Search open tabs"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-9 shrink-0 rounded-full"
          aria-label="Close tab overview"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </motion.div>

      <motion.div
        className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-2"
        initial={{ opacity: 0, scale: 1.045 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="grid w-full min-w-0 grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 md:gap-7"
          variants={gridContainerVariants}
          initial="hidden"
          animate="visible"
        >
          {tabNotes.map((note) => {
            const title = note.title.trim() || 'Untitled'
            const active = note.id === selectedId
            const drawing = isDrawingNote(note)
            const preview =
              !drawing && note.content
                ? extractPreviewText(note.content, OVERVIEW_PREVIEW_CHARS)
                : drawing
                  ? 'Whiteboard canvas'
                  : 'Empty note'
            const folderName = folderNameById.get(note.folderId) ?? 'Root'

            return (
              <motion.div
                key={note.id}
                role="button"
                tabIndex={0}
                variants={gridItemVariants}
                onClick={() => onCardClick(note.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCardClick(note.id)
                  }
                }}
                className={cn(
                  'group border-border hover:ring-1 hover:ring-primary/50 bg-card text-card-foreground flex min-h-[11.5rem] w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  active && 'ring-primary/50 ring-1 '
                )}
              >
                <div className="bg-muted/50 flex min-h-9 shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground size-7 shrink-0 rounded-md"
                    aria-label={`Close tab ${title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseTab(note.id)
                    }}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {drawing ? (
                      <PenLine className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <FileText className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="truncate text-[13px] font-medium leading-tight" title={title}>
                      {title}
                    </span>
                  </div>
                </div>

                {/* Minimized “page” preview */}
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5 pt-2">
                  <div
                    className={cn(
                      'border-border/70 bg-background/85 relative min-h-[5.25rem] flex-1 overflow-hidden rounded-md border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
                      drawing && 'flex items-stretch justify-stretch'
                    )}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/15 to-transparent"
                      aria-hidden
                    />
                    {drawing ? (
                      <div className="relative m-2 flex flex-1 items-center justify-center overflow-hidden rounded-[3px] border border-dashed border-muted-foreground/20 bg-[radial-gradient(circle_at_center,oklch(0.55_0_0/0.12)_1px,transparent_1px)] bg-[length:9px_9px] dark:bg-[radial-gradient(circle_at_center,oklch(0.85_0_0/0.14)_1px,transparent_1px)]">
                        <PenLine
                          className="text-muted-foreground/35 size-10 shrink-0 stroke-[1]"
                          aria-hidden
                        />
                      </div>
                    ) : (
                      <p
                        className="text-muted-foreground relative line-clamp-6 p-2.5 text-[10px] leading-[1.45] tracking-[0.01em]"
                        title={preview}
                      >
                        {preview}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2">
                    <span className="text-muted-foreground max-w-[55%] truncate text-[10px] font-medium uppercase tracking-wide opacity-75">
                      {folderName}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-[10px] opacity-65">
                      {formatNoteTime(note.updatedAt)}
                    </span>
                  </div>
                </div>
              </motion.div>
            )
          })}

          <motion.button
            type="button"
            variants={gridItemVariants}
            onClick={onNewNote}
            className="border-border bg-muted/40 text-muted-foreground hover:bg-muted/55 hover:text-foreground flex min-h-[11.5rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
            aria-label="Create new note"
          >
            <Plus className="size-10 stroke-[1.25]" aria-hidden />
            <span className="text-sm font-medium">New note</span>
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

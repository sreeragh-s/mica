import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'

import { FileText, PenLine, Plus, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DEFAULT_WORKSPACE_ID, extractPreviewText, formatNoteTime } from '@/lib/notes-storage'
import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'

import { isDrawingNote } from './notes-app-utils'
import type { MacTitlebarStyles } from './notes-app-types'

export type NotesTabOverviewProps = {
  notes: SavedNote[]
  folders: WorkspaceFolder[]
  openNoteTabIds: string[]
  selectedId: string | null
  macTitlebarStyles: MacTitlebarStyles
  macElectron: boolean
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
    <div
      className="bg-background/75 fixed inset-0 z-[200] flex flex-col backdrop-blur-2xl backdrop-saturate-150"
      role="dialog"
      aria-modal="true"
      aria-label="Tab overview"
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-end px-4 pb-2 pt-3',
          macElectron && 'pt-10'
        )}
        style={macTitlebarStyles.noDrag}
      >
        <div className="relative w-full max-w-md">
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {tabNotes.map((note) => {
            const title = note.title.trim() || 'Untitled'
            const active = note.id === selectedId
            const drawing = isDrawingNote(note)
            const preview =
              !drawing && note.content
                ? extractPreviewText(note.content, 120)
                : drawing
                  ? 'Drawing'
                  : 'Empty note'
            const folderName = folderNameById.get(note.folderId) ?? 'Root'

            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => onCardClick(note.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCardClick(note.id)
                  }
                }}
                className={cn(
                  'group border-border bg-card text-card-foreground flex aspect-[4/3] min-h-0 w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left shadow-sm outline-none transition-[box-shadow,transform] hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'ring-primary ring-2 ring-offset-2 ring-offset-background'
                )}
              >
                <div className="bg-muted/50 flex min-h-9 shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
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
                <div className="text-muted-foreground flex min-h-0 flex-1 flex-col gap-1 p-3">
                  <span className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                    {folderName}
                  </span>
                  <p className="line-clamp-4 text-xs leading-relaxed">{preview}</p>
                  <span className="mt-auto text-[11px] opacity-60">
                    {formatNoteTime(note.updatedAt)}
                  </span>
                </div>
              </div>
            )
          })}

          <button
            type="button"
            onClick={onNewNote}
            className="border-border bg-muted/40 text-muted-foreground hover:bg-muted/55 hover:text-foreground flex aspect-[4/3] min-h-[8rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
            aria-label="Create new note"
          >
            <Plus className="size-10 stroke-[1.25]" aria-hidden />
            <span className="text-sm font-medium">New note</span>
          </button>
        </div>
      </div>

      <div
        className="border-border flex shrink-0 justify-center border-t py-3"
        style={macTitlebarStyles.noDrag}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={onClose}
        >
          Done
        </Button>
      </div>
    </div>
  )
}

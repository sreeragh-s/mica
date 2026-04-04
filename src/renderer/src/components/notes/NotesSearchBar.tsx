import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent
} from 'react'

import { FileText, PenLine, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { NoteSearchResult, SearchMatchSegment } from '@/lib/notes-search'
import { searchNotes } from '@/lib/notes-search'
import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'

import { isDrawingNote } from './notes-app-utils'
import type { MacTitlebarStyles } from './notes-app-types'

function SearchHighlight({ segments }: { segments: SearchMatchSegment[] }): JSX.Element {
  return (
    <>
      {segments.map((s, i) =>
        s.highlight ? (
          <mark
            key={i}
            className="bg-primary/35 text-foreground rounded-[3px] px-0.5 font-medium dark:bg-primary/25"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  )
}

export type NotesSearchBarProps = {
  notes: SavedNote[]
  folders: WorkspaceFolder[]
  onSelectNote: (noteId: string) => void
  macTitlebarStyles: MacTitlebarStyles
  sidebarOverlayActive: boolean
  macElectron: boolean
  sidebarCollapsed: boolean
}

export function NotesSearchBar({
  notes,
  folders,
  onSelectNote,
  macTitlebarStyles,
  sidebarOverlayActive,
  macElectron,
  sidebarCollapsed
}: NotesSearchBarProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () => searchNotes(notes, folders, query, { limit: 40 }),
    [notes, folders, query]
  )

  const showPopover = open && query.trim().length > 0

  const activeIndex = results.length === 0 ? 0 : Math.min(selected, results.length - 1)

  useEffect(() => {
    if (!showPopover) return
    const el = listRef.current?.querySelector(`[data-search-result-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, showPopover])

  const pick = useCallback(
    (r: NoteSearchResult) => {
      onSelectNote(r.note.id)
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
    },
    [onSelectNote]
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!showPopover || results.length === 0) {
        if (e.key === 'Escape') {
          setQuery('')
          setOpen(false)
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const maxIdx = Math.max(0, results.length - 1)
        const idx = Math.min(selected, maxIdx)
        const r = results[idx]
        if (r) pick(r)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setQuery('')
        setOpen(false)
      }
    },
    [showPopover, results, selected, pick]
  )

  return (
    <div
      ref={wrapRef}
      className={cn(
        'flex h-12 shrink-0 items-center justify-center px-2',
        sidebarOverlayActive && 'pr-1.5',
        !sidebarOverlayActive && macElectron && sidebarCollapsed && 'pl-[92px]'
      )}
      style={macTitlebarStyles.noDrag}
    >
      <Popover
        open={showPopover}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <PopoverAnchor asChild>
          <div className="relative w-full max-w-md">
            <Search
              className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 opacity-70"
              aria-hidden
            />
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelected(0)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                window.setTimeout(() => {
                  if (!wrapRef.current?.contains(document.activeElement)) {
                    setOpen(false)
                  }
                }, 0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Search notes…"
              className="border-0 bg-background/40 text-foreground placeholder:text-muted-foreground h-8 w-full rounded-full pl-9 pr-3 text-sm shadow-sm ring-0 backdrop-blur-xl backdrop-saturate-150 focus-visible:ring-4 focus-visible:ring-ring/35 dark:bg-white/[0.07]"
              aria-label="Search notes"
              aria-autocomplete="list"
              aria-expanded={showPopover}
              role="combobox"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="center"
          sideOffset={6}
          className="border-border bg-popover text-popover-foreground max-h-[min(50vh,340px)] w-[min(28rem,calc(100vw-2rem))] overflow-hidden p-0 shadow-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div
            ref={listRef}
            className="max-h-[min(50vh,340px)] overflow-y-auto p-1"
            role="listbox"
            aria-label="Search results"
          >
            {results.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                No matching notes.
              </p>
            ) : (
              results.map((r, i) => {
                const drawing = isDrawingNote(r.note)
                return (
                  <Button
                    key={r.note.id}
                    type="button"
                    variant="ghost"
                    role="option"
                    data-search-result-index={i}
                    aria-selected={i === activeIndex}
                    className={cn(
                      'h-auto min-h-0 w-full flex-col items-stretch gap-1 rounded-md px-2.5 py-2 text-left font-normal',
                      i === activeIndex && 'bg-accent text-accent-foreground'
                    )}
                    onMouseEnter={() => setSelected(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(r)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {drawing ? (
                        <PenLine
                          className="text-muted-foreground size-4 shrink-0 opacity-90"
                          aria-hidden
                        />
                      ) : (
                        <FileText
                          className="text-muted-foreground size-4 shrink-0 opacity-90"
                          aria-hidden
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
                        <SearchHighlight segments={r.titleSegments} />
                      </span>
                    </div>
                    <div className="text-muted-foreground pl-6 text-xs leading-snug">
                      <span className="line-clamp-2">
                        <SearchHighlight segments={r.snippetSegments} />
                      </span>
                      <span className="mt-0.5 block opacity-80">{r.folderName}</span>
                    </div>
                  </Button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

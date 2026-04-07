import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode
} from 'react'

import { PanelLeftOpen, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { NoteSearchResult, SearchMatchSegment } from '@/lib/notes-search'
import { searchNotes } from '@/lib/notes-search'
import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'

import { liquidGlassControlPillClass, liquidGlassSearchShellClass } from '@/lib/liquid-glass-toolbar'

import { MacSidebarLeadingToolbarIcon } from './MacSidebarToolbarIcon'
import { NoteLeadingIcon } from './NoteLeadingIcon'
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
  isMacNotelab: boolean
  /** Main-process `electron-liquid-glass` attached (macOS). */
  nativeLiquidGlassAttached: boolean
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  trailing?: ReactNode
}

export function NotesSearchBar({
  notes,
  folders,
  onSelectNote,
  macTitlebarStyles,
  sidebarOverlayActive,
  isMacNotelab,
  nativeLiquidGlassAttached,
  sidebarCollapsed,
  toggleSidebar,
  trailing
}: NotesSearchBarProps): JSX.Element {
  const nativeGlassUi = isMacNotelab && nativeLiquidGlassAttached
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
        'relative z-10 grid h-12 w-full min-w-0 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-2 mt-1',
        isMacNotelab && 'pointer-events-none',
        !sidebarOverlayActive && isMacNotelab && sidebarCollapsed && 'pl-[92px]'
      )}
    >
      {/* macOS: window drag is one full-width band in NotesApp; this row is pointer-events-none except controls. */}
      <div className="flex min-h-0 min-w-0 items-center justify-end gap-2">
        {sidebarCollapsed ? (
          <div
            className={cn('pointer-events-auto', liquidGlassControlPillClass(nativeGlassUi))}
            style={macTitlebarStyles.noDrag}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-8 shrink-0 rounded-full"
              aria-label="Expand sidebar"
              aria-expanded={false}
              onClick={toggleSidebar}
            >
              {isMacNotelab ? (
                <MacSidebarLeadingToolbarIcon
                  className="size-[15px]"
                  nativeLiquidGlassActive={nativeGlassUi}
                />
              ) : (
                <PanelLeftOpen className="size-4" aria-hidden />
              )}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="min-w-0 max-w-md w-full">
        <Popover
          open={showPopover}
          onOpenChange={(next) => {
            if (!next) setOpen(false)
          }}
        >
          <PopoverAnchor asChild>
            <div
              className={cn('pointer-events-auto', liquidGlassSearchShellClass(nativeGlassUi))}
              style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
            >
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
                  className="border-0 bg-transparent text-foreground placeholder:text-muted-foreground h-8 w-full rounded-full pl-9 pr-3 text-sm ring-0 focus-visible:ring-4 focus-visible:ring-ring/35"
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
                          <NoteLeadingIcon note={r.note} />
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
      <div className="flex min-h-0 min-w-0 items-center justify-start gap-2">
        {trailing != null ? (
          <div
            className="pointer-events-auto shrink-0"
            style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
          >
            {trailing}
          </div>
        ) : null}
      </div>
    </div>
  )
}

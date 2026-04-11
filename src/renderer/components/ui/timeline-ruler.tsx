'use client'

import {
  useEffect,
  useMemo,
  useCallback,
  useState,
  useRef,
  memo,
  useLayoutEffect,
  type WheelEvent
} from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import type { MacTitlebarStyles } from '@/features/notes/notes-app-types'
import { NOTES_APP_PILL_ROUNDED, NOTES_APP_PILL_SURFACE } from '@/features/notes/notes-app-utils'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Days to prepend/append when the scroll viewport nears an edge. */
const BUFFER_CHUNK_DAYS = 42
/** Initial days before / after anchor (inclusive span = 2 * n + 1). */
const INITIAL_PAD_DAYS = 60
const EDGE_SCROLL_PX = 120
/** Fallback cell width when not yet measured (matches min-w-[5rem]). */
const FALLBACK_CELL_PX = 80

type DateBuffer = { start: Date; length: number }

function initialBuffer(selectedDate: string | undefined): DateBuffer {
  const anchor = selectedDate
    ? startOfDay(new Date(`${selectedDate}T00:00:00`))
    : startOfDay(new Date())
  return {
    start: addDays(anchor, -INITIAL_PAD_DAYS),
    length: INITIAL_PAD_DAYS * 2 + 1
  }
}

interface TimelineRulerProps {
  selectedDate?: string
  availableDates: string[]
  onDateSelect: (dateStr: string) => void
  isMacNotelab?: boolean
  macTitlebarStyles?: MacTitlebarStyles
  /** Merges onto the outer wrapper (default spacing is for standalone panels). */
  className?: string
}

export const TimelineRuler = memo(function TimelineRuler({
  selectedDate,
  availableDates,
  onDateSelect,
  isMacNotelab = false,
  macTitlebarStyles,
  className
}: TimelineRulerProps) {
  const selectedRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cellWidthRef = useRef(FALLBACK_CELL_PX)
  const scrollAdjustRef = useRef(0)
  const extendingRef = useRef(false)

  const [buffer, setBuffer] = useState<DateBuffer>(() => initialBuffer(selectedDate))

  const dates = useMemo(() => {
    const out: Date[] = []
    const s = startOfDay(buffer.start)
    for (let i = 0; i < buffer.length; i++) {
      out.push(addDays(s, i))
    }
    return out
  }, [buffer])

  const availableSet = useMemo(() => new Set(availableDates), [availableDates])
  const todayStr = useMemo(() => format(startOfDay(new Date()), 'yyyy-MM-dd'), [])

  // Keep selected day in the rendered range when selection jumps (e.g. parent / Today).
  useEffect(() => {
    if (!selectedDate) return
    const sel = startOfDay(new Date(`${selectedDate}T00:00:00`))
    setBuffer((b) => {
      const end = addDays(b.start, b.length - 1)
      if (sel >= b.start && sel <= end) return b
      return initialBuffer(selectedDate)
    })
  }, [selectedDate])

  const prependChunk = useCallback(() => {
    const w = cellWidthRef.current
    scrollAdjustRef.current += BUFFER_CHUNK_DAYS * w
    setBuffer((b) => ({
      start: addDays(b.start, -BUFFER_CHUNK_DAYS),
      length: b.length + BUFFER_CHUNK_DAYS
    }))
  }, [])

  const appendChunk = useCallback(() => {
    setBuffer((b) => ({ ...b, length: b.length + BUFFER_CHUNK_DAYS }))
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const adj = scrollAdjustRef.current
    if (el && adj !== 0) {
      el.scrollLeft += adj
      scrollAdjustRef.current = 0
    }
    extendingRef.current = false

    const row = scrollRef.current
    const first = row?.firstElementChild
    if (first instanceof HTMLElement) {
      const w = first.offsetWidth
      if (w > 0) cellWidthRef.current = w
    }
  }, [buffer])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || extendingRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    if (scrollWidth <= clientWidth) return

    if (scrollLeft < EDGE_SCROLL_PX) {
      extendingRef.current = true
      prependChunk()
      return
    }
    if (scrollWidth - clientWidth - scrollLeft < EDGE_SCROLL_PX) {
      extendingRef.current = true
      appendChunk()
    }
  }, [prependChunk, appendChunk])

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    const horizontalDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (horizontalDelta === 0) return
    el.scrollLeft += horizontalDelta
    event.preventDefault()
  }, [])

  const goToday = useCallback(() => {
    onDateSelect(todayStr)
    setBuffer(initialBuffer(todayStr))
  }, [onDateSelect, todayStr])

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: 'instant',
      block: 'nearest',
      inline: 'center'
    })
  }, [buffer, selectedDate])

  return (
    <TooltipProvider>
      <div
        className={cn(
          'relative z-10 flex min-h-0 w-full min-w-0 flex-1 items-center gap-2 px-2 text-foreground',
          isMacNotelab && 'pointer-events-auto',
          className
        )}
        style={isMacNotelab ? macTitlebarStyles?.noDrag : undefined}
      >
        <div
          className={cn(
            'isolate flex h-8 w-full min-w-0 flex-1 items-stretch overflow-hidden',
            NOTES_APP_PILL_ROUNDED,
            NOTES_APP_PILL_SURFACE
          )}
        >
          <div
            ref={scrollRef}
            role="listbox"
            aria-label="Journal dates"
            onScroll={onScroll}
            onWheel={onWheel}
            className="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none]"
          >
            {dates.map((date) => {
              const dateStr = format(date, 'yyyy-MM-dd')
              const isAvailable = availableSet.has(dateStr)
              const isSelected = selectedDate === dateStr
              const hasAvailabilityFilter = availableDates.length > 0

              return (
                <div
                  key={dateStr}
                  className="group flex min-h-0 min-w-[5rem] shrink-0 items-center justify-center p-0.5"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        ref={isSelected ? selectedRef : undefined}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => onDateSelect(dateStr)}
                        className={cn(
                          'flex h-full w-full min-w-0 cursor-pointer flex-col items-center justify-center px-1 py-0.5 duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'rounded-md bg-background/92 text-foreground shadow-sm transition-colors dark:bg-white/[0.14]'
                            : 'rounded-none text-muted-foreground transition-[background-color,color,border-radius] hover:rounded-md hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]',
                          hasAvailabilityFilter && !isAvailable && !isSelected && 'opacity-45'
                        )}
                      >
                        <span className="text-[11px] font-medium leading-none tracking-tight">
                          {format(date, 'EEE')}
                        </span>
                        <span className="mt-0.5 text-xs font-medium tabular-nums leading-none tracking-tight">
                          {format(date, 'd')}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-medium">{format(date, 'MMM d, yyyy')}</div>
                      {hasAvailabilityFilter ? (
                        <div
                          className={cn(
                            'text-[10px]',
                            isAvailable ? 'text-primary' : 'text-muted-foreground'
                          )}
                        >
                          {isAvailable ? 'Data available' : 'No data'}
                        </div>
                      ) : null}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={goToday}
          className={cn(
            'flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-medium leading-tight tracking-tight text-muted-foreground transition-[background-color,color] hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.06]'
          )}
        >
          Today
        </button>
      </div>
    </TooltipProvider>
  )
})

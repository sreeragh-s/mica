import {
  useCallback,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent
} from 'react'

import { FileText, PenLine, X } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NOTES_APP_PILL_SURFACE } from './notes-app-utils'
import type { SavedNote } from '@/lib/notes-storage'
import type { MacTitlebarStyles } from './notes-app-types'

/** Spring for other tabs sliding into position. */
const SLIDE_SPRING = { type: 'spring' as const, stiffness: 500, damping: 38, mass: 0.7 }
/** Spring for scale (lifted feel) on the dragged tab. */
const LIFT_SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 }
const DRAG_THRESHOLD = 4

type DragState = {
  id: string
  pointerId: number
  /** Index of this tab in the original (pre-drag) order. */
  dragIdx: number
  /** Current pointer X delta from where drag started. */
  deltaX: number
  /** Pixel width of one tab, measured at drag start. */
  tabWidth: number
  /** Where the tab would be inserted on drop (0 … N-1). */
  insertionIdx: number
}

/**
 * Compute the visual X shift for a non-dragged tab at index `i`.
 *
 * Two-step logic that mirrors Safari:
 *  1. "Remove" the dragged tab → every tab after `dragIdx` shifts left by `tabWidth`.
 *  2. "Insert" a gap at `insertionIdx` → every tab whose packed index ≥ `insertionIdx`
 *     shifts right by `tabWidth`, opening the landing slot.
 *
 * The two steps partially cancel, producing a net shift of ±tabWidth or 0.
 */
function nonDraggedShift(
  i: number,
  dragIdx: number,
  insertionIdx: number,
  tabWidth: number
): number {
  // Index among the N-1 remaining (packed) tabs after the dragged one is removed.
  const packedIdx = i < dragIdx ? i : i - 1
  // Step 1: close the gap left by removal.
  let shift = i > dragIdx ? -tabWidth : 0
  // Step 2: open the landing gap.
  if (packedIdx >= insertionIdx) shift += tabWidth
  return shift
}

/**
 * Which slot (0 … N-1) the dragged tab's center is currently over.
 * Uses the full-layout slot centers so the gap snaps exactly under the pointer.
 */
function computeInsertionIdx(
  deltaX: number,
  dragIdx: number,
  numTabs: number,
  tabWidth: number
): number {
  const draggedCenter = (dragIdx + 0.5) * tabWidth + deltaX
  return Math.max(0, Math.min(numTabs - 1, Math.floor(draggedCenter / tabWidth)))
}

export type NoteTabStripProps = {
  openNoteTabIds: string[]
  notes: SavedNote[]
  selectedId: string | null
  reorderOpenNoteTabs: (fn: (prev: string[]) => string[]) => void
  closeNoteTab: (id: string) => void
  selectNote: (id: string) => void
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
}

export function NoteTabStrip({
  openNoteTabIds,
  notes,
  selectedId,
  reorderOpenNoteTabs,
  closeNoteTab,
  selectNote,
  macElectron,
  macTitlebarStyles
}: NoteTabStripProps): JSX.Element {
  const [drag, setDrag] = useState<DragState | null>(null)
  // Mirror into a ref so pointer-event callbacks always see the latest value.
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  const tabElsRef = useRef<Map<string, HTMLElement>>(new Map())
  const startPointerXRef = useRef(0)
  const suppressClickRef = useRef(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, id: string) => {
      if (e.button !== 0) return
      const idx = openNoteTabIds.indexOf(id)
      if (idx < 0) return
      const el = tabElsRef.current.get(id)
      if (!el) return
      e.preventDefault()
      startPointerXRef.current = e.clientX
      suppressClickRef.current = false
      const state: DragState = {
        id,
        pointerId: e.pointerId,
        dragIdx: idx,
        deltaX: 0,
        tabWidth: el.getBoundingClientRect().width,
        insertionIdx: idx
      }
      dragRef.current = state
      setDrag(state)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [openNoteTabIds]
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>, id: string) => {
      const d = dragRef.current
      if (!d || d.id !== id || e.pointerId !== d.pointerId) return
      const deltaX = e.clientX - startPointerXRef.current
      const insertionIdx = computeInsertionIdx(deltaX, d.dragIdx, openNoteTabIds.length, d.tabWidth)
      const next: DragState = { ...d, deltaX, insertionIdx }
      dragRef.current = next
      setDrag(next)
    },
    [openNoteTabIds.length]
  )

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement> | null, id: string, releaseCapture = true) => {
      const d = dragRef.current
      if (!d || d.id !== id) return
      if (e && releaseCapture) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
      }
      dragRef.current = null
      setDrag(null)

      const moved = Math.abs(d.deltaX) > DRAG_THRESHOLD
      if (moved) {
        suppressClickRef.current = true
        if (d.insertionIdx !== d.dragIdx) {
          reorderOpenNoteTabs((prev) => {
            const next = [...prev]
            next.splice(d.dragIdx, 1)
            next.splice(d.insertionIdx, 0, d.id)
            return next
          })
        }
      } else {
        selectNote(id)
      }
    },
    [reorderOpenNoteTabs, selectNote]
  )

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>, id: string) => {
      const d = dragRef.current
      if (!d || d.id !== id || e.pointerId !== d.pointerId) return
      endDrag(e, id)
    },
    [endDrag]
  )

  const onLostCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>, id: string) => {
      endDrag(e, id, false)
    },
    [endDrag]
  )

  return (
    <div
      className={cn(
        'relative z-10 flex min-h-0 w-full min-w-0 flex-1 items-center px-2',
        macElectron && 'pointer-events-auto'
      )}
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <div
        className={cn(
          'isolate flex h-8 w-full min-w-0 flex-1 items-stretch overflow-hidden rounded-full',
          NOTES_APP_PILL_SURFACE
        )}
        role="tablist"
      >
        <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
          {openNoteTabIds.map((id, idx) => {
            const note = notes.find((n) => n.id === id)
            if (!note) return null

            const title = note.title.trim() || 'Untitled'
            const active = id === selectedId
            const isDrawing = note.kind === 'drawing'
            const isDragging = drag?.id === id
            const isLifted = isDragging && Math.abs(drag.deltaX) > DRAG_THRESHOLD

            // Compute per-tab x translation.
            // Dragged tab: follows pointer exactly (no spring on x).
            // Others: spring to their shift position to create the sliding gap.
            const translateX = drag
              ? isDragging
                ? drag.deltaX
                : nonDraggedShift(idx, drag.dragIdx, drag.insertionIdx, drag.tabWidth)
              : 0

            return (
              <motion.div
                key={id}
                layout={false}
                ref={(el) => {
                  if (el) tabElsRef.current.set(id, el)
                  else tabElsRef.current.delete(id)
                }}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                animate={{
                  x: translateX,
                  scale: isLifted ? 1.02 : 1,
                  opacity: isLifted ? 0.5 : 1,
                  zIndex: isDragging ? 10 : 1
                }}
                transition={
                  !drag
                    ? // No drag active: snap instantly so drop doesn't bounce/fade
                      { duration: 0 }
                    : isDragging
                      ? // Dragged tab: x instant, opacity/scale spring for smooth lift/fade
                        { x: { duration: 0 }, opacity: LIFT_SPRING, scale: LIFT_SPRING, zIndex: { duration: 0 } }
                      : // Other tabs: spring to their gap position
                        { ...SLIDE_SPRING, zIndex: { duration: 0 } }
                }
                style={{
                  touchAction: isDragging ? 'none' : undefined,
                  position: 'relative',
                  willChange: drag ? 'transform, opacity' : undefined
                }}
                className="group flex min-h-0 min-w-[5rem] flex-1 basis-0 items-center justify-center p-0.5"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectNote(id)
                  }
                }}
              >
                <div
                  role="presentation"
                  className={cn(
                    'grid h-full w-full min-w-0 max-w-full cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center px-1 duration-150',
                    active
                      ? 'rounded-full bg-background/92 text-foreground shadow-sm transition-colors dark:bg-white/[0.14]'
                      : 'rounded-none text-muted-foreground transition-[background-color,color,border-radius] hover:rounded-full hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]'
                  )}
                  onClick={(ev) => {
                    if ((ev.target as HTMLElement).closest('[data-tab-handle]')) return
                    selectNote(id)
                  }}
                >
                  {/* Close button */}
                  <div className="flex h-full items-center justify-start">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        'size-6 shrink-0',
                        active
                          ? 'rounded-full text-muted-foreground hover:bg-transparent'
                          : 'rounded-md text-muted-foreground opacity-0 hover:opacity-100 group-hover:opacity-100'
                      )}
                      aria-label={`Close tab ${title}`}
                      draggable={false}
                      onClick={(e) => {
                        e.stopPropagation()
                        closeNoteTab(id)
                      }}
                    >
                      <X className="size-3" aria-hidden />
                    </Button>
                  </div>

                  {/* Drag handle + title */}
                  <div
                    data-tab-handle
                    className="flex min-h-0 min-w-0 cursor-grab select-none items-center justify-center gap-1.5 px-0.5 active:cursor-grabbing"
                    onPointerDown={(e) => onPointerDown(e, id)}
                    onPointerMove={(e) => onPointerMove(e, id)}
                    onPointerUp={(e) => onPointerUp(e, id)}
                    onPointerCancel={(e) => onPointerUp(e, id)}
                    onLostPointerCapture={(e) => onLostCapture(e, id)}
                    onClick={(e) => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false
                        e.preventDefault()
                      }
                      e.stopPropagation()
                    }}
                  >
                    {isDrawing ? (
                      <PenLine className="text-muted-foreground size-3.5 shrink-0 opacity-80" aria-hidden />
                    ) : (
                      <FileText className="text-muted-foreground size-3.5 shrink-0 opacity-80" aria-hidden />
                    )}
                    <span
                      className="min-h-0 min-w-0 max-w-[min(11rem,100%)] truncate py-1 text-center text-[13px] font-medium leading-tight tracking-tight"
                      title={title}
                    >
                      {title}
                    </span>
                  </div>

                  <span className="block w-full shrink-0" aria-hidden />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

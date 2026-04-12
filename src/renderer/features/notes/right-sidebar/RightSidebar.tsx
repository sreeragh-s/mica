import {
  type JSX,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import { cn } from '@/lib/utils'
import { macTitlebarStyles } from '@/features/notes/notes-app-utils'
import {
  CHAT_SIDEBAR_DEFAULT_WIDTH_PX,
  CHAT_SIDEBAR_WIDTH_LS_KEY,
  clampRightSidebarWidth
} from '@/features/notes/right-sidebar/right-sidebar-constants'
import { RightSidebarInner } from '@/features/notes/right-sidebar/RightSidebarInner'
import type { RightSidebarProps } from '@/features/notes/right-sidebar/right-sidebar-types'

export function RightSidebar({
  open,
  notes,
  folders,
  workspacePath,
  canAutoIndex,
  indexingStatus,
  runIndexPending,
  selectedNote,
  selectNote,
  panel,
  linkMode,
  onLinkModeChange,
  isMacNotelab,
  linkMentionIndex
}: RightSidebarProps): JSX.Element {
  const [sidebarWidthPx, setSidebarWidthPx] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_SIDEBAR_WIDTH_LS_KEY)
      if (raw == null) return CHAT_SIDEBAR_DEFAULT_WIDTH_PX
      const n = Number(raw)
      if (Number.isFinite(n)) return clampRightSidebarWidth(n)
    } catch {
      /* ignore */
    }
    return CHAT_SIDEBAR_DEFAULT_WIDTH_PX
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const sidebarWidthRef = useRef(CHAT_SIDEBAR_DEFAULT_WIDTH_PX)

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidthPx
  }, [sidebarWidthPx])

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !open) return
      e.preventDefault()
      resizeDragRef.current = { startX: e.clientX, startW: sidebarWidthRef.current }
      setIsResizing(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [open]
  )

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = resizeDragRef.current
    if (!d) return
    const dx = d.startX - e.clientX
    setSidebarWidthPx(clampRightSidebarWidth(d.startW + dx))
  }, [])

  const onResizePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeDragRef.current == null) return
    resizeDragRef.current = null
    setIsResizing(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setSidebarWidthPx((w) => {
      try {
        localStorage.setItem(CHAT_SIDEBAR_WIDTH_LS_KEY, String(w))
      } catch {
        /* ignore */
      }
      return w
    })
  }, [])

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'flex min-h-0 shrink-0 self-stretch overflow-hidden',
        !isResizing &&
          'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]',
        open && 'pointer-events-auto',
        open ? '' : 'w-0'
      )}
      style={open ? { width: `min(100%, ${sidebarWidthPx}px)` } : { width: 0 }}
    >
      <div
        className={cn(
          'relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-l transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,transform]',
          'border-border bg-background',
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-2 opacity-0'
        )}
      >
        {open ? (
          <div
            aria-label="Resize right sidebar"
            aria-orientation="vertical"
            className={cn(
              'absolute left-0 top-0 z-20 h-full w-2 shrink-0 cursor-col-resize touch-none',
              'hover:bg-primary/10 active:bg-primary/15',
              isMacNotelab && 'pointer-events-auto'
            )}
            data-sidebar-interactive=""
            onPointerCancel={onResizePointerUp}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            role="separator"
            style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
          />
        ) : null}
        <RightSidebarInner
          open={open}
          folders={folders}
          canAutoIndex={canAutoIndex}
          indexingStatus={indexingStatus}
          isMacNotelab={isMacNotelab}
          notes={notes}
          runIndexPending={runIndexPending}
          workspacePath={workspacePath}
          selectNote={selectNote}
          selectedNote={selectedNote}
          panel={panel}
          linkMode={linkMode}
          onLinkModeChange={onLinkModeChange}
          linkMentionIndex={linkMentionIndex}
        />
      </div>
    </div>
  )
}

export type {
  RightSidebarLinkMode,
  RightSidebarPanel,
  RightSidebarProps,
  NoteLinksData
} from '@/features/notes/right-sidebar/right-sidebar-types'

import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import type { NotesAppProps } from './notes-app-types'
import { macDragDebugSurfaceClass, macTitlebarStyles } from './notes-app-utils'
import { NotesMainArea } from './NotesMainArea'
import { NotesSidebar } from './NotesSidebar'
import { useNotesApp } from './useNotesApp'

export type { NotesAppProps } from './notes-app-types'

export function NotesApp(props: NotesAppProps): JSX.Element {
  const vm = useNotesApp(props)
  const { sidebarCollapsed, zenMode, macElectron, sidebarOverlayActive } = vm
  const sidebarHidden = sidebarCollapsed || zenMode

  return (
    <div
      className={cn(
        'bg-background text-foreground relative overflow-hidden',
        sidebarOverlayActive ? 'h-screen w-full' : 'flex h-screen w-full flex-row'
      )}
    >
      {/*
        Single macOS drag band: full width, flush to window top. Interactive controls use
        pointer-events-auto + no-drag in each column; rows use pointer-events-none so gaps hit this layer.
      */}
      {macElectron && (
        <div
          aria-hidden
          className={cn('fixed inset-x-0 top-0 z-[1] h-14', macDragDebugSurfaceClass(macElectron))}
          style={macTitlebarStyles.drag}
        />
      )}
      {/*
        Single sidebar column (always mounted) so width/opacity transitions run on every platform.
        macOS expanded: overlay slot (absolute). Otherwise: flex sibling. min-w-0 avoids flex
        min-content blocking the width animation.
      */}
      <div
        className={cn(
          'relative z-[2] flex min-h-0 min-w-0 shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]',
          sidebarOverlayActive
            ? 'pointer-events-none absolute inset-y-0 left-0 z-30'
            : '',
          sidebarHidden ? 'w-0 border-r-0' : 'w-[min(100%,320px)]',
          !sidebarHidden &&
            macElectron &&
            !sidebarOverlayActive &&
            'pointer-events-none box-border bg-background pb-2 pl-2 pr-1.5 pt-0'
        )}
        aria-hidden={sidebarHidden}
      >
        <div
          className={cn(
            'h-full min-h-0 min-w-0 w-full transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,transform]',
            sidebarHidden
              ? 'pointer-events-none -translate-x-2 opacity-0'
              : 'translate-x-0 opacity-100'
          )}
        >
          <div
            className={cn(
              'flex h-full min-h-0 min-w-0 flex-col',
              macElectron && !sidebarHidden && sidebarOverlayActive && 'box-border pb-2 pl-2 pr-1.5 pt-0'
            )}
          >
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col',
                (sidebarOverlayActive || (macElectron && !sidebarHidden)) &&
                  'pointer-events-auto h-full'
              )}
            >
              <NotesSidebar vm={vm} />
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'relative z-[2] min-h-0 min-w-0',
          sidebarOverlayActive ? 'absolute inset-0' : 'flex min-h-0 flex-1 flex-col'
        )}
      >
        <NotesMainArea vm={vm} />
      </div>
    </div>
  )
}

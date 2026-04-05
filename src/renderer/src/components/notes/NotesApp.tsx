import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import type { NotesAppProps } from './notes-app-types'
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
        'bg-background text-foreground overflow-hidden',
        sidebarOverlayActive ? 'relative h-screen w-full' : 'flex h-screen w-full flex-row'
      )}
    >
      {/*
        Single sidebar column (always mounted) so width/opacity transitions run on every platform.
        macOS expanded: overlay slot (absolute). Otherwise: flex sibling. min-w-0 avoids flex
        min-content blocking the width animation.
      */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]',
          sidebarOverlayActive
            ? 'pointer-events-none absolute inset-y-0 left-0 z-30'
            : 'relative',
          sidebarHidden ? 'w-0 border-r-0' : 'w-[min(100%,320px)]',
          !sidebarHidden && macElectron && !sidebarOverlayActive && 'box-border bg-background py-2 pl-2 pr-1.5'
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
              macElectron && !sidebarHidden && sidebarOverlayActive && 'box-border py-2 pl-2 pr-1.5'
            )}
          >
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col',
                sidebarOverlayActive && 'pointer-events-auto h-full'
              )}
            >
              <NotesSidebar vm={vm} />
            </div>
          </div>
        </div>
      </div>

      <NotesMainArea vm={vm} />
    </div>
  )
}

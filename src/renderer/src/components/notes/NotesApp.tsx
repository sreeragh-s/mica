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
      {!sidebarOverlayActive ? (
        <div
          className={cn(
            'shrink-0 transition-[width] duration-300 ease-in-out',
            sidebarHidden ? 'w-0 overflow-hidden border-r-0' : 'w-[min(100%,320px)] overflow-hidden',
            !sidebarHidden && !macElectron && 'border-sidebar-border border-r',
            !sidebarHidden && macElectron && 'relative box-border bg-background py-2 pl-2 pr-1.5'
          )}
          aria-hidden={sidebarHidden}
        >
          <NotesSidebar vm={vm} />
        </div>
      ) : null}

      <NotesMainArea vm={vm} />

      {sidebarOverlayActive ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-30 w-[min(100%,320px)] transition-[transform,opacity] duration-300 ease-in-out"
          aria-hidden={false}
        >
          <div className="box-border flex h-full min-h-0 flex-col py-2 pl-2 pr-1.5">
            <div className="pointer-events-auto flex h-full min-h-0 flex-1 flex-col">
              <NotesSidebar vm={vm} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

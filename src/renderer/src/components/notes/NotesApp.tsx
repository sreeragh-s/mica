import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import type { NotesAppProps } from './notes-app-types'
import { NotesMainArea } from './NotesMainArea'
import { NotesSidebar } from './NotesSidebar'
import { useNotesApp } from './useNotesApp'

export type { NotesAppProps } from './notes-app-types'

export function NotesApp(props: NotesAppProps): JSX.Element {
  const vm = useNotesApp(props)
  const { sidebarCollapsed } = vm
  return (
    <div className="bg-background text-foreground flex h-screen w-full flex-row overflow-hidden">
      <div
        className={cn(
          'border-sidebar-border shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out',
          sidebarCollapsed ? 'w-0 border-r-0' : 'w-[min(100%,320px)] border-r'
        )}
        aria-hidden={sidebarCollapsed}
      >
        <NotesSidebar vm={vm} />
      </div>
      <NotesMainArea vm={vm} />
    </div>
  )
}

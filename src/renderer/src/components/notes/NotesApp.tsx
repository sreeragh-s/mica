import type { JSX } from 'react'

import type { NotesAppProps } from './notes-app-types'
import { NotesMainArea } from './NotesMainArea'
import { NotesSidebar } from './NotesSidebar'
import { useNotesApp } from './useNotesApp'

export type { NotesAppProps } from './notes-app-types'

export function NotesApp(props: NotesAppProps): JSX.Element {
  const vm = useNotesApp(props)
  return (
    <div className="bg-background text-foreground flex h-screen w-full flex-row overflow-hidden">
      <NotesSidebar vm={vm} />
      <NotesMainArea vm={vm} />
    </div>
  )
}

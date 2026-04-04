import type { JSX } from 'react'

import { FileText, PenLine, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatNoteTime, type SavedNote, type WorkspaceFolder } from '@/lib/notes-storage'
import { cn } from '@/lib/utils'

export type WorkspaceNotesListProps = {
  folder: WorkspaceFolder
  notes: SavedNote[]
  onSelectNote: (noteId: string) => void
  onNewNote: () => void
  canCreateNote: boolean
}

export function WorkspaceNotesList({
  folder,
  notes,
  onSelectNote,
  onNewNote,
  canCreateNote,
}: WorkspaceNotesListProps): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-foreground truncate text-base font-semibold tracking-tight">
            {folder.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {notes.length === 0
              ? 'No notes yet in this workspace.'
              : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={onNewNote}
          disabled={!canCreateNote}
        >
          <Plus className="size-4" aria-hidden />
          New note
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {notes.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 px-4 py-16 text-center text-sm">
            <FileText className="size-12 opacity-35" aria-hidden />
            <p>Create your first note in this workspace.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={onNewNote}
              disabled={!canCreateNote}
            >
              <Plus className="size-4" aria-hidden />
              New note
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onSelectNote(note.id)}
                  className={cn(
                    'hover:bg-accent/70 focus-visible:ring-ring flex w-full items-start gap-2 rounded-lg px-3 py-3 text-left transition-colors',
                    'focus-visible:ring-2 focus-visible:outline-none'
                  )}
                >
                  {note.kind === 'drawing' ? (
                    <PenLine
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <FileText
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-foreground truncate font-medium leading-snug">
                      {note.title.trim() || 'Untitled'}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatNoteTime(note.updatedAt)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

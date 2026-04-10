"use client"

import type { JSX } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { isDrawingNote } from "@/features/notes/notes-app-utils"
import type { NotelabEditorContextValue } from "@/features/editor/notelab-editor-context"
import type { SavedNote } from "@/lib/notes/notes-storage"

export type NoteLinkPickerListProps = {
  noteSearch: string
  onNoteSearchChange: (value: string) => void
  linkableNotes: SavedNote[]
  notelabCtx: NotelabEditorContextValue
  onSelectNoteId: (notePath: string) => void
}

export function NoteLinkPickerList({
  noteSearch,
  onNoteSearchChange,
  linkableNotes,
  notelabCtx,
  onSelectNoteId,
}: NoteLinkPickerListProps): JSX.Element {
  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Search notes…"
        value={noteSearch}
        onValueChange={onNoteSearchChange}
      />
      <CommandList>
        <CommandEmpty>No notes match.</CommandEmpty>
        <CommandGroup heading="Workspace">
          {linkableNotes.map((note) => {
            const folderName =
              notelabCtx.folders.find((f) => f.folder === note.folder)?.name ??
              "Workspace"
            const label = note.title?.trim() || "Untitled"
            const kind = isDrawingNote(note) ? "Drawing" : "Note"
            return (
              <CommandItem
                key={note.path}
                value={note.path}
                keywords={[label, folderName, kind]}
                onSelect={() => onSelectNoteId(note.path)}
              >
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {kind} · {folderName}
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

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
import { isDrawingNote } from "@/components/notes/notes-app-utils"
import type { GitnotesEditorContextValue } from "@/components/editor/gitnotes-editor-context"
import type { SavedNote } from "@/lib/notes-storage"

export function filterLinkableNotes(
  ctx: GitnotesEditorContextValue,
  query: string,
  excludeNoteId?: string
): SavedNote[] {
  const q = query.trim().toLowerCase()
  return ctx.notes
    .filter((n) => n.id !== excludeNoteId)
    .filter((n) => {
      if (!q) return true
      const title = (n.title?.trim() || "Untitled").toLowerCase()
      return title.includes(q)
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export type NoteLinkPickerListProps = {
  noteSearch: string
  onNoteSearchChange: (value: string) => void
  linkableNotes: SavedNote[]
  gitnotesCtx: GitnotesEditorContextValue
  onSelectNoteId: (noteId: string) => void
}

export function NoteLinkPickerList({
  noteSearch,
  onNoteSearchChange,
  linkableNotes,
  gitnotesCtx,
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
              gitnotesCtx.folders.find((f) => f.id === note.folderId)?.name ??
              "Workspace"
            const label = note.title?.trim() || "Untitled"
            const kind = isDrawingNote(note) ? "Drawing" : "Note"
            return (
              <CommandItem
                key={note.id}
                value={note.id}
                keywords={[label, folderName, kind]}
                onSelect={() => onSelectNoteId(note.id)}
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

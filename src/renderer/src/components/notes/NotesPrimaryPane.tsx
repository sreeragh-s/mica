import type { JSX, DragEvent } from 'react'

import { FileText, Plus } from 'lucide-react'
import type { SerializedEditorState } from 'lexical'

import { Editor } from '@/components/blocks/editor-00/editor'
import { Button } from '@/components/ui/button'
import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'
import { ExcalidrawView } from './ExcalidrawView'
import { WorkspaceNotesList } from './WorkspaceNotesList'
import { NOTE_DRAG_MIME } from './notes-app-utils'

export type NotesPrimaryPaneProps = {
  selectedNote: SavedNote | null
  focusedFolder: WorkspaceFolder | null
  notes: SavedNote[]
  folders: WorkspaceFolder[]
  notesByFolder: Map<string, SavedNote[]>
  canCreateNote: boolean
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onNoteSerializedChange: (id: string, serialized: SerializedEditorState) => void
  onExcalidrawSceneChange: (id: string, json: string) => void
  onRenameNote: (id: string, title: string) => void
  onSetNoteCover: (id: string, src: string | null) => void
  onSetNoteTitleEmoji: (id: string, emoji: string | null) => void
  onDragOver?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  /** When set, editor bottom bar (stats + tools) is portaled into this element (e.g. below terminal). */
  bottomChromePortal?: HTMLElement | null
}

export function NotesPrimaryPane({
  selectedNote,
  focusedFolder,
  notes,
  folders,
  notesByFolder,
  canCreateNote,
  onSelectNote,
  onNewNote,
  onNoteSerializedChange,
  onExcalidrawSceneChange,
  onRenameNote,
  onSetNoteCover,
  onSetNoteTitleEmoji,
  onDragOver,
  onDrop,
  bottomChromePortal
}: NotesPrimaryPaneProps): JSX.Element {
  if (selectedNote) {
    if (selectedNote.kind === 'drawing') {
      return (
        <ExcalidrawView
          noteId={selectedNote.id}
          sceneJson={selectedNote.excalidrawScene ?? null}
          onSceneJsonChange={(json) => onExcalidrawSceneChange(selectedNote.id, json)}
        />
      )
    }
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <Editor
          key={selectedNote.id}
          editorSerializedState={selectedNote.content ?? undefined}
          onSerializedChange={(s) => onNoteSerializedChange(selectedNote.id, s)}
          className="min-h-0 flex-1"
          notelabEditor={{ notes, folders, currentNoteId: selectedNote.id, onOpenInternalNote: onSelectNote }}
          title={selectedNote.title}
          onTitleChange={(t) => onRenameNote(selectedNote.id, t)}
          coverImageSrc={selectedNote.kind === 'note' ? selectedNote.coverImageSrc : undefined}
          onCoverChange={(src) => onSetNoteCover(selectedNote.id, src)}
          titleEmoji={selectedNote.kind === 'note' ? selectedNote.titleEmoji : undefined}
          onTitleEmojiChange={(emoji) => onSetNoteTitleEmoji(selectedNote.id, emoji)}
          bottomChromePortal={bottomChromePortal}
        />
      </div>
    )
  }

  return (
    <div
      className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-sm"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <FileText className="size-14 opacity-30" aria-hidden />
      <p>Create a note to get started.</p>
      <Button type="button" onClick={onNewNote} disabled={!canCreateNote}>
        <Plus className="size-4" aria-hidden />
        Add note
      </Button>
    </div>
  )
}

/** Returns true if the drag event carries a note MIME type. */
export function isNoteDragEvent(e: DragEvent): boolean {
  return [...e.dataTransfer.types].includes(NOTE_DRAG_MIME)
}

/** Gets the note ID from a note drag event, or null. */
export function getNoteDragId(e: DragEvent): string | null {
  return e.dataTransfer.getData(NOTE_DRAG_MIME) || null
}

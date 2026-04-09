import type { JSX, DragEvent } from 'react'

import { FileText, Plus } from 'lucide-react'
import type { SerializedEditorState } from 'lexical'

import { Editor } from '@/components/blocks/editor-00/editor'
import { Button } from '@/components/ui/button'
import type { SavedNote, Folder } from '@/lib/notes/notes-storage'
import { ExcalidrawView } from '@/components/notes/views/ExcalidrawView'
import { NoteTitleInput } from '@/components/notes/editor-area/NoteTitleInput'
import { NotePropertiesPanel } from '@/components/notes/editor-area/NotePropertiesPanel'
import { NOTE_DRAG_MIME } from '@/components/notes/notes-app-utils'
import type { NotelabEditorSettingsV1 } from '@/lib/config/notelab-config-schema'

export type NotesPrimaryPaneProps = { 
  selectedNote: SavedNote | null
  focusedFolder: Folder | null
  notes: SavedNote[]
  folders: Folder[]
  notesByFolder: Map<string, SavedNote[]>
  canCreateNote: boolean
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onNoteSerializedChange: (id: string, serialized: SerializedEditorState) => void
  onExcalidrawSceneChange: (id: string, json: string) => void
  onRenameNote: (id: string, title: string) => void
  onSetNoteCover: (id: string, src: string | null) => void
  onSetNoteTitleEmoji: (id: string, emoji: string | null) => void
  onSetNoteProperty: (id: string, key: string, value: string | null) => void
  editorSettings: Required<NotelabEditorSettingsV1>
  onDragOver?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  /** When set, editor bottom bar (stats + tools) is portaled into this element (e.g. below terminal). */
  bottomChromePortal?: HTMLElement | null
}

export function NotesPrimaryPane({
  selectedNote,
  notes,
  folders,
  canCreateNote,
  onSelectNote,
  onNewNote,
  onNoteSerializedChange,
  onExcalidrawSceneChange,
  onRenameNote,
  onSetNoteCover,
  onSetNoteTitleEmoji,
  onSetNoteProperty,
  editorSettings,
  onDragOver,
  onDrop,
  bottomChromePortal
}: NotesPrimaryPaneProps): JSX.Element {
  if (selectedNote) {
    const allowCoverProperty =
      selectedNote.hasFrontmatterBlock || Boolean(selectedNote.coverImageSrc) || editorSettings.enableCoverProperty
    const allowEmojiProperty =
      selectedNote.hasFrontmatterBlock || Boolean(selectedNote.titleEmoji) || editorSettings.enableEmojiProperty
    if (selectedNote.kind === 'drawing') {
      return (
        <ExcalidrawView
          notePath={selectedNote.path}
          sceneJson={selectedNote.excalidrawScene ?? null}
          onSceneJsonChange={(json) => onExcalidrawSceneChange(selectedNote.path, json)}
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
          key={selectedNote.path}
          editorSerializedState={selectedNote.content ?? undefined}
          onSerializedChange={(s) => onNoteSerializedChange(selectedNote.path, s)}
          className="min-h-0 flex-1"
          notelabEditor={{ notes, folders, currentNoteId: selectedNote.path, onOpenInternalNote: onSelectNote }}
          header={
            <>
              <NoteTitleInput
                value={selectedNote.title}
                onChange={(title) => onRenameNote(selectedNote.path, title)}
              />
              <NotePropertiesPanel
                note={selectedNote}
                editorSettings={editorSettings}
                onSetProperty={(key, value) => onSetNoteProperty(selectedNote.path, key, value)}
              />
            </>
          }
          coverImageSrc={selectedNote.kind === 'note' ? selectedNote.coverImageSrc : undefined}
          onCoverChange={allowCoverProperty ? (src) => onSetNoteCover(selectedNote.path, src) : undefined}
          titleEmoji={selectedNote.kind === 'note' ? selectedNote.titleEmoji : undefined}
          onTitleEmojiChange={allowEmojiProperty ? (emoji) => onSetNoteTitleEmoji(selectedNote.path, emoji) : undefined}
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

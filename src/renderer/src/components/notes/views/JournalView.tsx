import type { DragEvent, JSX } from 'react'

import { NotesPrimaryPane } from '@/components/notes/editor-area/NotesPrimaryPane'
import type { NotesAppViewModel } from '@/components/notes/app-state/useNotesApp'

export type JournalViewProps = {
  vm: NotesAppViewModel
  selectedJournalNotePath: string | null
  bottomChromePortal?: HTMLElement | null
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

/** Daily journal layout: calendar lives in the main chrome; this pane is the note editor. */
export function JournalView({
  vm,
  selectedJournalNotePath,
  bottomChromePortal,
  onDragOver,
  onDrop
}: JournalViewProps): JSX.Element {
  const {
    focusedFolder,
    notes,
    folders,
    notesByFolder,
    canCreateNote,
    selectNote,
    handleNewNote,
    handleNoteSerializedChange,
    handleExcalidrawSceneChange,
    renameNote,
    setNoteCover,
    setNoteTitleEmoji,
    setNoteProperty,
    editorSettings,
    notesPropertyCatalog
  } = vm

  const selectedJournalNote =
    (selectedJournalNotePath
      ? notes.find((note) => note.path === selectedJournalNotePath) ?? null
      : null)

  return (
    <div className="flex min-h-0 flex-1 flex-col" onDragOver={onDragOver} onDrop={onDrop}>
      <NotesPrimaryPane
        selectedNote={selectedJournalNote}
        focusedFolder={focusedFolder}
        notes={notes}
        folders={folders}
        notesByFolder={notesByFolder}
        canCreateNote={canCreateNote}
        onSelectNote={selectNote}
        onNewNote={handleNewNote}
        onNoteSerializedChange={handleNoteSerializedChange}
        onExcalidrawSceneChange={handleExcalidrawSceneChange}
        onRenameNote={renameNote}
        onSetNoteCover={setNoteCover}
        onSetNoteTitleEmoji={setNoteTitleEmoji}
        onSetNoteProperty={setNoteProperty}
        editorSettings={editorSettings}
        propertyCatalog={notesPropertyCatalog}
        bottomChromePortal={bottomChromePortal}
      />
    </div>
  )
}

import type { JSX, DragEvent } from 'react'
import { useEffect, useRef } from 'react'

import { createElectronLogger } from '@/lib/core/electron-log'

const log = createElectronLogger('[SubpathScroll]')

import { FileText, Plus } from 'lucide-react'
import type { SerializedEditorState } from 'lexical'

import { Editor } from '@/components/blocks/editor-00/editor'
import { Button } from '@/components/ui/button'
import type { NotePropertyValue, SavedNote, Folder } from '@/lib/notes/notes-storage'
import { ExcalidrawView } from '@/components/notes/views/ExcalidrawView'
import { NoteTitleInput } from '@/components/notes/editor-area/NoteTitleInput'
import { NotePropertiesPanel } from '@/components/notes/editor-area/NotePropertiesPanel'
import { NOTE_DRAG_MIME } from '@/components/notes/notes-app-utils'
import type { NotelabEditorSettingsV1 } from '@/lib/config/notelab-config-schema'
import type { NotesPropertyCatalog } from '@/lib/notes/cache/notes-cache-types'

export type NotesPrimaryPaneProps = {
  selectedNote: SavedNote | null
  focusedFolder: Folder | null
  notes: SavedNote[]
  folders: Folder[]
  notesByFolder: Map<string, SavedNote[]>
  canCreateNote: boolean
  onSelectNote: (id: string, subpath?: string) => void
  onNewNote: () => void
  onNoteSerializedChange: (id: string, serialized: SerializedEditorState) => void
  onExcalidrawSceneChange: (id: string, json: string) => void
  onRenameNote: (id: string, title: string) => void
  onSetNoteCover: (id: string, src: string | null) => void
  onSetNoteTitleEmoji: (id: string, emoji: string | null) => void
  onSetNoteProperty: (id: string, key: string, value: NotePropertyValue | null) => void
  editorSettings: Required<NotelabEditorSettingsV1>
  /** Dexie-backed property catalog when the workspace notes cache has indexed. */
  propertyCatalog?: NotesPropertyCatalog | null
  onDragOver?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  /** When set, editor bottom bar (stats + tools) is portaled into this element (e.g. below terminal). */
  bottomChromePortal?: HTMLElement | null
  /** Property keys to hide from the properties panel UI (keys are kept on the note internally). */
  hiddenPropertyKeys?: Set<string>
  /**
   * Called once after note navigation to retrieve any pending subpath (e.g. `#my-heading`)
   * that should be scrolled to. Clears the pending value on first call.
   */
  consumePendingSubpath?: () => string | null
}

/**
 * Slugifies a heading the same way Obsidian does:
 * lowercase, collapse runs of non-alphanumeric characters to a single hyphen, trim hyphens.
 */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * After a note's editor mounts, scroll to the heading matching `subpath`.
 * Matches by slugifying both the subpath and the heading text content (Obsidian-style).
 */
export function scrollToHeading(editorRootEl: HTMLElement, subpath: string): void {
  const target = slugifyHeading(subpath.replace(/^#+/, '').trim())
  if (!target) return
  const headings = editorRootEl.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  const candidates = Array.from(headings).map((h) => slugifyHeading(h.textContent?.trim() ?? ''))
  log.info('scroll to heading:', target, '| candidates:', candidates)
  for (const heading of headings) {
    const text = heading.textContent?.trim() ?? ''
    if (slugifyHeading(text) === target) {
      log.info('matched heading:', text)
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
  log.warn('no heading matched for subpath:', subpath)
}

function NoteEditorView({
  selectedNote,
  notes,
  folders,
  onSelectNote,
  onNoteSerializedChange,
  onRenameNote,
  onSetNoteCover,
  onSetNoteTitleEmoji,
  onSetNoteProperty,
  editorSettings,
  propertyCatalog,
  onDragOver,
  onDrop,
  bottomChromePortal,
  hiddenPropertyKeys,
  consumePendingSubpath,
}: Omit<NotesPrimaryPaneProps, 'focusedFolder' | 'notesByFolder' | 'canCreateNote' | 'onNewNote' | 'onExcalidrawSceneChange'> & { selectedNote: SavedNote }): JSX.Element {
  const editorWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!consumePendingSubpath) return
    const subpath = consumePendingSubpath()
    if (!subpath) return
    // The editor DOM may not be painted yet — use a short rAF loop to wait.
    let attempts = 0
    const MAX_ATTEMPTS = 10
    const tryScroll = (): void => {
      const el = editorWrapperRef.current
      if (el) {
        scrollToHeading(el, subpath)
        return
      }
      if (++attempts < MAX_ATTEMPTS) requestAnimationFrame(tryScroll)
    }
    requestAnimationFrame(tryScroll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote.path])

  const allowCoverProperty =
    Boolean(selectedNote.coverImageSrc) ||
    editorSettings.enableCoverProperty ||
    editorSettings.newNotesStartWithFrontmatter ||
    selectedNote.hasFrontmatterBlock
  const allowEmojiProperty =
    Boolean(selectedNote.titleEmoji) ||
    editorSettings.enableEmojiProperty ||
    editorSettings.newNotesStartWithFrontmatter ||
    selectedNote.hasFrontmatterBlock

  return (
    <div
      ref={editorWrapperRef}
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <Editor
        key={selectedNote.path}
        editorSerializedState={selectedNote.content ?? undefined}
        onSerializedChange={(s) => onNoteSerializedChange(selectedNote.path, s)}
        className="min-h-0 flex-1"
        notelabEditor={{
          notes,
          folders,
          currentNoteId: selectedNote.path,
          onOpenInternalNote: (notePath, subpath) => {
            if (notePath === selectedNote.path && subpath && editorWrapperRef.current) {
              // Same-note subpath link — scroll immediately without re-navigating.
              scrollToHeading(editorWrapperRef.current, subpath)
            } else {
              onSelectNote(notePath, subpath)
            }
          },
        }}
        header={
          <>
            <NoteTitleInput
              value={selectedNote.title}
              onChange={(title) => onRenameNote(selectedNote.path, title)}
            />
            <NotePropertiesPanel
              note={selectedNote}
              notes={notes}
              editorSettings={editorSettings}
              propertyCatalog={propertyCatalog}
              onSetProperty={(key, value) => onSetNoteProperty(selectedNote.path, key, value)}
              hiddenPropertyKeys={hiddenPropertyKeys}
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
  propertyCatalog,
  onDragOver,
  onDrop,
  bottomChromePortal,
  hiddenPropertyKeys,
  consumePendingSubpath,
}: NotesPrimaryPaneProps): JSX.Element {
  if (selectedNote) {
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
      <NoteEditorView
        selectedNote={selectedNote}
        notes={notes}
        folders={folders}
        onSelectNote={onSelectNote}
        onNoteSerializedChange={onNoteSerializedChange}
        onRenameNote={onRenameNote}
        onSetNoteCover={onSetNoteCover}
        onSetNoteTitleEmoji={onSetNoteTitleEmoji}
        onSetNoteProperty={onSetNoteProperty}
        editorSettings={editorSettings}
        propertyCatalog={propertyCatalog}
        onDragOver={onDragOver}
        onDrop={onDrop}
        bottomChromePortal={bottomChromePortal}
        hiddenPropertyKeys={hiddenPropertyKeys}
        consumePendingSubpath={consumePendingSubpath}
      />
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

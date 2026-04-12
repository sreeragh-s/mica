import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from 'react'

import { format, startOfDay } from 'date-fns'

import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'
import { getNoteDragId, isNoteDragEvent } from '@/features/notes/editor-area/NotesPrimaryPane'
import { countIndexingStates } from '@/features/notes/editor-area/indexing-status'
import { NotesMainAreaLayout } from '@/features/notes/editor-area/layout'
import { buildPropertyCatalogFromNotes } from '@/lib/notes/note-properties/property-catalog'
import { JOURNAL_FOLDER_ID } from '@/lib/notes/notes-types'

export type NotesMainAreaProps = {
  vm: NotesAppViewModel
}

function getJournalNoteDate(note: NotesAppViewModel['notes'][number]): string | null {
  const propertyDate = note.properties?.date
  if (typeof propertyDate === 'string' && propertyDate.trim()) {
    return propertyDate.trim()
  }
  return null
}

export function NotesMainArea({ vm }: NotesMainAreaProps): JSX.Element {
  const {
    appMode,
    conflictViewPath,
    folders,
    notes,
    user,
    selectedNotePath,
    selectedNote,
    focusedFolder,
    notesByFolder,
    selectNote,
    consumePendingSubpath,
    handleNoteSerializedChange,
    handleNewNote,
    handleExcalidrawSceneChange,
    renameNote,
    setNoteCover,
    setNoteTitleEmoji,
    setNoteProperty,
    canCreateNote,
    editorSettings,
    graphViewOpen,
    journalViewOpen,
    zenMode,
    indexingStatus,
    chatSidebarOpen,
    toggleChatSidebar,
    pendingDeleteNote
  } = vm

  const propertyCatalog = useMemo(() => buildPropertyCatalogFromNotes(notes), [notes])

  const canAutoIndex = Boolean(user?.email || user?.name)

  const [zenHintVisible, setZenHintVisible] = useState(false)
  const [editorBottomBarEl, setEditorBottomBarEl] = useState<HTMLDivElement | null>(null)
  const [indexingOverlayDismissed, setIndexingOverlayDismissed] = useState(false)
  const [skipDeleteConfirmNextTime, setSkipDeleteConfirmNextTime] = useState(false)
  const pendingJournalDateRef = useRef<string | null>(null)
  const prevJournalViewOpenRef = useRef(false)
  const [journalTimelineDate, setJournalTimelineDate] = useState(() =>
    format(startOfDay(new Date()), 'yyyy-MM-dd')
  )
  const selectedJournalNote = useMemo(
    () =>
      notes.find(
        (note) =>
          note.folder === JOURNAL_FOLDER_ID && getJournalNoteDate(note) === journalTimelineDate
      ) ?? null,
    [notes, journalTimelineDate]
  )
  const selectedJournalNotePath = selectedJournalNote?.path ?? null

  const journalNoteDates = useMemo(() => {
    if (!journalViewOpen) return []
    return notes
      .filter((n) => n.folder === JOURNAL_FOLDER_ID && !n.isTransient)
      .map(getJournalNoteDate)
      .filter(Boolean) as string[]
  }, [notes, journalViewOpen])

  const handleJournalDateSelectWrapper = useCallback(
    (dateStr: string) => {
      pendingJournalDateRef.current = dateStr
      setJournalTimelineDate(dateStr)
      vm.handleJournalDateSelect(dateStr)
    },
    [vm]
  )

  useEffect(() => {
    if (!pendingDeleteNote) {
      queueMicrotask(() => setSkipDeleteConfirmNextTime(false))
    }
  }, [pendingDeleteNote])

  useEffect(() => {
    if (!journalViewOpen) {
      pendingJournalDateRef.current = null
      prevJournalViewOpenRef.current = false
      return
    }

    const justEnteredJournal = !prevJournalViewOpenRef.current
    prevJournalViewOpenRef.current = true

    const today = format(startOfDay(new Date()), 'yyyy-MM-dd')

    // Opening journal from the sidebar should land on today and create/select that entry.
    if (justEnteredJournal) {
      queueMicrotask(() => setJournalTimelineDate(today))
      pendingJournalDateRef.current = today
      vm.handleJournalDateSelect(today)
      return
    }

    const pendingJournalDate = pendingJournalDateRef.current
    if (pendingJournalDate) {
      const selectedNoteDate =
        selectedNote?.folder === JOURNAL_FOLDER_ID ? getJournalNoteDate(selectedNote) : null
      if (selectedNoteDate === pendingJournalDate) {
        pendingJournalDateRef.current = null
        return
      }
      vm.handleJournalDateSelect(pendingJournalDate)
      return
    }

    const selectionMatchesTimeline =
      selectedJournalNotePath != null && selectedNotePath === selectedJournalNotePath
    if (selectionMatchesTimeline) return

    vm.handleJournalDateSelect(journalTimelineDate)
  }, [
    journalTimelineDate,
    journalViewOpen,
    selectedJournalNotePath,
    selectedNotePath,
    selectedNote,
    vm
  ])

  useEffect(() => {
    if (!journalViewOpen || pendingJournalDateRef.current) return
    if (selectedNote?.folder !== JOURNAL_FOLDER_ID) return
    const selectedNoteDate = getJournalNoteDate(selectedNote)
    if (!selectedNoteDate || selectedNoteDate === journalTimelineDate) return
    queueMicrotask(() => setJournalTimelineDate(selectedNoteDate))
  }, [journalTimelineDate, journalViewOpen, selectedNote])

  const indexingOverlayPhase = (() => {
    const { notes: indexingNotes, running } = indexingStatus
    const { totalCount, pendingCount, errorCount } = countIndexingStates(indexingNotes)
    if (totalCount === 0 || (!running && pendingCount === 0 && errorCount === 0)) return 'idle'
    if (running) return 'running'
    if (errorCount > 0 && pendingCount === 0) return 'error'
    return 'pending'
  })()
  const previousIndexingOverlayPhaseRef = useRef(indexingOverlayPhase)

  useEffect(() => {
    if (!zenMode) {
      queueMicrotask(() => setZenHintVisible(false))
      return
    }
    const showId = window.setTimeout(() => setZenHintVisible(true), 0)
    const id = window.setTimeout(() => setZenHintVisible(false), 4500)
    return () => {
      clearTimeout(showId)
      clearTimeout(id)
    }
  }, [zenMode])

  useEffect(() => {
    if (
      indexingOverlayPhase !== 'idle' &&
      indexingOverlayPhase !== previousIndexingOverlayPhaseRef.current
    ) {
      queueMicrotask(() => setIndexingOverlayDismissed(false))
    }
    previousIndexingOverlayPhaseRef.current = indexingOverlayPhase
  }, [indexingOverlayPhase])

  useEffect(() => {
    if ((graphViewOpen || journalViewOpen) && chatSidebarOpen) {
      toggleChatSidebar()
    }
  }, [graphViewOpen, journalViewOpen, chatSidebarOpen, toggleChatSidebar])

  const onDragOverMain = useCallback((e: DragEvent) => {
    if (isNoteDragEvent(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const onDropPrimaryPane = useCallback(
    (e: DragEvent) => {
      const id = getNoteDragId(e)
      if (!id) return
      e.preventDefault()
      selectNote(id)
    },
    [selectNote]
  )

  const activeEditorNote = journalViewOpen ? selectedJournalNote : selectedNote
  const showEditorBottomChrome =
    !zenMode && appMode === 'notes' && !conflictViewPath && activeEditorNote?.kind === 'note'

  const primaryPaneProps = {
    selectedNote,
    focusedFolder,
    notes,
    folders,
    notesByFolder,
    canCreateNote,
    onSelectNote: selectNote,
    onNewNote: handleNewNote,
    onNoteSerializedChange: handleNoteSerializedChange,
    onExcalidrawSceneChange: handleExcalidrawSceneChange,
    onRenameNote: renameNote,
    onSetNoteCover: setNoteCover,
    onSetNoteTitleEmoji: setNoteTitleEmoji,
    onSetNoteProperty: setNoteProperty,
    editorSettings,
    onDragOver: onDragOverMain,
    onDrop: onDropPrimaryPane,
    bottomChromePortal: showEditorBottomChrome ? editorBottomBarEl : undefined,
    propertyCatalog: propertyCatalog,
    consumePendingSubpath
  }

  return (
    <NotesMainAreaLayout
      vm={vm}
      primaryPaneProps={primaryPaneProps}
      zenHintVisible={zenHintVisible}
      editorBottomBarEl={editorBottomBarEl}
      setEditorBottomBarEl={setEditorBottomBarEl}
      indexingOverlayDismissed={indexingOverlayDismissed}
      onIndexingOverlayDismiss={() => setIndexingOverlayDismissed(true)}
      skipDeleteConfirmNextTime={skipDeleteConfirmNextTime}
      onSkipDeleteConfirmNextTimeChange={setSkipDeleteConfirmNextTime}
      journalTimelineDate={journalTimelineDate}
      journalNoteDates={journalNoteDates}
      onJournalTimelineDateChange={handleJournalDateSelectWrapper}
      selectedJournalNotePath={selectedJournalNotePath}
      onDragOverMain={onDragOverMain}
      onDropPrimaryPane={onDropPrimaryPane}
      canAutoIndex={canAutoIndex}
      showEditorBottomChrome={showEditorBottomChrome}
    />
  )
}

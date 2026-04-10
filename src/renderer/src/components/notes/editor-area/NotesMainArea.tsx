import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from 'react'

import { format, startOfDay } from 'date-fns'
import { AlertCircleIcon, Loader2Icon, ScanTextIcon, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { enableInfinityCanvas } from '@/lib/core/vite-flags'
import { AccountSettingsView } from '@/components/notes/settings/AccountSettingsView'
import { AppearanceSettingsView } from '@/components/notes/settings/AppearanceSettingsView'
import { DebugSettingsView } from '@/components/notes/settings/DebugSettingsView'
import { EditorSettingsView } from '@/components/notes/settings/EditorSettingsView'
import { EmbeddingsSettingsView } from '@/components/notes/settings/EmbeddingsSettingsView'
import { GitHubSettingsView } from '@/components/notes/settings/GitHubSettingsView'
import { NotesCanvasView } from '@/components/notes/views/NotesCanvasView'
import { JournalView } from '@/components/notes/views/JournalView'
import { NotesConflictView } from '@/components/notes/views/NotesConflictView'
import { NotesGraphView } from '@/components/notes/views/NotesGraphView'
import { NotesChatSidebar } from '@/components/notes/chat/NotesChatSidebar'
import {
  NotesPrimaryPane,
  getNoteDragId,
  isNoteDragEvent
} from '@/components/notes/editor-area/NotesPrimaryPane'
import { NotesTabOverview } from '@/components/notes/views/NotesTabOverview'
import { GraphPaneTopBar } from '@/components/notes/layout/GraphPaneTopBar'
import { NotesMainTopBar } from '@/components/notes/layout/NotesMainTopBar'
import { ShortcutsSettingsView } from '@/components/notes/settings/ShortcutsSettingsView'
import type { NotesAppViewModel } from '@/components/notes/app-state/useNotesApp'
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

function MainAreaIndexingOverlay({
  indexingStatus,
  onDismiss
}: {
  indexingStatus: NotesAppViewModel['indexingStatus']
  onDismiss: () => void
}): JSX.Element | null {
  const { notes, running } = indexingStatus
  const totalCount = notes.length
  const pendingCount = notes.filter((note) => note.state === 'pending').length
  const indexingCount = notes.filter((note) => note.state === 'indexing').length
  const indexedCount = notes.filter((note) => note.state === 'indexed').length
  const errorCount = notes.filter((note) => note.state === 'error').length

  if (totalCount === 0 || (!running && pendingCount === 0 && errorCount === 0)) {
    return null
  }

  const processedCount = totalCount - pendingCount - indexingCount
  const progressPercent =
    totalCount > 0 ? Math.max(0, Math.min(100, Math.round((processedCount / totalCount) * 100))) : 0
  const noteLabel = (count: number): string => `${count} note${count === 1 ? '' : 's'}`

  let title = 'Preparing note index'
  let detail = `${noteLabel(pendingCount)} pending`
  let containerClassName = 'border-border/80 bg-background/95 text-foreground'
  let progressClassName = 'bg-primary'
  let Icon = ScanTextIcon

  if (running) {
    title = 'Indexing notes for chat'
    detail =
      indexingCount > 0
        ? `${processedCount} of ${totalCount} done, ${noteLabel(indexingCount)} in progress`
        : `${processedCount} of ${totalCount} done`
    Icon = Loader2Icon
  } else if (errorCount > 0 && pendingCount === 0) {
    title = 'Indexing finished with errors'
    detail = `${noteLabel(errorCount)} failed, ${indexedCount} indexed`
    containerClassName = 'border-destructive/30 bg-background/95 text-foreground'
    progressClassName = 'bg-destructive'
    Icon = AlertCircleIcon
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 top-0 z-20 flex justify-center">
      <div
        className={cn(
          'pointer-events-auto mt-3 w-full max-w-sm rounded-xl border shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85',
          containerClassName
        )}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          <Icon
            className={cn(
              'mt-0.5 size-4 shrink-0',
              running && 'animate-spin',
              errorCount > 0 && !running ? 'text-destructive' : 'text-primary'
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-none">{title}</p>
            <p className="text-muted-foreground mt-1 text-xs leading-snug">{detail}</p>
            <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
              <div
                className={cn('h-full rounded-full transition-all duration-300', progressClassName)}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 size-7 shrink-0"
            aria-label="Dismiss indexing status"
            onClick={onDismiss}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function NotesMainArea({ vm }: NotesMainAreaProps): JSX.Element {
  const {
    isMacNotelab,
    macTitlebarStyles,
    appMode,
    settingsSection,
    dirtyByWorkspaceId,
    githubRemoteUrl,
    gitToolbarFolder,
    refreshWorkspaceGitStatuses,
    folders,
    notes,
    notesCount,
    user,
    guestMode,
    onSignOut,
    onConnectGitHub,
    selectedNotePath,
    selectedNote,
    focusedFolder,
    notesByFolder,
    selectNote,
    openNoteTabPaths,
    reorderOpenNoteTabs,
    closeNoteTab,
    sidebarCollapsed,
    toggleSidebar,
    handleNoteSerializedChange,
    handleNewNote,
    handleExcalidrawSceneChange,
    renameNote,
    setNoteCover,
    setNoteTitleEmoji,
    setNoteProperty,
    canCreateNote,
    shortcutBindings,
    editorSettings,
    setEditorSettings,
    appearanceSettings,
    setAppearanceSettings,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    setShortcutsCaptureActive,
    graphViewOpen,
    closeGraphView,
    canvasViewOpen,
    closeCanvasView,
    journalViewOpen,
    zenMode,
    tabOverviewOpen,
    openTabOverview,
    closeTabOverview,
    indexingStatus,
    refreshIndexingStatus,
    runIndexPending,
    runReindexAll,
    dataRootPath,
    conflictViewPath,
    workspaceRoot,
    handleWorkspaceRootChange,
    chatSidebarOpen,
    toggleChatSidebar,
    chatSidebarPanel,
    chatSidebarLinkMode,
    openLinkedNotesSidebar,
    notesPropertyCatalog,
    notesLinkMentionIndex,
    rebuildNotesSearchCacheFromFilesystem,
    notesCacheIndexedAt,
    clearWorkspaceCache
  } = vm

  const canAutoIndex = Boolean(user?.email || user?.name) && !guestMode

  const [zenHintVisible, setZenHintVisible] = useState(false)
  const [editorBottomBarEl, setEditorBottomBarEl] = useState<HTMLDivElement | null>(null)
  const [indexingOverlayDismissed, setIndexingOverlayDismissed] = useState(false)
  const pendingJournalDateRef = useRef<string | null>(null)
  const [journalTimelineDate, setJournalTimelineDate] = useState(() =>
    format(startOfDay(new Date()), 'yyyy-MM-dd')
  )
  const selectedJournalNote = useMemo(
    () =>
      notes.find(
        (note) => note.folder === JOURNAL_FOLDER_ID && getJournalNoteDate(note) === journalTimelineDate
      ) ?? null,
    [notes, journalTimelineDate]
  )
  const selectedJournalNotePath = selectedJournalNote?.path ?? null

  // Compute available journal dates for the timeline ruler
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
    if (!journalViewOpen) {
      pendingJournalDateRef.current = null
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
    if (!selectedJournalNotePath || selectedNotePath === selectedJournalNotePath) return
    vm.handleJournalDateSelect(journalTimelineDate)
  }, [
    journalTimelineDate,
    journalViewOpen,
    selectedJournalNotePath,
    selectedNotePath,
    vm
  ])

  useEffect(() => {
    if (!journalViewOpen || pendingJournalDateRef.current) return
    if (selectedNote?.folder !== JOURNAL_FOLDER_ID) return
    const selectedNoteDate = getJournalNoteDate(selectedNote)
    if (!selectedNoteDate || selectedNoteDate === journalTimelineDate) return
    setJournalTimelineDate(selectedNoteDate)
  }, [journalTimelineDate, journalViewOpen, selectedNote])

  const indexingOverlayPhase = (() => {
    const { notes, running } = indexingStatus
    const pendingCount = notes.filter((note) => note.state === 'pending').length
    const errorCount = notes.filter((note) => note.state === 'error').length

    if (notes.length === 0 || (!running && pendingCount === 0 && errorCount === 0)) return 'idle'
    if (running) return 'running'
    if (errorCount > 0 && pendingCount === 0) return 'error'
    return 'pending'
  })()
  const previousIndexingOverlayPhaseRef = useRef(indexingOverlayPhase)

  useEffect(() => {
    if (!zenMode) {
      setZenHintVisible(false)
      return
    }
    setZenHintVisible(true)
    const id = window.setTimeout(() => setZenHintVisible(false), 4500)
    return () => clearTimeout(id)
  }, [zenMode])

  useEffect(() => {
    if (
      indexingOverlayPhase !== 'idle' &&
      indexingOverlayPhase !== previousIndexingOverlayPhaseRef.current
    ) {
      setIndexingOverlayDismissed(false)
    }
    previousIndexingOverlayPhaseRef.current = indexingOverlayPhase
  }, [indexingOverlayPhase])

  // Close chat sidebar when graph or journal view opens
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
    propertyCatalog: notesPropertyCatalog
  }

  // --- Notes area content ---
  const notesContent = (() => {
    if (appMode !== 'notes') return null

    // Conflict view takes over the main area when a conflict file is open
    if (conflictViewPath) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <NotesConflictView vm={vm} />
        </div>
      )
    }

    // Zen mode: no note selected
    if (zenMode && (!selectedNote || selectedNote.kind === 'drawing')) {
      return (
        <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm">
          Exiting zen mode…
        </div>
      )
    }

    // Zen mode: full-screen editor (sidebar hidden; reserve same space as sidebar row for native traffic lights)
    if (zenMode && selectedNote && selectedNote.kind !== 'drawing') {
      return (
        <div
          className={cn('relative flex min-h-0 flex-1 flex-col', isMacNotelab && 'pl-[92px]')}
          onDragOver={onDragOverMain}
          onDrop={onDropPrimaryPane}
        >
          {isMacNotelab && <div className="h-12 shrink-0 pointer-events-none" aria-hidden />}
          {zenHintVisible && (
            <div
              className="pointer-events-none absolute left-0 right-0 top-3 z-10 flex justify-center px-4"
              role="status"
              aria-live="polite"
            >
              <div className="bg-muted/95 text-muted-foreground border-border pointer-events-auto rounded-md border px-3 py-2 text-center text-xs shadow-md">
                Double-press Esc to exit zen mode
              </div>
            </div>
          )}
          <NotesPrimaryPane {...primaryPaneProps} />
        </div>
      )
    }

    if (journalViewOpen) {
      return (
        <JournalView
          vm={vm}
          selectedJournalNotePath={selectedJournalNotePath}
          bottomChromePortal={showEditorBottomChrome ? editorBottomBarEl : undefined}
          onDragOver={onDragOverMain}
          onDrop={onDropPrimaryPane}
        />
      )
    }

    // Canvas view (full-screen infinite canvas with live editor/excalidraw nodes)
    if (enableInfinityCanvas && canvasViewOpen) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <NotesCanvasView
            notes={notes}
            folders={folders}
            isMacNotelab={isMacNotelab}
            macTitlebarStyles={macTitlebarStyles}
            onSelectNote={selectNote}
            onClose={closeCanvasView}
            onNoteSerializedChange={handleNoteSerializedChange}
            onExcalidrawSceneChange={handleExcalidrawSceneChange}
            onRenameNote={renameNote}
            onSetNoteCover={setNoteCover}
            onSetNoteTitleEmoji={setNoteTitleEmoji}
          />
        </div>
      )
    }

    // Graph only (no note selected)
    if (graphViewOpen && !selectedNote) {
      return (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={onDragOverMain}
          onDrop={onDropPrimaryPane}
        >
          <NotesGraphView
            notes={notes}
            folders={folders}
            isMacNotelab={isMacNotelab}
            macTitlebarStyles={macTitlebarStyles}
            onSelectNote={selectNote}
          />
        </div>
      )
    }

    // Graph side-by-side with editor or excalidraw
    if (graphViewOpen && selectedNote) {
      return (
        <div className="flex min-h-0 flex-1 flex-row">
          <div className="border-border flex min-h-0 min-w-0 flex-1 flex-col border-r">
            <GraphPaneTopBar
              title={selectedNote.title.trim() || 'Untitled'}
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
              onClose={closeGraphView}
            />
            <NotesPrimaryPane {...primaryPaneProps} />
          </div>
          <div className="border-border flex min-h-0 w-[min(100%,50%)] min-w-0 flex-1 flex-col border-l">
            <GraphPaneTopBar
              title="Note graph"
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
              onClose={closeGraphView}
            />
            <NotesGraphView
              notes={notes}
              folders={folders}
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
              onSelectNote={selectNote}
              embedded
            />
          </div>
        </div>
      )
    }

    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        onDragOver={onDragOverMain}
        onDrop={onDropPrimaryPane}
      >
        <NotesPrimaryPane {...primaryPaneProps} />
      </div>
    )
  })()

  const showNotes = appMode === 'notes'
  const showJournalTimeline = showNotes && journalViewOpen
  const showTabs = showNotes && openNoteTabPaths.length > 0 && !journalViewOpen
  const showNotesChatChrome = showNotes && !zenMode

  return (
    <div
      className={cn(
        'bg-background flex min-h-0 min-w-0 flex-1 flex-col',
        isMacNotelab && 'pointer-events-none'
      )}
    >
      {/*
        Do not set no-drag on <main>: Electron applies it to the whole surface and kills the fixed
        titlebar drag layer underneath. Use pointer-events-none here and pointer-events-auto on
        scroll/interactive regions only so empty chrome passes through to NotesApp’s drag strip.
      */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <div className="flex min-h-0 min-w-0 flex-1 flex-row">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!zenMode && (
                  <NotesMainTopBar
                    isMacNotelab={isMacNotelab}
                    macTitlebarStyles={macTitlebarStyles}
                    sidebarCollapsed={sidebarCollapsed}
                    onToggleSidebar={toggleSidebar}
                    showJournalTimeline={showJournalTimeline}
                    journalTimelineDate={journalTimelineDate}
                    onJournalTimelineDateChange={handleJournalDateSelectWrapper}
                    availableDates={journalNoteDates}
                    showTabs={showTabs}
                    openNoteTabPaths={openNoteTabPaths}
                    notes={notes}
                    selectedNotePath={selectedNotePath}
                    reorderOpenNoteTabs={reorderOpenNoteTabs}
                    closeNoteTab={closeNoteTab}
                    selectNote={selectNote}
                    showNotesToolbar={showNotes}
                    onOpenTabOverview={openTabOverview}
                    onNewNote={handleNewNote}
                    chatSidebarOpen={chatSidebarOpen}
                    onToggleChatSidebar={toggleChatSidebar}
                    linkSidebarActive={chatSidebarOpen && chatSidebarPanel === 'links'}
                    onOpenLinkedSidebar={openLinkedNotesSidebar}
                  />
                )}

                <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Main content — re-enable hits below the titlebar chrome (tabs are pointer-events-none). */}
              <div className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
                {/*
              Mounts first in DOM so the editor can portal the bottom bar (stats + tools) here.
              flex order: editor (1), terminal (2), bottom bar (3).
            */}
                {showEditorBottomChrome ? (
                  <div
                    ref={setEditorBottomBarEl}
                    className="bg-background order-3 min-h-10 shrink-0"
                  />
                ) : null}
                <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
                  {appMode === 'notes' && canAutoIndex && !indexingOverlayDismissed && (
                    <MainAreaIndexingOverlay
                      indexingStatus={indexingStatus}
                      onDismiss={() => setIndexingOverlayDismissed(true)}
                    />
                  )}
                  {appMode === 'settings' && settingsSection === 'account' ? (
                    <AccountSettingsView
                      user={user}
                      guestMode={guestMode}
                      onSignOut={onSignOut}
                      onConnectGitHub={onConnectGitHub}
                      isMacNotelab={isMacNotelab}
                      macTitlebarStyles={macTitlebarStyles}
                    />
                  ) : appMode === 'settings' &&
                    (settingsSection === 'workspace' || settingsSection === 'github') ? (
                    <GitHubSettingsView
                      isMacNotelab={isMacNotelab}
                      macTitlebarStyles={macTitlebarStyles}
                      workspaceRoot={workspaceRoot}
                      onWorkspaceRootChange={handleWorkspaceRootChange}
                    />
                  ) : appMode === 'settings' && settingsSection === 'appearance' ? (
                    <AppearanceSettingsView
                      isMacNotelab={isMacNotelab}
                      macTitlebarStyles={macTitlebarStyles}
                      settings={appearanceSettings}
                      onChange={setAppearanceSettings}
                    />
                  ) : appMode === 'settings' && settingsSection === 'editor' ? (
                    <EditorSettingsView
                      isMacNotelab={isMacNotelab}
                      macTitlebarStyles={macTitlebarStyles}
                      settings={editorSettings}
                      onChange={setEditorSettings}
                    />
                  ) : appMode === 'settings' && settingsSection === 'shortcuts' ? (
                    <ShortcutsSettingsView
                      isMacNotelab={isMacNotelab}
                      macTitlebarStyles={macTitlebarStyles}
                      bindings={shortcutBindings}
                      onChangeBinding={updateShortcutBinding}
                      onResetAll={resetShortcutsToDefaults}
                      onCaptureModeChange={setShortcutsCaptureActive}
                    />
                  ) : appMode === 'settings' && settingsSection === 'debug' ? (
                    <DebugSettingsView
                      isMacNotelab={isMacNotelab}
                      macTitlebarStyles={macTitlebarStyles}
                      workspacePath={dataRootPath}
                      localGitPath={gitToolbarFolder?.localGitPath ?? null}
                      githubRemoteUrl={githubRemoteUrl}
                      foldersCount={folders.length}
                      notesCount={notesCount}
                      dirtyByWorkspaceId={dirtyByWorkspaceId}
                      onRefreshGitStatus={() => void refreshWorkspaceGitStatuses()}
                      notesCacheIndexedAt={notesCacheIndexedAt}
                      onRebuildNotesSearchCacheFromFilesystem={rebuildNotesSearchCacheFromFilesystem}
                      onClearNotesSearchCache={clearWorkspaceCache}
                    />
                  ) : appMode === 'settings' && settingsSection === 'indexing' ? (
                    <EmbeddingsSettingsView
                      isMacNotelab={isMacNotelab}
                      macTitlebarStyles={macTitlebarStyles}
                      workspacePath={dataRootPath}
                      guestMode={guestMode}
                      isLoggedIn={Boolean(user?.email || user?.name)}
                      indexingStatus={indexingStatus}
                      refreshIndexingStatus={refreshIndexingStatus}
                      runIndexPending={runIndexPending}
                      runReindexAll={runReindexAll}
                    />
                  ) : appMode === 'notes' ? (
                    notesContent
                  ) : null}
                </div>
              </div>
                </div>
              </div>
            {showNotesChatChrome && (
              <NotesChatSidebar
                open={chatSidebarOpen}
                notes={notes}
                folders={folders}
                workspacePath={dataRootPath}
                canAutoIndex={Boolean(user?.email || user?.name) && !guestMode}
                indexingStatus={indexingStatus}
                runIndexPending={runIndexPending}
                selectedNote={selectedNote}
                selectNote={selectNote}
                panel={chatSidebarPanel}
                linkMode={chatSidebarLinkMode}
                onLinkModeChange={vm.setChatSidebarLinkMode}
                isMacNotelab={isMacNotelab}
                linkMentionIndex={notesLinkMentionIndex}
              />
            )}
            </div>
          </div>
        </div>
      </main>

      {tabOverviewOpen && (
        <NotesTabOverview
          notes={notes}
          folders={folders}
          openNoteTabPaths={openNoteTabPaths}
          selectedNotePath={selectedNotePath}
          macTitlebarStyles={macTitlebarStyles}
          isMacNotelab={isMacNotelab}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          onClose={closeTabOverview}
          onSelectNote={(id) => {
            selectNote(id)
            closeTabOverview()
          }}
          onNewNote={handleNewNote}
          onCloseTab={closeNoteTab}
        />
      )}
    </div>
  )
}

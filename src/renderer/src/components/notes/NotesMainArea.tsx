import { useCallback, useEffect, useState, type DragEvent, type JSX } from 'react'

import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { enableInfinityCanvas } from '@/lib/vite-flags'
import { AccountSettingsView } from './AccountSettingsView'
import { AppearanceSettingsView } from './AppearanceSettingsView'
import { DebugSettingsView } from './DebugSettingsView'
import { EmbeddingsSettingsView } from './EmbeddingsSettingsView'
import { GitHubSettingsView } from './GitHubSettingsView'
import { NotesCanvasView } from './NotesCanvasView'
import { NotesConflictView } from './NotesConflictView'
import { NotesGraphView } from './NotesGraphView'
import { NotesChatSidebar } from './NotesChatSidebar'
import { NoteTabStrip } from './NoteTabStrip'
import { NotesPrimaryPane, getNoteDragId, isNoteDragEvent } from './NotesPrimaryPane'
import { NotesSearchBar } from './NotesSearchBar'
import { NotesTabOverview } from './NotesTabOverview'
import { NotesToolbarPill } from './NotesToolbarPill'
import { ShortcutsSettingsView } from './ShortcutsSettingsView'
import type { NotesAppViewModel } from './useNotesApp'

export type NotesMainAreaProps = {
  vm: NotesAppViewModel
}

function GraphPaneTopBar({
  title,
  isMacNotelab,
  macTitlebarStyles,
  onClose
}: {
  title: string
  isMacNotelab: boolean
  macTitlebarStyles: NotesAppViewModel['macTitlebarStyles']
  onClose: () => void
}): JSX.Element {
  return (
    <div
      className="border-border grid h-10 shrink-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center px-3"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        aria-label="Close graph panel"
        onClick={onClose}
      >
        <X className="size-4" aria-hidden />
      </Button>
      <span className="text-foreground min-w-0 truncate px-1 text-center text-sm font-medium" title={title}>
        {title}
      </span>
      <span className="block w-full shrink-0" aria-hidden />
    </div>
  )
}

export function NotesMainArea({ vm }: NotesMainAreaProps): JSX.Element {
  const {
    isMacNotelab,
    nativeLiquidGlassAttached,
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
    selectedId,
    selectedNote,
    focusedFolder,
    notesByFolder,
    selectNote,
    openNoteTabIds,
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
    canCreateNote,
    shortcutBindings,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    setShortcutsCaptureActive,
    graphViewOpen,
    closeGraphView,
    canvasViewOpen,
    closeCanvasView,
    zenMode,
    sidebarOverlayActive,
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
  } = vm

  const [zenHintVisible, setZenHintVisible] = useState(false)
  const [editorBottomBarEl, setEditorBottomBarEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!zenMode) {
      setZenHintVisible(false)
      return
    }
    setZenHintVisible(true)
    const id = window.setTimeout(() => setZenHintVisible(false), 4500)
    return () => clearTimeout(id)
  }, [zenMode])

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

  const showEditorBottomChrome =
    !zenMode &&
    appMode === 'notes' &&
    !conflictViewPath &&
    selectedNote?.kind === 'note'

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
    onDragOver: onDragOverMain,
    onDrop: onDropPrimaryPane,
    bottomChromePortal: showEditorBottomChrome ? editorBottomBarEl : undefined
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

    // Graph only (no note or drawing selected)
    if (graphViewOpen && (!selectedNote || selectedNote.kind === 'drawing')) {
      return (
        <div className="flex min-h-0 flex-1 flex-col" onDragOver={onDragOverMain} onDrop={onDropPrimaryPane}>
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

    // Graph side-by-side with editor
    if (graphViewOpen && selectedNote && selectedNote.kind !== 'drawing') {
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
      <div className="flex min-h-0 flex-1 flex-col" onDragOver={onDragOverMain} onDrop={onDropPrimaryPane}>
        <NotesPrimaryPane {...primaryPaneProps} />
      </div>
    )
  })()

  const showNotes = appMode === 'notes'
  const showTabs = showNotes && openNoteTabIds.length > 0
  const showNotesChatChrome = showNotes && !zenMode

  return (
    <div
      className={cn(
        'bg-background flex min-h-0 min-w-0 flex-col',
        sidebarOverlayActive ? 'absolute inset-0 z-0' : 'flex-1',
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
        <div
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-row bg-background',
            sidebarOverlayActive && 'pl-[min(100%,360px)]'
          )}
        >
          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">
          {!zenMode && (
            <div
              className={cn(
                'bg-background relative z-10 flex shrink-0 flex-col',
                isMacNotelab && 'pointer-events-none'
              )}
            >
              {/* Search bar row */}
              {showNotes ? (
                <NotesSearchBar
                  notes={notes}
                  folders={folders}
                  onSelectNote={selectNote}
                  macTitlebarStyles={macTitlebarStyles}
                  sidebarOverlayActive={sidebarOverlayActive}
                  isMacNotelab={isMacNotelab}
                  nativeLiquidGlassAttached={nativeLiquidGlassAttached}
                  sidebarCollapsed={sidebarCollapsed}
                  toggleSidebar={toggleSidebar}
                />
              ) : (
                <div
                  className={cn(
                    'h-12 shrink-0',
                    sidebarOverlayActive && 'pr-1.5',
                    isMacNotelab && 'pointer-events-none'
                  )}
                  aria-hidden
                />
              )}

              {/* Tab strip row */}
              <div
                className={cn(
                  'flex min-h-0 w-full min-w-0 shrink-0 items-center py-1.5',
                  !sidebarOverlayActive && isMacNotelab && sidebarCollapsed && 'pl-[92px]',
                  isMacNotelab && 'pointer-events-none'
                )}
              >
                {showTabs ? (
                  <NoteTabStrip
                    openNoteTabIds={openNoteTabIds}
                    notes={notes}
                    selectedId={selectedId}
                    reorderOpenNoteTabs={reorderOpenNoteTabs}
                    closeNoteTab={closeNoteTab}
                    selectNote={selectNote}
                    isMacNotelab={isMacNotelab}
                    macTitlebarStyles={macTitlebarStyles}
                  />
                ) : (
                  <div className="min-h-8 min-w-0 flex-1" aria-hidden />
                )}
              </div>
            </div>
          )}

          {/* Main content — re-enable hits below the titlebar chrome (search/tabs are pointer-events-none). */}
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
            {appMode === 'settings' && settingsSection === 'account' ? (
              <AccountSettingsView
                user={user}
                guestMode={guestMode}
                onSignOut={onSignOut}
                onConnectGitHub={onConnectGitHub}
                isMacNotelab={isMacNotelab}
                macTitlebarStyles={macTitlebarStyles}
              />
            ) : appMode === 'settings' && (settingsSection === 'workspace' || settingsSection === 'github') ? (
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
              isMacNotelab={isMacNotelab}
              sidebarOverlayActive={sidebarOverlayActive}
            />
          )}
          {/* After chat in DOM + z-index above chat: open chat uses transform layers that stack above earlier siblings. */}
          {showNotes && !zenMode && (
            <div
              className={cn(
                'pointer-events-auto absolute z-[100] flex h-12 items-center',
                sidebarOverlayActive ? 'right-1.5' : 'right-2',
                'top-0'
              )}
              style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
            >
              <NotesToolbarPill
                isMacNotelab={isMacNotelab}
                macTitlebarStyles={macTitlebarStyles}
                nativeLiquidGlassAttached={nativeLiquidGlassAttached}
                onOpenTabOverview={openTabOverview}
                onNewNote={handleNewNote}
                chatSidebarOpen={chatSidebarOpen}
                onToggleChatSidebar={toggleChatSidebar}
              />
            </div>
          )}
        </div>
        </div>
      </main>

      {tabOverviewOpen && (
        <NotesTabOverview
          notes={notes}
          folders={folders}
          openNoteTabIds={openNoteTabIds}
          selectedId={selectedId}
          macTitlebarStyles={macTitlebarStyles}
          isMacNotelab={isMacNotelab}
          sidebarOverlayActive={sidebarOverlayActive}
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

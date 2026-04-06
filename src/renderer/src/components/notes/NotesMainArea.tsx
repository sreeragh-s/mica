import { useCallback, useEffect, useState, type DragEvent, type JSX } from 'react'

import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AccountSettingsView } from './AccountSettingsView'
import { AppearanceSettingsView } from './AppearanceSettingsView'
import { DebugSettingsView } from './DebugSettingsView'
import { EmbeddingsSettingsView } from './EmbeddingsSettingsView'
import { GitHubSettingsView } from './GitHubSettingsView'
import { NotesGraphView } from './NotesGraphView'
import { NotesChatSidebar } from './NotesChatSidebar'
import { NoteTabStrip } from './NoteTabStrip'
import { NotesPrimaryPane, getNoteDragId, isNoteDragEvent } from './NotesPrimaryPane'
import { NotesSearchBar } from './NotesSearchBar'
import { NotesTabOverview } from './NotesTabOverview'
import { NotesToolbarPill } from './NotesToolbarPill'
import { ShortcutsSettingsView } from './ShortcutsSettingsView'
import { WorkspaceSettingsPanel } from './WorkspaceSettingsPanel'
import type { NotesAppViewModel } from './useNotesApp'

export type NotesMainAreaProps = {
  vm: NotesAppViewModel
}

function GraphPaneTopBar({
  title,
  macElectron,
  macTitlebarStyles,
  onClose
}: {
  title: string
  macElectron: boolean
  macTitlebarStyles: NotesAppViewModel['macTitlebarStyles']
  onClose: () => void
}): JSX.Element {
  return (
    <div
      className="border-border grid h-10 shrink-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center px-3"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
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
    macElectron,
    nativeLiquidGlassAttached,
    macTitlebarStyles,
    appMode,
    settingsSection,
    dirtyByWorkspaceId,
    gitCommitMessage,
    setGitCommitMessage,
    gitSyncBusy,
    gitSyncError,
    handleGitCommit,
    handleGitPull,
    handleGitPullThenPush,
    handleGitPush,
    handleGitCommitAndPush,
    githubRemoteUrl,
    setGithubRemoteUrl,
    handleSaveGithubRemote,
    handleApplyGithubRemote,
    gitHubBusy,
    gitHubMessage,
    gitToolbarFolder,
    gitDirtyGlobal,
    syncTransport,
    primaryGitFolderId,
    refreshWorkspaceGitStatuses,
    folders,
    notes,
    notesCount,
    workspaceSettingsFolder,
    workspaceSettingsFolderId,
    workspaceSettingsCanDelete,
    renameWorkspace,
    deleteWorkspace,
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
    zenMode,
    sidebarOverlayActive,
    tabOverviewOpen,
    openTabOverview,
    closeTabOverview,
    indexingStatus,
    refreshIndexingStatus,
    runIndexPending,
    runReindexAll
  } = vm

  const [zenHintVisible, setZenHintVisible] = useState(false)
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)

  const toggleChatSidebar = useCallback(() => {
    setChatSidebarOpen((open) => !open)
  }, [])

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
    onDrop: onDropPrimaryPane
  }

  // --- Notes area content ---
  const notesContent = (() => {
    if (appMode !== 'notes' || workspaceSettingsFolderId) return null

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
          className={cn('relative flex min-h-0 flex-1 flex-col', macElectron && 'pl-[92px]')}
          onDragOver={onDragOverMain}
          onDrop={onDropPrimaryPane}
        >
          {macElectron && <div className="h-12 shrink-0 pointer-events-none" aria-hidden />}
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

    // Graph only (no note or drawing selected)
    if (graphViewOpen && (!selectedNote || selectedNote.kind === 'drawing')) {
      return (
        <div className="flex min-h-0 flex-1 flex-col" onDragOver={onDragOverMain} onDrop={onDropPrimaryPane}>
          <NotesGraphView
            notes={notes}
            folders={folders}
            macElectron={macElectron}
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
              macElectron={macElectron}
              macTitlebarStyles={macTitlebarStyles}
              onClose={closeGraphView}
            />
            <NotesPrimaryPane {...primaryPaneProps} />
          </div>
          <div className="border-border flex min-h-0 w-[min(100%,50%)] min-w-0 flex-1 flex-col border-l">
            <GraphPaneTopBar
              title="Note graph"
              macElectron={macElectron}
              macTitlebarStyles={macTitlebarStyles}
              onClose={closeGraphView}
            />
            <NotesGraphView
              notes={notes}
              folders={folders}
              macElectron={macElectron}
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
  const showTabs = showNotes && !workspaceSettingsFolderId && openNoteTabIds.length > 0
  /** Same scope as toolbar + search: main notes surface only (not settings, workspace settings, or zen). */
  const showNotesChatChrome = showNotes && !workspaceSettingsFolderId && !zenMode

  return (
    <div
      className={cn(
        'bg-background flex min-h-0 min-w-0 flex-col',
        sidebarOverlayActive ? 'absolute inset-0 z-0' : 'flex-1',
        macElectron && 'pointer-events-none'
      )}
    >
      {/*
        Do not set no-drag on <main>: Electron applies it to the whole surface and kills the fixed
        titlebar drag layer underneath. Use pointer-events-none here and pointer-events-auto on
        scroll/interactive regions only so empty chrome passes through to NotesApp’s drag strip.
      */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        <div
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-row bg-background',
            sidebarOverlayActive && 'pl-[min(100%,320px)]'
          )}
        >
          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">
          {!zenMode && (
            <div
              className={cn(
                'bg-background relative z-10 flex shrink-0 flex-col',
                macElectron && 'pointer-events-none'
              )}
            >
              {/* Search bar row */}
              {showNotes && !workspaceSettingsFolderId ? (
                <NotesSearchBar
                  notes={notes}
                  folders={folders}
                  onSelectNote={selectNote}
                  macTitlebarStyles={macTitlebarStyles}
                  sidebarOverlayActive={sidebarOverlayActive}
                  macElectron={macElectron}
                  nativeLiquidGlassAttached={nativeLiquidGlassAttached}
                  sidebarCollapsed={sidebarCollapsed}
                  toggleSidebar={toggleSidebar}
                />
              ) : (
                <div
                  className={cn(
                    'h-12 shrink-0',
                    sidebarOverlayActive && 'pr-1.5',
                    macElectron && 'pointer-events-none'
                  )}
                  aria-hidden
                />
              )}

              {/* Tab strip row */}
              <div
                className={cn(
                  'flex min-h-0 w-full min-w-0 shrink-0 items-center py-1.5',
                  !sidebarOverlayActive && macElectron && sidebarCollapsed && 'pl-[92px]',
                  macElectron && 'pointer-events-none'
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
                    macElectron={macElectron}
                    macTitlebarStyles={macTitlebarStyles}
                  />
                ) : (
                  <div className="min-h-8 min-w-0 flex-1" aria-hidden />
                )}
              </div>
            </div>
          )}

          {/* Main content — re-enable hits below the titlebar chrome (search/tabs are pointer-events-none). */}
          <div className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
            {workspaceSettingsFolderId && workspaceSettingsFolder ? (
              <WorkspaceSettingsPanel
                key={workspaceSettingsFolderId}
                folder={workspaceSettingsFolder}
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
                onRename={(name) => renameWorkspace(workspaceSettingsFolderId, name)}
                canDelete={workspaceSettingsCanDelete}
                onDeleteWorkspace={() => deleteWorkspace(workspaceSettingsFolderId)}
              />
            ) : appMode === 'settings' && settingsSection === 'account' ? (
              <AccountSettingsView
                user={user}
                guestMode={guestMode}
                onSignOut={onSignOut}
                onConnectGitHub={onConnectGitHub}
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
              />
            ) : appMode === 'settings' && settingsSection === 'github' ? (
              <GitHubSettingsView
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
                syncTransport={syncTransport}
                folders={folders}
                githubRemoteUrl={githubRemoteUrl}
                setGithubRemoteUrl={setGithubRemoteUrl}
                onSaveRemote={handleSaveGithubRemote}
                onApplyRemote={handleApplyGithubRemote}
                gitHubBusy={gitHubBusy}
                gitHubMessage={gitHubMessage}
                gitToolbarFolder={gitToolbarFolder}
                gitDirtyGlobal={gitDirtyGlobal}
                gitCommitMessage={gitCommitMessage}
                setGitCommitMessage={setGitCommitMessage}
                gitSyncBusy={gitSyncBusy}
                gitSyncError={gitSyncError}
                primaryGitFolderId={primaryGitFolderId}
                onGitCommit={handleGitCommit}
                onGitPull={handleGitPull}
                onGitPullThenPush={handleGitPullThenPush}
                onGitPush={handleGitPush}
                onGitCommitAndPush={handleGitCommitAndPush}
              />
            ) : appMode === 'settings' && settingsSection === 'appearance' ? (
              <AppearanceSettingsView
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
              />
            ) : appMode === 'settings' && settingsSection === 'shortcuts' ? (
              <ShortcutsSettingsView
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
                bindings={shortcutBindings}
                onChangeBinding={updateShortcutBinding}
                onResetAll={resetShortcutsToDefaults}
                onCaptureModeChange={setShortcutsCaptureActive}
              />
            ) : appMode === 'settings' && settingsSection === 'debug' ? (
              <DebugSettingsView
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
                localGitPath={gitToolbarFolder?.localGitPath ?? null}
                githubRemoteUrl={githubRemoteUrl}
                foldersCount={folders.length}
                notesCount={notesCount}
                dirtyByWorkspaceId={dirtyByWorkspaceId}
                onRefreshGitStatus={() => void refreshWorkspaceGitStatuses()}
              />
            ) : appMode === 'settings' && settingsSection === 'indexing' ? (
              <EmbeddingsSettingsView
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
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
          {showNotesChatChrome && (
            <NotesChatSidebar
              open={chatSidebarOpen}
              notes={notes}
              folders={folders}
              selectedNote={selectedNote}
              selectNote={selectNote}
              macElectron={macElectron}
              sidebarOverlayActive={sidebarOverlayActive}
            />
          )}
          {/* After chat in DOM + z-index above chat: open chat uses transform layers that stack above earlier siblings. */}
          {showNotes && !workspaceSettingsFolderId && !zenMode && (
            <div
              className={cn(
                'pointer-events-auto absolute z-[100] flex h-12 items-center',
                sidebarOverlayActive ? 'right-1.5' : 'right-2',
                'top-0'
              )}
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
            >
              <NotesToolbarPill
                macElectron={macElectron}
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
      </main>

      {tabOverviewOpen && (
        <NotesTabOverview
          notes={notes}
          folders={folders}
          openNoteTabIds={openNoteTabIds}
          selectedId={selectedId}
          macTitlebarStyles={macTitlebarStyles}
          macElectron={macElectron}
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

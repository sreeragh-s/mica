import { lazy, Suspense, useMemo, type DragEvent, type JSX } from 'react'

import { AlertCircleIcon, Loader2Icon, ScanTextIcon, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { enableInfinityCanvas } from '@/lib/core/vite-flags'
import { AppSidebar } from '@/features/notes/chat/AppSidebar'
import { NotesPrimaryPane } from '@/features/notes/editor-area/NotesPrimaryPane'
import type { NotesPrimaryPaneProps } from '@/features/notes/editor-area/NotesPrimaryPane'
import type { OpenNoteTab } from '@/features/notes/editor-area/NoteTabStrip'
import { GraphPaneTopBar } from '@/features/notes/layout/GraphPaneTopBar'
import { NotesMainTopBar } from '@/features/notes/layout/NotesMainTopBar'
import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'
import { buildLinkIndexFromNotes } from '@/lib/ai/chat-retrieval-pipeline'
import { countIndexingStates } from '@/features/notes/editor-area/indexing-status'

const AccountSettingsView = lazy(async () => ({
  default: (await import('@/features/notes/settings/AccountSettingsView')).AccountSettingsView
}))
const AppearanceSettingsView = lazy(async () => ({
  default: (await import('@/features/notes/settings/AppearanceSettingsView')).AppearanceSettingsView
}))
const DebugSettingsView = lazy(async () => ({
  default: (await import('@/features/notes/settings/DebugSettingsView')).DebugSettingsView
}))
const EditorSettingsView = lazy(async () => ({
  default: (await import('@/features/notes/settings/EditorSettingsView')).EditorSettingsView
}))
const EmbeddingsSettingsView = lazy(async () => ({
  default: (await import('@/features/notes/settings/EmbeddingsSettingsView')).EmbeddingsSettingsView
}))
const GitHubSettingsView = lazy(async () => ({
  default: (await import('@/features/notes/settings/GitHubSettingsView')).GitHubSettingsView
}))
const JournalView = lazy(async () => ({
  default: (await import('@/features/notes/views/JournalView')).JournalView
}))
const NotesCanvasView = lazy(async () => ({
  default: (await import('@/features/notes/views/NotesCanvasView')).NotesCanvasView
}))
const NotesConflictView = lazy(async () => ({
  default: (await import('@/features/notes/views/NotesConflictView')).NotesConflictView
}))
const NotesGraphView = lazy(async () => ({
  default: (await import('@/features/notes/views/NotesGraphView')).NotesGraphView
}))
const NotesTabOverview = lazy(async () => ({
  default: (await import('@/features/notes/views/NotesTabOverview')).NotesTabOverview
}))
const ShortcutsSettingsView = lazy(async () => ({
  default: (await import('@/features/notes/settings/ShortcutsSettingsView')).ShortcutsSettingsView
}))

function LazyPaneFallback(): JSX.Element {
  return <div className="bg-background flex min-h-0 flex-1" aria-hidden />
}

function MainAreaIndexingOverlay({
  indexingStatus,
  onDismiss
}: {
  indexingStatus: NotesAppViewModel['indexingStatus']
  onDismiss: () => void
}): JSX.Element | null {
  const { notes, running } = indexingStatus
  const { totalCount, pendingCount, indexingCount, indexedCount, errorCount } =
    countIndexingStates(notes)

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

function NotesMainNotesContent({
  vm,
  primaryPaneProps,
  zenHintVisible,
  onDragOverMain,
  onDropPrimaryPane,
  showEditorBottomChrome,
  editorBottomBarEl,
  selectedJournalNotePath
}: {
  vm: NotesAppViewModel
  primaryPaneProps: NotesPrimaryPaneProps
  zenHintVisible: boolean
  onDragOverMain: (e: DragEvent) => void
  onDropPrimaryPane: (e: DragEvent) => void
  showEditorBottomChrome: boolean
  editorBottomBarEl: HTMLDivElement | null
  selectedJournalNotePath: string | null
}): JSX.Element | null {
  const {
    appMode,
    conflictViewPath,
    zenMode,
    selectedNote,
    isMacNotelab,
    macTitlebarStyles,
    notes,
    folders,
    selectNote,
    handleNoteSerializedChange,
    handleExcalidrawSceneChange,
    renameNote,
    setNoteCover,
    setNoteTitleEmoji,
    journalViewOpen,
    canvasViewOpen,
    closeCanvasView,
    graphViewOpen,
    closeGraphView
  } = vm

  if (appMode !== 'notes') return null

  if (conflictViewPath) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<LazyPaneFallback />}>
          <NotesConflictView vm={vm} />
        </Suspense>
      </div>
    )
  }

  if (zenMode && (!selectedNote || selectedNote.kind === 'drawing')) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm">
        Exiting zen mode…
      </div>
    )
  }

  const showSingleColumnPrimaryPane =
    !journalViewOpen && !(enableInfinityCanvas && canvasViewOpen) && !graphViewOpen

  if (showSingleColumnPrimaryPane) {
    // Keep a stable flex tree (spacer + pane) so toggling zen does not remount NotesPrimaryPane / Lexical.
    const zenActive = zenMode && !!selectedNote && selectedNote.kind !== 'drawing'
    return (
      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col',
          zenActive && isMacNotelab && 'pl-[92px]'
        )}
        onDragOver={onDragOverMain}
        onDrop={onDropPrimaryPane}
      >
        <div
          className={cn(
            'shrink-0 pointer-events-none',
            zenActive && isMacNotelab ? 'h-12' : 'h-0 min-h-0 overflow-hidden'
          )}
          aria-hidden
        />
        {zenActive && zenHintVisible ? (
          <div
            className="pointer-events-none absolute left-0 right-0 top-3 z-10 flex justify-center px-4"
            role="status"
            aria-live="polite"
          >
            <div className="bg-muted/95 text-muted-foreground border-border pointer-events-auto rounded-md border px-3 py-2 text-center text-xs shadow-md">
              Double-press Esc to exit zen mode
            </div>
          </div>
        ) : null}
        <NotesPrimaryPane {...primaryPaneProps} />
      </div>
    )
  }

  if (journalViewOpen) {
    return (
      <Suspense fallback={<LazyPaneFallback />}>
        <JournalView
          vm={vm}
          selectedJournalNotePath={selectedJournalNotePath}
          bottomChromePortal={showEditorBottomChrome ? editorBottomBarEl : undefined}
          onDragOver={onDragOverMain}
          onDrop={onDropPrimaryPane}
        />
      </Suspense>
    )
  }

  if (enableInfinityCanvas && canvasViewOpen) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<LazyPaneFallback />}>
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
        </Suspense>
      </div>
    )
  }

  if (graphViewOpen && !selectedNote) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        onDragOver={onDragOverMain}
        onDrop={onDropPrimaryPane}
      >
        <Suspense fallback={<LazyPaneFallback />}>
          <NotesGraphView
            notes={notes}
            folders={folders}
            isMacNotelab={isMacNotelab}
            macTitlebarStyles={macTitlebarStyles}
            onSelectNote={selectNote}
          />
        </Suspense>
      </div>
    )
  }

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
          <Suspense fallback={<LazyPaneFallback />}>
            <NotesGraphView
              notes={notes}
              folders={folders}
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
              onSelectNote={selectNote}
              embedded
            />
          </Suspense>
        </div>
      </div>
    )
  }

  return null
}

export type NotesMainAreaLayoutProps = {
  vm: NotesAppViewModel
  primaryPaneProps: NotesPrimaryPaneProps
  zenHintVisible: boolean
  editorBottomBarEl: HTMLDivElement | null
  setEditorBottomBarEl: (el: HTMLDivElement | null) => void
  indexingOverlayDismissed: boolean
  onIndexingOverlayDismiss: () => void
  skipDeleteConfirmNextTime: boolean
  onSkipDeleteConfirmNextTimeChange: (value: boolean) => void
  journalTimelineDate: string
  journalNoteDates: string[]
  onJournalTimelineDateChange: (dateStr: string) => void
  selectedJournalNotePath: string | null
  onDragOverMain: (e: DragEvent) => void
  onDropPrimaryPane: (e: DragEvent) => void
  canAutoIndex: boolean
  showEditorBottomChrome: boolean
}

export function NotesMainAreaLayout({
  vm,
  primaryPaneProps,
  zenHintVisible,
  editorBottomBarEl,
  setEditorBottomBarEl,
  indexingOverlayDismissed,
  onIndexingOverlayDismiss,
  skipDeleteConfirmNextTime,
  onSkipDeleteConfirmNextTimeChange,
  journalTimelineDate,
  journalNoteDates,
  onJournalTimelineDateChange,
  selectedJournalNotePath,
  onDragOverMain,
  onDropPrimaryPane,
  canAutoIndex,
  showEditorBottomChrome
}: NotesMainAreaLayoutProps): JSX.Element {
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
    selectNote,
    openNoteTabPaths,
    reorderOpenNoteTabs,
    closeNoteTab,
    sidebarCollapsed,
    toggleSidebar,
    handleNewNote,
    shortcutBindings,
    editorSettings,
    setEditorSettings,
    appearanceSettings,
    setAppearanceSettings,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    setShortcutsCaptureActive,
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
    workspaceRoot,
    handleWorkspaceRootChange,
    chatSidebarOpen,
    toggleChatSidebar,
    chatSidebarPanel,
    openLinkedNotesSidebar,
    pendingDeleteNote,
    cancelDeleteNoteConfirmation,
    confirmDeleteNote
  } = vm

  const linkMentionIndex = useMemo(() => buildLinkIndexFromNotes(notes), [notes])

  const showNotes = appMode === 'notes'
  const showJournalTimeline = showNotes && journalViewOpen
  const showTabs = showNotes && openNoteTabPaths.length > 0 && !journalViewOpen
  const showChatSidebarChrome = showNotes && !zenMode
  const openTabs = useMemo<OpenNoteTab[]>(() => {
    if (openNoteTabPaths.length === 0) return []

    const remainingPaths = new Set(openNoteTabPaths)
    const noteByPath = new Map<string, OpenNoteTab>()

    for (const note of notes) {
      if (!remainingPaths.has(note.path)) continue
      noteByPath.set(note.path, {
        path: note.path,
        title: note.title,
        kind: note.kind
      })
      remainingPaths.delete(note.path)
      if (remainingPaths.size === 0) break
    }

    return openNoteTabPaths.flatMap((path) => {
      const tab = noteByPath.get(path)
      return tab ? [tab] : []
    })
  }, [notes, openNoteTabPaths])

  return (
    <div
      className={cn(
        'bg-background flex min-h-0 min-w-0 flex-1 flex-col',
        isMacNotelab && 'pointer-events-none'
      )}
    >
      <Dialog
        open={Boolean(pendingDeleteNote)}
        onOpenChange={(open) => {
          if (!open) cancelDeleteNoteConfirmation()
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete note?</DialogTitle>
            <DialogDescription>
              {pendingDeleteNote
                ? `Delete "${pendingDeleteNote.title}" permanently from this workspace?`
                : 'Delete this note permanently from this workspace?'}
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={skipDeleteConfirmNextTime}
              onChange={(event) => onSkipDeleteConfirmNextTimeChange(event.target.checked)}
            />
            <span className="text-muted-foreground">
              Don&apos;t ask again. You can change this later in Editor Settings.
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelDeleteNoteConfirmation}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => confirmDeleteNote({ dontAskAgain: skipDeleteConfirmNextTime })}
            >
              Delete note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    onJournalTimelineDateChange={onJournalTimelineDateChange}
                    availableDates={journalNoteDates}
                    showTabs={showTabs}
                    openTabs={openTabs}
                    selectedNotePath={selectedNotePath}
                    reorderOpenNoteTabs={reorderOpenNoteTabs}
                    closeNoteTab={closeNoteTab}
                    selectNote={selectNote}
                    showNotesToolbar={showNotes}
                    onOpenTabOverview={openTabOverview}
                    onNewNote={handleNewNote}
                    chatSidebarOpen={chatSidebarOpen}
                    onToggleChatSidebar={toggleChatSidebar}
                    onOpenLinkedSidebar={openLinkedNotesSidebar}
                    chatSidebarPanel={chatSidebarPanel}
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
                          onDismiss={onIndexingOverlayDismiss}
                        />
                      )}
                      {appMode === 'settings' && settingsSection === 'account' ? (
                        <Suspense fallback={<LazyPaneFallback />}>
                          <AccountSettingsView
                            user={user}
                            guestMode={guestMode}
                            onSignOut={onSignOut}
                            onConnectGitHub={onConnectGitHub}
                            isMacNotelab={isMacNotelab}
                            macTitlebarStyles={macTitlebarStyles}
                          />
                        </Suspense>
                      ) : appMode === 'settings' &&
                        (settingsSection === 'workspace' || settingsSection === 'github') ? (
                        <Suspense fallback={<LazyPaneFallback />}>
                          <GitHubSettingsView
                            isMacNotelab={isMacNotelab}
                            macTitlebarStyles={macTitlebarStyles}
                            workspaceRoot={workspaceRoot}
                            onWorkspaceRootChange={handleWorkspaceRootChange}
                          />
                        </Suspense>
                      ) : appMode === 'settings' && settingsSection === 'appearance' ? (
                        <Suspense fallback={<LazyPaneFallback />}>
                          <AppearanceSettingsView
                            isMacNotelab={isMacNotelab}
                            macTitlebarStyles={macTitlebarStyles}
                            settings={appearanceSettings}
                            onChange={setAppearanceSettings}
                          />
                        </Suspense>
                      ) : appMode === 'settings' && settingsSection === 'editor' ? (
                        <Suspense fallback={<LazyPaneFallback />}>
                          <EditorSettingsView
                            isMacNotelab={isMacNotelab}
                            macTitlebarStyles={macTitlebarStyles}
                            settings={editorSettings}
                            onChange={setEditorSettings}
                          />
                        </Suspense>
                      ) : appMode === 'settings' && settingsSection === 'shortcuts' ? (
                        <Suspense fallback={<LazyPaneFallback />}>
                          <ShortcutsSettingsView
                            isMacNotelab={isMacNotelab}
                            macTitlebarStyles={macTitlebarStyles}
                            bindings={shortcutBindings}
                            onChangeBinding={updateShortcutBinding}
                            onResetAll={resetShortcutsToDefaults}
                            onCaptureModeChange={setShortcutsCaptureActive}
                          />
                        </Suspense>
                      ) : appMode === 'settings' && settingsSection === 'debug' ? (
                        <Suspense fallback={<LazyPaneFallback />}>
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
                        </Suspense>
                      ) : appMode === 'settings' && settingsSection === 'indexing' ? (
                        <Suspense fallback={<LazyPaneFallback />}>
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
                        </Suspense>
                      ) : appMode === 'notes' ? (
                        <NotesMainNotesContent
                          vm={vm}
                          primaryPaneProps={primaryPaneProps}
                          zenHintVisible={zenHintVisible}
                          onDragOverMain={onDragOverMain}
                          onDropPrimaryPane={onDropPrimaryPane}
                          showEditorBottomChrome={showEditorBottomChrome}
                          editorBottomBarEl={editorBottomBarEl}
                          selectedJournalNotePath={selectedJournalNotePath}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              {showChatSidebarChrome && (
                <AppSidebar
                  open={chatSidebarOpen}
                  notes={notes}
                  folders={folders}
                  workspacePath={dataRootPath}
                  canAutoIndex={Boolean(user?.email || user?.name) && !guestMode}
                  indexingStatus={indexingStatus}
                  runIndexPending={runIndexPending}
                  selectedNote={vm.selectedNote}
                  selectNote={selectNote}
                  panel={chatSidebarPanel}
                  linkMode={vm.chatSidebarLinkMode}
                  onLinkModeChange={vm.setChatSidebarLinkMode}
                  isMacNotelab={isMacNotelab}
                  linkMentionIndex={linkMentionIndex}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {tabOverviewOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  )
}

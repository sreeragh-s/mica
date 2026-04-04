import { useCallback, useEffect, useState, type DragEvent, type JSX } from 'react'

import { FileText, PanelLeftOpen, PenLine, Plus, X } from 'lucide-react'

import { Editor } from '@/components/blocks/editor-00/editor'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AccountSettingsView } from './AccountSettingsView'
import { AppearanceSettingsView } from './AppearanceSettingsView'
import { DebugSettingsView } from './DebugSettingsView'
import { GitHubSettingsView } from './GitHubSettingsView'
import { ShortcutsSettingsView } from './ShortcutsSettingsView'
import { WorkspaceNotesList } from './WorkspaceNotesList'
import { WorkspaceSettingsPanel } from './WorkspaceSettingsPanel'
import { ExcalidrawView } from './ExcalidrawView'
import { NotesGraphView } from './NotesGraphView'
import { NotesSearchBar } from './NotesSearchBar'
import { NOTE_DRAG_MIME } from './notes-app-utils'
import type { NotesAppViewModel } from './useNotesApp'

export type NotesMainAreaProps = {
  vm: NotesAppViewModel
}

function SplitPaneTopBar({
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
      <div className="flex items-center justify-start">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="Close split view"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <span
        className="text-foreground min-w-0 truncate px-1 text-center text-sm font-medium"
        title={title}
      >
        {title}
      </span>
      <span className="block w-full shrink-0" aria-hidden />
    </div>
  )
}

export function NotesMainArea({ vm }: NotesMainAreaProps): JSX.Element {
  const {
    macElectron,
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
    renameWorkspace,
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
    closeNoteTab,
    sidebarCollapsed,
    toggleSidebar,
    handleNoteSerializedChange,
    handleNewNote,
    handleExcalidrawSceneChange,
    canCreateNote,
    splitViewOpen,
    splitNote,
    closeSplitView,
    openSplitWithNote,
    shortcutBindings,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    setShortcutsCaptureActive,
    graphViewOpen,
    closeGraphView,
    zenMode,
    sidebarOverlayActive
  } = vm

  const [splitDropActive, setSplitDropActive] = useState(false)
  const [zenHintVisible, setZenHintVisible] = useState(false)
  useEffect(() => {
    if (!zenMode) {
      setZenHintVisible(false)
      return
    }
    setZenHintVisible(true)
    const id = window.setTimeout(() => setZenHintVisible(false), 4500)
    return () => clearTimeout(id)
  }, [zenMode])

  const acceptNoteDrag = useCallback((e: DragEvent) => {
    return [...e.dataTransfer.types].includes(NOTE_DRAG_MIME)
  }, [])

  const onDragOverMain = useCallback(
    (e: DragEvent) => {
      if (acceptNoteDrag(e)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    },
    [acceptNoteDrag]
  )

  const onDropMain = useCallback(
    (e: DragEvent) => {
      const id = e.dataTransfer.getData(NOTE_DRAG_MIME)
      if (id) {
        e.preventDefault()
        openSplitWithNote(id)
      }
    },
    [openSplitWithNote]
  )

  const onDragOverSplitPane = useCallback(
    (e: DragEvent) => {
      if (acceptNoteDrag(e)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setSplitDropActive(true)
      }
    },
    [acceptNoteDrag]
  )

  const onDragLeaveSplitPane = useCallback(() => {
    setSplitDropActive(false)
  }, [])

  const onDropSplitPane = useCallback(
    (e: DragEvent) => {
      setSplitDropActive(false)
      const id = e.dataTransfer.getData(NOTE_DRAG_MIME)
      if (id) {
        e.preventDefault()
        openSplitWithNote(id)
      }
    },
    [openSplitWithNote]
  )

  const onGraphSelectNote = useCallback(
    (noteId: string) => {
      selectNote(noteId)
    },
    [selectNote]
  )

  const notesMainInner = (() => {
    if (
      appMode === 'notes' &&
      !workspaceSettingsFolderId &&
      graphViewOpen &&
      (!selectedNote || selectedNote.kind === 'drawing')
    ) {
      return (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={onDragOverMain}
          onDrop={onDropMain}
        >
          <NotesGraphView
            notes={notes}
            folders={folders}
            macElectron={macElectron}
            macTitlebarStyles={macTitlebarStyles}
            onSelectNote={onGraphSelectNote}
          />
        </div>
      )
    }

    if (
      appMode === 'notes' &&
      !workspaceSettingsFolderId &&
      zenMode &&
      (!selectedNote || selectedNote.kind === 'drawing')
    ) {
      return (
        <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm">
          Exiting zen mode…
        </div>
      )
    }

    if (
      appMode === 'notes' &&
      !workspaceSettingsFolderId &&
      zenMode &&
      selectedNote &&
      selectedNote.kind !== 'drawing'
    ) {
      return (
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          onDragOver={onDragOverMain}
          onDrop={onDropMain}
        >
          {zenHintVisible ? (
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
          <Editor
            key={selectedNote.id}
            editorSerializedState={selectedNote.content ?? undefined}
            onSerializedChange={(s) => handleNoteSerializedChange(selectedNote.id, s)}
            className="min-h-0 flex-1"
            gitnotesEditor={{
              notes,
              folders,
              currentNoteId: selectedNote.id,
              onOpenInternalNote: selectNote,
            }}
          />
        </div>
      )
    }

    if (appMode === 'notes' && !workspaceSettingsFolderId) {
      const primaryColumn = selectedNote ? (
        selectedNote.kind === 'drawing' ? (
          <ExcalidrawView
            noteId={selectedNote.id}
            sceneJson={selectedNote.excalidrawScene ?? null}
            onSceneJsonChange={(json) =>
              handleExcalidrawSceneChange(selectedNote.id, json)
            }
          />
        ) : (
          <Editor
            key={selectedNote.id}
            editorSerializedState={selectedNote.content ?? undefined}
            onSerializedChange={(s) => handleNoteSerializedChange(selectedNote.id, s)}
            className="min-h-0 flex-1"
            gitnotesEditor={{
              notes,
              folders,
              currentNoteId: selectedNote.id,
              onOpenInternalNote: selectNote,
            }}
          />
        )
      ) : focusedFolder ? (
        <WorkspaceNotesList
          folder={focusedFolder}
          notes={notesByFolder.get(focusedFolder.id) ?? []}
          onSelectNote={selectNote}
          onNewNote={handleNewNote}
          canCreateNote={canCreateNote}
        />
      ) : (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-sm">
          <FileText className="size-14 opacity-30" aria-hidden />
          <p>Select a workspace or create a note to get started.</p>
          <Button type="button" onClick={handleNewNote} disabled={!canCreateNote}>
            <Plus className="size-4" aria-hidden />
            New note
          </Button>
        </div>
      )

      if (graphViewOpen && selectedNote && selectedNote.kind !== 'drawing') {
        const primaryBarTitle = selectedNote.title.trim() || 'Untitled'
        return (
          <div className="flex min-h-0 flex-1 flex-row">
            <div className="border-border flex min-h-0 min-w-0 flex-1 flex-col border-r">
              <SplitPaneTopBar
                title={primaryBarTitle}
                macElectron={macElectron}
                macTitlebarStyles={macTitlebarStyles}
                onClose={closeGraphView}
              />
              <div
                className="flex min-h-0 flex-1 flex-col"
                onDragOver={onDragOverMain}
                onDrop={onDropMain}
              >
                {primaryColumn}
              </div>
            </div>
            <div className="border-border flex min-h-0 w-[min(100%,50%)] min-w-0 flex-1 flex-col border-l">
              <SplitPaneTopBar
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
                onSelectNote={onGraphSelectNote}
                embedded
              />
            </div>
          </div>
        )
      }

      if (!splitViewOpen) {
        return (
          <div
            className="flex min-h-0 flex-1 flex-col"
            onDragOver={onDragOverMain}
            onDrop={onDropMain}
          >
            {primaryColumn}
          </div>
        )
      }

      const primaryBarTitle = selectedNote
        ? selectedNote.title.trim() || 'Untitled'
        : focusedFolder
          ? focusedFolder.name
          : 'Notes'

      const splitBarTitle = splitNote ? splitNote.title.trim() || 'Untitled' : 'No note opened'

      return (
        <div className="flex min-h-0 flex-1 flex-row">
          <div className="border-border flex min-h-0 min-w-0 flex-1 flex-col border-r">
            <SplitPaneTopBar
              title={primaryBarTitle}
              macElectron={macElectron}
              macTitlebarStyles={macTitlebarStyles}
              onClose={closeSplitView}
            />
            <div
              className="flex min-h-0 flex-1 flex-col"
              onDragOver={onDragOverMain}
              onDrop={onDropMain}
            >
              {primaryColumn}
            </div>
          </div>
          <div className="border-border flex min-h-0 w-[min(100%,50%)] min-w-0 flex-1 flex-col border-l">
            <SplitPaneTopBar
              title={splitBarTitle}
              macElectron={macElectron}
              macTitlebarStyles={macTitlebarStyles}
              onClose={closeSplitView}
            />
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                splitDropActive && 'bg-primary/5 ring-primary/40 ring-2 ring-inset'
              )}
              onDragOver={onDragOverSplitPane}
              onDragLeave={onDragLeaveSplitPane}
              onDrop={onDropSplitPane}
            >
              {splitNote ? (
                splitNote.kind === 'drawing' ? (
                  <ExcalidrawView
                    noteId={splitNote.id}
                    sceneJson={splitNote.excalidrawScene ?? null}
                    onSceneJsonChange={(json) =>
                      handleExcalidrawSceneChange(splitNote.id, json)
                    }
                  />
                ) : (
                  <Editor
                    key={splitNote.id}
                    editorSerializedState={splitNote.content ?? undefined}
                    onSerializedChange={(s) =>
                      handleNoteSerializedChange(splitNote.id, s)
                    }
                    className="min-h-0 flex-1"
                    gitnotesEditor={{
                      notes,
                      folders,
                      currentNoteId: splitNote.id,
                      onOpenInternalNote: selectNote,
                    }}
                  />
                )
              ) : (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
                  <p>Select a note from the sidebar to open split view, or drag a note here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    return null
  })()

  return (
    <div
      className={cn(
        'bg-background flex min-h-0 min-w-0 flex-col',
        sidebarOverlayActive ? 'absolute inset-0 z-0' : 'flex-1'
      )}
    >
      <main
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent"
        style={macElectron ? macTitlebarStyles.noDrag : undefined}
      >
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col bg-background',
            sidebarOverlayActive && 'pl-[min(100%,320px)]'
          )}
        >
        {zenMode ? null : (
          <div
            className={cn(
              'bg-background flex shrink-0 flex-col',
              sidebarOverlayActive && 'pt-2'
            )}
          >
            {/* Row 1: aligns with sidebar “Notes” title row (h-12) — centered glass search */}
            {appMode === 'notes' && !workspaceSettingsFolderId ? (
              <NotesSearchBar
                notes={notes}
                folders={folders}
                onSelectNote={selectNote}
                macTitlebarStyles={macTitlebarStyles}
                sidebarOverlayActive={sidebarOverlayActive}
                macElectron={macElectron}
                sidebarCollapsed={sidebarCollapsed}
              />
            ) : (
              <div
                className={cn(
                  'h-12 shrink-0',
                  sidebarOverlayActive && 'pr-1.5',
                  !sidebarOverlayActive && macElectron && sidebarCollapsed && 'pl-[92px]'
                )}
                style={macElectron ? macTitlebarStyles.drag : undefined}
                aria-hidden
              />
            )}
            {/* Row 2: aligns with sidebar toolbar; tabs span full width of main column */}
            <div
              className={cn(
                'flex min-h-0 w-full min-w-0 shrink-0 items-center py-1.5',
                !sidebarOverlayActive && macElectron && sidebarCollapsed && 'pl-[92px]'
              )}
              style={macElectron ? macTitlebarStyles.drag : undefined}
            >
              {sidebarCollapsed ? (
                <div
                  className="flex shrink-0 items-center px-1"
                  style={macElectron ? macTitlebarStyles.noDrag : undefined}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-9 shrink-0"
                    aria-label="Expand sidebar"
                    aria-expanded={false}
                    onClick={toggleSidebar}
                  >
                    <PanelLeftOpen className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : null}
              {appMode === 'notes' && !workspaceSettingsFolderId && openNoteTabIds.length > 0 ? (
                <div
                  className="flex min-h-0 w-full min-w-0 flex-1 items-center px-2"
                  style={macElectron ? macTitlebarStyles.noDrag : undefined}
                >
                  <div
                    className="bg-muted/35 text-foreground flex h-8 w-full min-w-0 flex-1 items-stretch overflow-hidden rounded-full shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] backdrop-blur-xl dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)]"
                    role="tablist"
                  >
                    <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
                    {openNoteTabIds.map((id) => {
                      const n = notes.find((note) => note.id === id)
                      if (!n) return null
                      const title = n.title.trim() || 'Untitled'
                      const active = id === selectedId
                      const isDrawing = n.kind === 'drawing'
                      return (
                        <div
                          key={id}
                          role="tab"
                          aria-selected={active}
                          tabIndex={active ? 0 : -1}
                          className="group flex min-h-0 min-w-[5rem] flex-1 basis-0 items-center justify-center p-0.5"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              selectNote(id)
                            }
                          }}
                        >
                          <div
                            role="presentation"
                            className={cn(
                              'grid h-full w-full min-w-0 max-w-full cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center px-1 duration-150',
                              active
                                ? 'rounded-full bg-background/92 text-foreground shadow-sm transition-colors dark:bg-white/[0.14]'
                                : 'rounded-none text-muted-foreground transition-[background-color,color,border-radius] hover:rounded-full hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]'
                            )}
                            onClick={() => selectNote(id)}
                          >
                            <div className="flex h-full items-center justify-start">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className={cn(
                                  'size-6 shrink-0',
                                  active
                                    ? 'rounded-full text-muted-foreground  hover:bg-transparent'
                                    : 'rounded-md text-muted-foreground opacity-0 hover:opacity-100 group-hover:opacity-100'
                                )}
                                aria-label={`Close tab ${title}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  closeNoteTab(id)
                                }}
                              >
                                <X className="size-3" aria-hidden />
                              </Button>
                            </div>
                            <div className="flex min-h-0 min-w-0 items-center justify-center gap-1.5 px-0.5">
                              {isDrawing ? (
                                <PenLine
                                  className="text-muted-foreground size-3.5 shrink-0 opacity-80"
                                  aria-hidden
                                />
                              ) : (
                                <FileText
                                  className="text-muted-foreground size-3.5 shrink-0 opacity-80"
                                  aria-hidden
                                />
                              )}
                              <span
                                className="min-h-0 min-w-0 max-w-[min(11rem,100%)] truncate py-1 text-center text-[13px] font-medium leading-tight tracking-tight"
                                title={title}
                              >
                                {title}
                              </span>
                            </div>
                            <span className="block w-full shrink-0" aria-hidden />
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="min-h-8 min-w-0 flex-1" aria-hidden />
              )}
            </div>
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
          {appMode === 'notes' && workspaceSettingsFolder && workspaceSettingsFolderId ? (
            <WorkspaceSettingsPanel
              key={workspaceSettingsFolderId}
              folder={workspaceSettingsFolder}
              macElectron={macElectron}
              macTitlebarStyles={macTitlebarStyles}
              onRename={(name) => renameWorkspace(workspaceSettingsFolderId, name)}
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
          ) : appMode === 'notes' ? (
            notesMainInner
          ) : null}
        </div>
        </div>
      </main>
    </div>
  )
}

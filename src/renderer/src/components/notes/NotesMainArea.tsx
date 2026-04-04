import { useCallback, useState, type DragEvent, type JSX } from 'react'

import { FileText, Plus, X } from 'lucide-react'

import { Editor } from '@/components/blocks/editor-00/editor'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AccountSettingsView } from './AccountSettingsView'
import { DebugSettingsView } from './DebugSettingsView'
import { GitHubSettingsView } from './GitHubSettingsView'
import { NotesLocationBar } from './NotesLocationBar'
import { ShortcutsSettingsView } from './ShortcutsSettingsView'
import { WorkspaceNotesList } from './WorkspaceNotesList'
import { WorkspaceSettingsPanel } from './WorkspaceSettingsPanel'
import { ExcalidrawView } from './ExcalidrawView'
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
      className="border-border flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <span className="text-foreground min-w-0 truncate text-sm font-medium" title={title}>
        {title}
      </span>
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
    notesCount,
    workspaceSettingsFolder,
    workspaceSettingsFolderId,
    renameWorkspace,
    user,
    guestMode,
    onSignOut,
    onConnectGitHub,
    selectedNote,
    focusedFolder,
    notesByFolder,
    selectNote,
    handleNoteSerializedChange,
    handleNewNote,
    canCreateNote,
    splitViewOpen,
    splitNote,
    closeSplitView,
    openSplitWithNote,
    shortcutBindings,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    setShortcutsCaptureActive,
    drawViewOpen
  } = vm

  const [splitDropActive, setSplitDropActive] = useState(false)

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

  const notesMainInner = (() => {
    if (appMode === 'notes' && !workspaceSettingsFolderId && drawViewOpen) {
      return (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={onDragOverMain}
          onDrop={onDropMain}
        >
          <ExcalidrawView />
        </div>
      )
    }

    if (appMode === 'notes' && !workspaceSettingsFolderId) {
      const primaryColumn = selectedNote ? (
        <Editor
          key={selectedNote.id}
          editorSerializedState={selectedNote.content ?? undefined}
          onSerializedChange={(s) => handleNoteSerializedChange(selectedNote.id, s)}
          className="min-h-0 flex-1"
        />
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
                <Editor
                  key={splitNote.id}
                  editorSerializedState={splitNote.content ?? undefined}
                  onSerializedChange={(s) => handleNoteSerializedChange(splitNote.id, s)}
                  className="min-h-0 flex-1"
                />
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
    <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      <main
        className="bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={macElectron ? macTitlebarStyles.noDrag : undefined}
      >
        <NotesLocationBar vm={vm} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
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
      </main>
    </div>
  )
}

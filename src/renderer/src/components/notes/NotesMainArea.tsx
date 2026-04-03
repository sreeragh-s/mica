import type { JSX } from 'react'

import { FileText, Plus } from 'lucide-react'

import { Editor } from '@/components/blocks/editor-00/editor'
import { Button } from '@/components/ui/button'
import { AccountSettingsView } from './AccountSettingsView'
import { DebugSettingsView } from './DebugSettingsView'
import { GitHubSettingsView } from './GitHubSettingsView'
import { NotesLocationBar } from './NotesLocationBar'
import { WorkspaceNotesList } from './WorkspaceNotesList'
import { WorkspaceSettingsPanel } from './WorkspaceSettingsPanel'
import type { NotesAppViewModel } from './useNotesApp'

export type NotesMainAreaProps = {
  vm: NotesAppViewModel
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
    handleSerializedChange,
    handleNewNote,
    canCreateNote,
  } = vm

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
        ) : appMode === 'notes' && !workspaceSettingsFolderId && selectedNote ? (
          <Editor
            key={selectedNote.id}
            editorSerializedState={selectedNote.content ?? undefined}
            onSerializedChange={handleSerializedChange}
            className="min-h-0 flex-1"
          />
        ) : appMode === 'notes' &&
          !workspaceSettingsFolderId &&
          !selectedNote &&
          focusedFolder ? (
          <WorkspaceNotesList
            folder={focusedFolder}
            notes={notesByFolder.get(focusedFolder.id) ?? []}
            onSelectNote={selectNote}
            onNewNote={handleNewNote}
            canCreateNote={canCreateNote}
          />
        ) : appMode === 'notes' ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-sm">
            <FileText className="size-14 opacity-30" aria-hidden />
            <p>Select a workspace or create a note to get started.</p>
            <Button type="button" onClick={handleNewNote} disabled={!canCreateNote}>
              <Plus className="size-4" aria-hidden />
              New note
            </Button>
          </div>
        ) : null}
        </div>
      </main>
    </div>
  )
}

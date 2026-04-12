import { create } from 'zustand'
import type { Dispatch, SetStateAction } from 'react'

import { loadAppearanceSettings, loadEditorSettings } from '@/lib/config/notelab-app-config-read'
import { loadShortcutBindings, type ShortcutBindingsMap } from '@/lib/config/shortcuts-storage'
import { loadSetupState } from '@/lib/workspace/setup-storage'
import { type Folder, loadNotesState, type SavedNote } from '@/lib/notes/notes-storage'
import type { AppMode, SettingsSection } from '@/features/notes/notes-app-types'
import type {
  RightSidebarLinkMode,
  RightSidebarPanel
} from '@/features/notes/right-sidebar/right-sidebar-panel-types'
import type { AppSidebarView } from '@/lib/notes/notes-types'
import type { IndexingStatus } from '@/lib/ai/embedding-pipeline'

type Updater<T> = T | ((prev: T) => T)

function resolveUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater
}

const initialNotesState = loadNotesState()
const initialFolders = initialNotesState.version === 3 ? [] : initialNotesState.folders
const initialNotes = initialNotesState.version === 3 ? [] : initialNotesState.notes
const initialMostRecentPath =
  initialNotes.length === 0
    ? null
    : [...initialNotes].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.path ?? null

type NotesStoreState = {
  appMode: AppMode
  settingsSection: SettingsSection
  folders: Folder[]
  notes: SavedNote[]
  selectedNotePath: string | null
  openNoteTabPaths: string[]
  focusedFolderId: string | null
  newNoteDestinationFolderId: string
  folderCreateOpen: boolean
  folderDraft: string
  pendingDeleteNote: {
    path: string
    title: string
  } | null
  workspaceSettingsFolderId: string | null
  treeExpandNonce: number
  treeExpandIds: string[]
  sidebarCollapsed: boolean
  zenMode: boolean
  shortcutBindings: ShortcutBindingsMap
  editorSettings: ReturnType<typeof loadEditorSettings>
  appearanceSettings: ReturnType<typeof loadAppearanceSettings>
  chatSidebarOpen: boolean
  chatSidebarPanel: RightSidebarPanel
  chatSidebarLinkMode: RightSidebarLinkMode
  graphViewOpen: boolean
  journalViewOpen: boolean
  tabOverviewOpen: boolean
  appSidebarView: AppSidebarView
  githubRemoteUrl: string
  diskMode: boolean
  dataRootPath: string | null
  dirtyByWorkspaceId: Record<string, boolean>
  gitCommitMessage: string
  gitSyncBusy: boolean
  gitSyncError: string | null
  gitSynced: boolean
  gitHubBusy: boolean
  gitHubMessage: string | null
  gitRemoteDialogOpen: boolean
  gitUserConfigDialogOpen: boolean
  gitPendingRetry: (() => Promise<void>) | null
  gitRepoReady: boolean | null
  gitHasOriginRemote: boolean
  gitInitBusy: boolean
  gitInitError: string | null
  workspaceRoot: string | null
  indexingStatus: IndexingStatus
}

type NotesStoreActions = {
  setAppMode: Dispatch<SetStateAction<AppMode>>
  setSettingsSection: Dispatch<SetStateAction<SettingsSection>>
  setFolders: Dispatch<SetStateAction<Folder[]>>
  setNotes: Dispatch<SetStateAction<SavedNote[]>>
  setSelectedNotePath: Dispatch<SetStateAction<string | null>>
  setOpenNoteTabPaths: Dispatch<SetStateAction<string[]>>
  setFocusedFolderId: Dispatch<SetStateAction<string | null>>
  setNewNoteDestinationFolderId: Dispatch<SetStateAction<string>>
  setFolderCreateOpen: Dispatch<SetStateAction<boolean>>
  setFolderDraft: Dispatch<SetStateAction<string>>
  setPendingDeleteNote: Dispatch<
    SetStateAction<{
      path: string
      title: string
    } | null>
  >
  setWorkspaceSettingsFolderId: Dispatch<SetStateAction<string | null>>
  setTreeExpandNonce: Dispatch<SetStateAction<number>>
  setTreeExpandIds: Dispatch<SetStateAction<string[]>>
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  setZenMode: Dispatch<SetStateAction<boolean>>
  setShortcutBindings: Dispatch<SetStateAction<ShortcutBindingsMap>>
  setEditorSettings: Dispatch<SetStateAction<ReturnType<typeof loadEditorSettings>>>
  setAppearanceSettings: Dispatch<SetStateAction<ReturnType<typeof loadAppearanceSettings>>>
  setChatSidebarOpen: Dispatch<SetStateAction<boolean>>
  setChatSidebarPanel: Dispatch<SetStateAction<RightSidebarPanel>>
  setChatSidebarLinkMode: Dispatch<SetStateAction<RightSidebarLinkMode>>
  setGraphViewOpen: Dispatch<SetStateAction<boolean>>
  setJournalViewOpen: Dispatch<SetStateAction<boolean>>
  setTabOverviewOpen: Dispatch<SetStateAction<boolean>>
  setAppSidebarView: Dispatch<SetStateAction<AppSidebarView>>
  setGithubRemoteUrl: Dispatch<SetStateAction<string>>
  setDiskMode: Dispatch<SetStateAction<boolean>>
  setDataRootPath: Dispatch<SetStateAction<string | null>>
  setDirtyByWorkspaceId: Dispatch<SetStateAction<Record<string, boolean>>>
  setGitCommitMessage: Dispatch<SetStateAction<string>>
  setGitSyncBusy: Dispatch<SetStateAction<boolean>>
  setGitSyncError: Dispatch<SetStateAction<string | null>>
  setGitSynced: Dispatch<SetStateAction<boolean>>
  setGitHubBusy: Dispatch<SetStateAction<boolean>>
  setGitHubMessage: Dispatch<SetStateAction<string | null>>
  setGitRemoteDialogOpen: Dispatch<SetStateAction<boolean>>
  setGitUserConfigDialogOpen: Dispatch<SetStateAction<boolean>>
  setGitPendingRetry: Dispatch<SetStateAction<(() => Promise<void>) | null>>
  setGitRepoReady: Dispatch<SetStateAction<boolean | null>>
  setGitHasOriginRemote: Dispatch<SetStateAction<boolean>>
  setGitInitBusy: Dispatch<SetStateAction<boolean>>
  setGitInitError: Dispatch<SetStateAction<string | null>>
  setWorkspaceRoot: Dispatch<SetStateAction<string | null>>
  setIndexingStatus: Dispatch<SetStateAction<IndexingStatus>>
  resetNotesState: () => void
}

type NotesStore = NotesStoreState & NotesStoreActions

const initialState: NotesStoreState = {
  appMode: 'notes',
  settingsSection: 'account',
  folders: initialFolders,
  notes: initialNotes,
  selectedNotePath: initialMostRecentPath,
  openNoteTabPaths: initialMostRecentPath ? [initialMostRecentPath] : [],
  focusedFolderId: null,
  newNoteDestinationFolderId: 'default',
  folderCreateOpen: false,
  folderDraft: '',
  pendingDeleteNote: null,
  workspaceSettingsFolderId: null,
  treeExpandNonce: 0,
  treeExpandIds: [],
  sidebarCollapsed: false,
  zenMode: false,
  shortcutBindings: loadShortcutBindings(),
  editorSettings: loadEditorSettings(),
  appearanceSettings: loadAppearanceSettings(),
  chatSidebarOpen: false,
  chatSidebarPanel: 'chat',
  chatSidebarLinkMode: 'linked',
  graphViewOpen: false,
  journalViewOpen: false,
  tabOverviewOpen: false,
  appSidebarView: 'explorer',
  githubRemoteUrl: initialNotesState.githubRemoteUrl ?? '',
  diskMode: false,
  dataRootPath: null,
  dirtyByWorkspaceId: {},
  gitCommitMessage: 'Update notes',
  gitSyncBusy: false,
  gitSyncError: null,
  gitSynced: false,
  gitHubBusy: false,
  gitHubMessage: null,
  gitRemoteDialogOpen: false,
  gitUserConfigDialogOpen: false,
  gitPendingRetry: null,
  gitRepoReady: null,
  gitHasOriginRemote: false,
  gitInitBusy: false,
  gitInitError: null,
  workspaceRoot: loadSetupState().workspaceRoot ?? null,
  indexingStatus: {
    notes: [],
    pendingCount: 0,
    indexedCount: 0,
    running: false
  }
}

function withSetter<T extends keyof NotesStoreState>(
  key: T,
  set: (fn: (state: NotesStore) => Partial<NotesStore>) => void
): Dispatch<SetStateAction<NotesStoreState[T]>> {
  return (updater) =>
    set((state) => ({
      [key]: resolveUpdater(updater as Updater<NotesStoreState[T]>, state[key])
    })) as never
}

export const useNotesStore = create<NotesStore>((set) => ({
  ...initialState,
  setAppMode: withSetter('appMode', set),
  setSettingsSection: withSetter('settingsSection', set),
  setFolders: withSetter('folders', set),
  setNotes: withSetter('notes', set),
  setSelectedNotePath: withSetter('selectedNotePath', set),
  setOpenNoteTabPaths: withSetter('openNoteTabPaths', set),
  setFocusedFolderId: withSetter('focusedFolderId', set),
  setNewNoteDestinationFolderId: withSetter('newNoteDestinationFolderId', set),
  setFolderCreateOpen: withSetter('folderCreateOpen', set),
  setFolderDraft: withSetter('folderDraft', set),
  setPendingDeleteNote: withSetter('pendingDeleteNote', set),
  setWorkspaceSettingsFolderId: withSetter('workspaceSettingsFolderId', set),
  setTreeExpandNonce: withSetter('treeExpandNonce', set),
  setTreeExpandIds: withSetter('treeExpandIds', set),
  setSidebarCollapsed: withSetter('sidebarCollapsed', set),
  setZenMode: withSetter('zenMode', set),
  setShortcutBindings: withSetter('shortcutBindings', set),
  setEditorSettings: withSetter('editorSettings', set),
  setAppearanceSettings: withSetter('appearanceSettings', set),
  setChatSidebarOpen: withSetter('chatSidebarOpen', set),
  setChatSidebarPanel: withSetter('chatSidebarPanel', set),
  setChatSidebarLinkMode: withSetter('chatSidebarLinkMode', set),
  setGraphViewOpen: withSetter('graphViewOpen', set),
  setJournalViewOpen: withSetter('journalViewOpen', set),
  setTabOverviewOpen: withSetter('tabOverviewOpen', set),
  setAppSidebarView: withSetter('appSidebarView', set),
  setGithubRemoteUrl: withSetter('githubRemoteUrl', set),
  setDiskMode: withSetter('diskMode', set),
  setDataRootPath: withSetter('dataRootPath', set),
  setDirtyByWorkspaceId: withSetter('dirtyByWorkspaceId', set),
  setGitCommitMessage: withSetter('gitCommitMessage', set),
  setGitSyncBusy: withSetter('gitSyncBusy', set),
  setGitSyncError: withSetter('gitSyncError', set),
  setGitSynced: withSetter('gitSynced', set),
  setGitHubBusy: withSetter('gitHubBusy', set),
  setGitHubMessage: withSetter('gitHubMessage', set),
  setGitRemoteDialogOpen: withSetter('gitRemoteDialogOpen', set),
  setGitUserConfigDialogOpen: withSetter('gitUserConfigDialogOpen', set),
  setGitPendingRetry: ((value) =>
    set(() => ({
      gitPendingRetry: value as (() => Promise<void>) | null
    }))) as Dispatch<SetStateAction<(() => Promise<void>) | null>>,
  setGitRepoReady: withSetter('gitRepoReady', set),
  setGitHasOriginRemote: withSetter('gitHasOriginRemote', set),
  setGitInitBusy: withSetter('gitInitBusy', set),
  setGitInitError: withSetter('gitInitError', set),
  setWorkspaceRoot: withSetter('workspaceRoot', set),
  setIndexingStatus: withSetter('indexingStatus', set),
  resetNotesState: () => set(() => initialState)
}))

import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import type { SerializedEditorState } from 'lexical'
import { toast } from 'sonner'

import { getApi } from '@/bridges/auth/auth-bridge'
import { isMacNotelab as checkIsMac } from '@/lib/core/electron-env'
import { createElectronLogger } from '@/lib/core/electron-log'
import { stripSerializedLeadingTitleHeading } from '@/lib/editor/markdown-to-serialized'
import { format } from 'date-fns'
import { type AppSidebarView, JOURNAL_FOLDER_ID } from '@/lib/notes/notes-types'
import {
  DEFAULT_WORKSPACE_ID,
  extractPlainTextFromSerialized,
  type NotePropertyMap,
  type NotePropertyValue,
  type SavedNote,
  type Folder
} from '@/lib/notes/notes-storage'
import { saveEditorSettings, saveAppearanceSettings } from '@/lib/config/notelab-app-config'
import type { NotelabWorkspaceViewSnapshotV1 } from '@/lib/config/notelab-config-schema'
import { schedulePersistWorkspaceViewSnapshot } from '@/lib/config/workspace-view-storage'
import {
  buildFolderPath,
  buildUniqueNoteRelativePath,
  newFolderPath
} from '@/lib/workspace/workspace-markdown-sync'
import type { NotesAppProps } from '@/features/notes/notes-app-types'
import {
  createEmptyDrawing,
  createEmptyNote,
  macTitlebarStyles,
  reorderFolderIdsBeforeTarget,
  reorderFolderIdsToEnd,
  serializedEditorStatesEqual,
  treeFolderPath,
  treeNotePath
} from '@/features/notes/notes-app-utils'
import { treeExpandIdsForFolderId } from './internal/shared'
import { useNotesAppDisk } from './internal/useNotesAppDisk'
import { useNotesAppIndexing } from './internal/useNotesAppIndexing'
import { useNotesAppUi } from './internal/useNotesAppUi'
import { useNotesGitSourceControl } from '@/hooks/notes/useNotesGitSourceControl'
import { useNotesGitSync } from '@/hooks/notes/useNotesGitSync'

import { useNotesStore } from '@/stores/notes/useNotesStore'

const LOG = '[useNotesApp]'
const log = createElectronLogger(LOG)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- view-model shape is NotesAppViewModel below
export function useNotesApp({
  user,
  guestMode = false,
  onSignOut,
  onConnectGitHub
}: NotesAppProps) {
  const isMacNotelab = checkIsMac()
  const folderInputRef = useRef<HTMLInputElement>(null)
  const folderDraftRef = useRef('')
  const dataRootRef = useRef<string | null>(null)
  const {
    appMode,
    setAppMode,
    settingsSection,
    setSettingsSection,
    folders,
    setFolders,
    notes,
    setNotes,
    selectedNotePath,
    setSelectedNotePath,
    openNoteTabPaths,
    setOpenNoteTabPaths,
    focusedFolderId,
    setFocusedFolderId,
    newNoteDestinationFolderId,
    setNewNoteDestinationFolderId,
    folderCreateOpen,
    setFolderCreateOpen,
    folderDraft,
    setFolderDraft,
    pendingDeleteNote,
    setPendingDeleteNote,
    workspaceSettingsFolderId,
    setWorkspaceSettingsFolderId,
    treeExpandNonce,
    setTreeExpandNonce,
    treeExpandIds,
    setTreeExpandIds,
    sidebarCollapsed,
    setSidebarCollapsed,
    zenMode,
    setZenMode,
    shortcutBindings,
    setShortcutBindings,
    editorSettings,
    setEditorSettings,
    appearanceSettings,
    setAppearanceSettings,
    chatSidebarOpen,
    setChatSidebarOpen,
    chatSidebarPanel,
    setChatSidebarPanel,
    chatSidebarLinkMode,
    setChatSidebarLinkMode,
    graphViewOpen,
    setGraphViewOpen,
    canvasViewOpen,
    setCanvasViewOpen,
    journalViewOpen,
    setJournalViewOpen,
    tabOverviewOpen,
    setTabOverviewOpen,
    appSidebarView,
    setAppSidebarView
  } = useNotesStore()
  const setSelectedId = setSelectedNotePath
  const setOpenNoteTabIds = setOpenNoteTabPaths
  const zenModeRef = useRef(false)
  const sidebarCollapsedBeforeZenRef = useRef<boolean | null>(null)
  const lastZenEscPressRef = useRef(0)
  const shortcutBindingsRef = useRef(shortcutBindings)
  const shortcutsSuppressedRef = useRef(false)

  /** Sidebar registers its rename-trigger here so the keyboard shortcut can invoke it. */
  const triggerRenameSelectedRef = useRef<(() => void) | null>(null)
  /** Ref so the keyboard handler (defined before startFolderCreate) can call it. */
  const startFolderCreateRef = useRef<(() => void) | null>(null)
  const foldersRef = useRef(folders)
  const notesRef = useRef(notes)
  const openNoteTabIdsRef = useRef(openNoteTabPaths)
  const noteFlushTimers = useRef<Map<string, number>>(new Map())
  const pendingDiskWrites = useRef<Set<string>>(new Set())
  const pendingSavedNotesRef = useRef<Map<string, SavedNote>>(new Map())
  /** Avoid persisting view state before async restore from `<workspace>/notelab.json` finishes. */
  const workspaceViewRestoredRef = useRef(false)

  useEffect(() => {
    zenModeRef.current = zenMode
  }, [zenMode])

  useEffect(() => {
    shortcutBindingsRef.current = shortcutBindings
  }, [shortcutBindings])

  useEffect(() => {
    foldersRef.current = folders
    notesRef.current = notes
    openNoteTabIdsRef.current = openNoteTabPaths
  }, [folders, notes, openNoteTabPaths])

  const applyWorkspaceViewFromDisk = useCallback((snap: NotelabWorkspaceViewSnapshotV1) => {
    setSelectedId(snap.selectedNotePath)
    setOpenNoteTabIds(snap.openNoteTabPaths)
    setChatSidebarOpen(snap.chatSidebarOpen)
    setChatSidebarPanel(snap.chatSidebarPanel)
    setChatSidebarLinkMode(snap.chatSidebarLinkMode)
    setSidebarCollapsed(snap.sidebarCollapsed)
    setZenMode(snap.zenMode)
    setGraphViewOpen(snap.graphViewOpen)
    setCanvasViewOpen(snap.canvasViewOpen)
    setJournalViewOpen(snap.journalViewOpen)
    setTabOverviewOpen(snap.tabOverviewOpen)
    setAppSidebarView(snap.appSidebarView)
    setAppMode(snap.appMode)
    setSettingsSection(snap.settingsSection)
    setFocusedFolderId(snap.focusedFolderId)
    setNewNoteDestinationFolderId(snap.newNoteDestinationFolderId)
    setWorkspaceSettingsFolderId(snap.workspaceSettingsFolderId)
    workspaceViewRestoredRef.current = true
  }, [])

  const {
    githubRemoteUrl,
    setGithubRemoteUrl,
    diskMode,
    dataRootPath,
    workspaceRoot,
    dirtyByWorkspaceId,
    gitCommitMessage,
    setGitCommitMessage,
    gitSyncBusy,
    setGitSyncBusy,
    gitSyncError,
    setGitSyncError,
    gitSynced,
    setGitSynced,
    gitHubBusy,
    setGitHubBusy,
    gitHubMessage,
    setGitHubMessage,
    gitRemoteDialogOpen,
    setGitRemoteDialogOpen,
    gitUserConfigDialogOpen,
    setGitUserConfigDialogOpen,
    gitPendingRetry,
    setGitPendingRetry,
    gitRepoReady,
    setGitRepoReady,
    gitHasOriginRemote,
    setGitHasOriginRemote,
    gitInitBusy,
    setGitInitBusy,
    gitInitError,
    setGitInitError,
    gitDirtyGlobal,
    refreshWorkspaceGitStatuses,
    reloadNotesFromDisk,
    scheduleNoteFlush,
    flushNoteMoveToDisk,
    handleWorkspaceRootChange
  } = useNotesAppDisk({
    folders,
    notes,
    setFolders,
    setNotes,
    setSelectedId,
    setOpenNoteTabIds,
    setFocusedFolderId,
    setNewNoteDestinationFolderId,
    dataRootRef,
    foldersRef,
    notesRef,
    pendingSavedNotesRef,
    noteFlushTimers,
    pendingDiskWrites,
    applyWorkspaceViewFromDisk
  })

  useEffect(() => {
    if (!diskMode) workspaceViewRestoredRef.current = false
  }, [diskMode])

  useEffect(() => {
    workspaceViewRestoredRef.current = false
  }, [dataRootPath])

  useEffect(() => {
    if (!diskMode || !dataRootPath || !workspaceViewRestoredRef.current) return
    schedulePersistWorkspaceViewSnapshot({
      selectedNotePath,
      openNoteTabPaths,
      chatSidebarOpen,
      chatSidebarPanel,
      chatSidebarLinkMode,
      sidebarCollapsed,
      zenMode,
      graphViewOpen,
      canvasViewOpen,
      journalViewOpen,
      tabOverviewOpen,
      appSidebarView,
      appMode,
      settingsSection,
      focusedFolderId,
      newNoteDestinationFolderId,
      workspaceSettingsFolderId
    })
  }, [
    diskMode,
    dataRootPath,
    selectedNotePath,
    openNoteTabPaths,
    chatSidebarOpen,
    chatSidebarPanel,
    chatSidebarLinkMode,
    sidebarCollapsed,
    zenMode,
    graphViewOpen,
    canvasViewOpen,
    journalViewOpen,
    tabOverviewOpen,
    appSidebarView,
    appMode,
    settingsSection,
    focusedFolderId,
    newNoteDestinationFolderId,
    workspaceSettingsFolderId
  ])

  const { indexingStatus, refreshIndexingStatus, runIndexPending, runReindexAll } =
    useNotesAppIndexing({
      dataRootRef
    })

  const notesByPath = useMemo(() => new Map(notes.map((note) => [note.path, note])), [notes])
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.folder, folder])),
    [folders]
  )
  const folderIdSet = useMemo(() => new Set(folders.map((folder) => folder.folder)), [folders])

  const selectedNote = useMemo(
    () => (selectedNotePath ? (notesByPath.get(selectedNotePath) ?? null) : null),
    [notesByPath, selectedNotePath]
  )

  const focusedFolder = useMemo((): Folder | null => {
    if (!focusedFolderId) return null
    if (focusedFolderId === DEFAULT_WORKSPACE_ID) {
      return { folder: DEFAULT_WORKSPACE_ID, name: 'Root' }
    }
    return folderById.get(focusedFolderId) ?? null
  }, [folderById, focusedFolderId])

  const notesByFolder = useMemo(() => {
    const map = new Map<string, SavedNote[]>()
    for (const f of folders) {
      map.set(f.folder, [])
    }
    if (!map.has(DEFAULT_WORKSPACE_ID)) {
      map.set(DEFAULT_WORKSPACE_ID, [])
    }
    // Journal notes are stored separately and not shown in sidebar
    const journalNotes: SavedNote[] = []
    for (const n of notes) {
      if (n.folder === JOURNAL_FOLDER_ID) {
        journalNotes.push(n)
        continue
      }
      let fid = n.folder
      if (!folderIdSet.has(fid)) {
        fid = DEFAULT_WORKSPACE_ID
      }
      map.get(fid)!.push(n)
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return map
  }, [folderIdSet, folders, notes])

  const touchJournalProperties = useCallback(
    (note: SavedNote, properties?: NotePropertyMap): NotePropertyMap | undefined => {
      if (note.folder !== JOURNAL_FOLDER_ID) return properties
      const nextProperties: NotePropertyMap = { ...(properties ?? {}) }
      const existingDate = note.properties?.date
      if (
        typeof existingDate === 'string' &&
        existingDate.trim() &&
        typeof nextProperties.date !== 'string'
      ) {
        nextProperties.date = existingDate
      }
      nextProperties.last_updated_at = format(new Date(), "MMMM d, yyyy 'at' h:mm a")
      return nextProperties
    },
    []
  )

  const takenNotePaths = useCallback(() => notesRef.current.map((note) => note.path), [])

  const buildNotePath = useCallback(
    (folder: string, title: string, kind: SavedNote['kind'], currentPath?: string) =>
      buildUniqueNoteRelativePath(folder, title, kind, takenNotePaths(), currentPath),
    [takenNotePaths]
  )

  const findLatestNote = useCallback(
    (notePath: string): SavedNote | undefined =>
      pendingSavedNotesRef.current.get(notePath) ??
      notesRef.current.find((note) => note.path === notePath),
    []
  )

  const commitPendingNoteToState = useCallback((notePath: string): void => {
    const pending = pendingSavedNotesRef.current.get(notePath)
    if (!pending) return
    setNotes((prev) => prev.map((note) => (note.path === notePath ? pending : note)))
  }, [])

  const queueNoteSave = useCallback(
    (
      notePath: string,
      nextNote: SavedNote,
      options: {
        commitToState?: boolean
      } = {}
    ): void => {
      const commitToState = options.commitToState ?? true
      if (diskMode) {
        pendingSavedNotesRef.current.set(notePath, nextNote)
      } else {
        pendingSavedNotesRef.current.delete(notePath)
      }
      if (commitToState) {
        setNotes((prev) => prev.map((note) => (note.path === notePath ? nextNote : note)))
      }
      if (diskMode) {
        scheduleNoteFlush(notePath)
      }
    },
    [diskMode, scheduleNoteFlush]
  )

  const replaceTrackedNoteId = useCallback((from: string, to: string) => {
    if (from === to) return
    setSelectedId((prev) => (prev === from ? to : prev))
    setOpenNoteTabIds((prev) => prev.map((path) => (path === from ? to : path)))
  }, [])

  const treeSelectedIds = useMemo(() => {
    if (workspaceSettingsFolderId) return [treeFolderPath(workspaceSettingsFolderId)]
    if (focusedFolderId) return [treeFolderPath(focusedFolderId)]
    if (selectedNotePath) return [treeNotePath(selectedNotePath)]
    return []
  }, [selectedNotePath, focusedFolderId, workspaceSettingsFolderId])

  const workspaceSettingsFolder = useMemo(
    () =>
      workspaceSettingsFolderId
        ? (folderById.get(workspaceSettingsFolderId) ??
          (workspaceSettingsFolderId === DEFAULT_WORKSPACE_ID && dataRootPath
            ? ({
                folder: DEFAULT_WORKSPACE_ID,
                name: 'Root',
                localGitPath: dataRootPath
              } satisfies Folder)
            : null))
        : null,
    [folderById, workspaceSettingsFolderId, dataRootPath]
  )

  const workspaceSettingsCanDelete = useMemo(
    () =>
      diskMode &&
      Boolean(dataRootPath) &&
      Boolean(getApi()?.workspace?.deleteFolder) &&
      workspaceSettingsFolderId != null &&
      workspaceSettingsFolderId !== DEFAULT_WORKSPACE_ID,
    [diskMode, dataRootPath, workspaceSettingsFolderId]
  )

  const primaryGitFolder = useMemo((): Folder | null => {
    const fromFolders = folders.find((f) => f.localGitPath)
    if (fromFolders) return fromFolders
    if (diskMode && dataRootPath) {
      return {
        folder: DEFAULT_WORKSPACE_ID,
        name: 'Root',
        localGitPath: dataRootPath
      }
    }
    return null
  }, [folders, diskMode, dataRootPath])

  const resolveGitFolderForId = useCallback(
    (workspaceId: string | undefined | null): Folder | null => {
      if (workspaceId == null) return null
      const found = folderById.get(workspaceId)
      if (found?.localGitPath) return found
      if (found && !found.localGitPath) return null
      if (workspaceId === DEFAULT_WORKSPACE_ID && dataRootPath) {
        return { folder: DEFAULT_WORKSPACE_ID, name: 'Root', localGitPath: dataRootPath }
      }
      return null
    },
    [folderById, dataRootPath]
  )

  const {
    gitSourceControlFiles,
    gitSourceControlLoading,
    gitSourceControlHasConflicts,
    gitSourceControlIsRebasing,
    gitSourceControlError,
    gitSourceControlBusy,
    gitSourceControlActionError,
    refreshGitSourceControl,
    revealConflictResolver,
    handleGitStageFile,
    handleGitUnstageFile,
    handleGitDiscardFile,
    handleGitAcceptResolution,
    handleGitAbortRebase,
    handleGitContinueRebase,
    conflictViewPath,
    openConflictView,
    closeConflictView
  } = useNotesGitSourceControl({
    primaryGitFolder,
    user,
    refreshWorkspaceGitStatuses,
    setAppSidebarView,
    setAppMode
  })

  const {
    gitToolbarFolder,
    handleInitGit,
    handleGitCommit,
    handleGitPull,
    handleGitPullThenPush,
    handleGitPush,
    handleGitCommitAndPush,
    handleSaveGithubRemote,
    handleGitRemoteConnected,
    handleApplyGithubRemote
  } = useNotesGitSync({
    primaryGitFolder,
    selectedNoteFolderId: selectedNote?.folder ?? null,
    focusedFolderId,
    resolveGitFolderForId,
    setFolders,
    githubRemoteUrl,
    setGithubRemoteUrl,
    gitCommitMessage,
    setGitCommitMessage,
    gitSyncBusy,
    setGitSyncBusy,
    gitSyncError,
    setGitSyncError,
    gitSynced,
    setGitSynced,
    gitHubBusy,
    setGitHubBusy,
    gitHubMessage,
    setGitHubMessage,
    gitRemoteDialogOpen,
    setGitRemoteDialogOpen,
    setGitUserConfigDialogOpen,
    setGitPendingRetry,
    gitRepoReady,
    setGitRepoReady,
    gitHasOriginRemote,
    setGitHasOriginRemote,
    gitInitBusy,
    setGitInitBusy,
    gitInitError,
    setGitInitError,
    user,
    reloadNotesFromDisk,
    refreshWorkspaceGitStatuses,
    refreshGitSourceControl,
    revealConflictResolver
  })

  const gitUiBusy = gitSyncBusy || gitSourceControlBusy
  const gitUiError = gitSyncError ?? gitSourceControlActionError

  const enterNotesExplorer = useCallback(() => {
    setAppMode('notes')
    setAppSidebarView('explorer')
  }, [])

  const closeGraphAndTabOverview = useCallback(() => {
    setGraphViewOpen(false)
    setTabOverviewOpen(false)
  }, [])

  const closeSettingsIncompatibleViews = useCallback(() => {
    setGraphViewOpen(false)
    setJournalViewOpen(false)
    setTabOverviewOpen(false)
  }, [])

  const toggleGitSourceControl = useCallback(() => {
    setAppSidebarView((v) => {
      const next: AppSidebarView = v === 'source-control' ? 'explorer' : 'source-control'
      if (next === 'source-control') {
        setWorkspaceSettingsFolderId(null)
        closeGraphAndTabOverview()
      }
      return next
    })
    setAppMode('notes')
  }, [closeGraphAndTabOverview])

  useEffect(() => {
    folderDraftRef.current = folderDraft
  }, [folderDraft])

  useEffect(() => {
    if (folderCreateOpen) {
      folderInputRef.current?.focus()
      folderInputRef.current?.select()
    }
  }, [folderCreateOpen])

  useEffect(() => {
    const shouldClearFocusedFolder =
      focusedFolderId != null &&
      focusedFolderId !== DEFAULT_WORKSPACE_ID &&
      !folders.some((f) => f.folder === focusedFolderId)
    if (!shouldClearFocusedFolder) return
    queueMicrotask(() => {
      setFocusedFolderId((current) => (current === focusedFolderId ? null : current))
    })
  }, [folders, focusedFolderId])

  useEffect(() => {
    if (!workspaceSettingsFolderId) return
    const ok =
      workspaceSettingsFolderId === DEFAULT_WORKSPACE_ID ||
      folders.some((f) => f.folder === workspaceSettingsFolderId)
    if (ok) return
    queueMicrotask(() => {
      setWorkspaceSettingsFolderId((current) =>
        current === workspaceSettingsFolderId ? null : current
      )
    })
  }, [folders, workspaceSettingsFolderId])

  useEffect(() => {
    queueMicrotask(() => {
      setOpenNoteTabIds((prev) => {
        const next = prev.filter((path) => notesByPath.has(path))
        return next.length === prev.length ? prev : next
      })
    })
  }, [notesByPath])

  useEffect(() => {
    const flushTimers = noteFlushTimers.current
    return () => {
      for (const timerId of flushTimers.values()) {
        window.clearTimeout(timerId)
      }
      flushTimers.clear()
    }
  }, [])

  const pushOpenNoteTab = useCallback((notePath: string) => {
    setOpenNoteTabIds((prev) => (prev.includes(notePath) ? prev : [...prev, notePath]))
  }, [])

  const focusFolderWorkspace = useCallback(
    (folder: string, options: { openSettings?: boolean } = {}) => {
      enterNotesExplorer()
      setTabOverviewOpen(false)
      setWorkspaceSettingsFolderId(options.openSettings ? folder : null)
      setSelectedId(null)
      setFocusedFolderId(folder)
      setNewNoteDestinationFolderId(folder)
      setTreeExpandIds(treeExpandIdsForFolderId(folder))
      setTreeExpandNonce((n) => n + 1)
    },
    [enterNotesExplorer]
  )

  const openNoteInEditor = useCallback(
    (note: SavedNote, options: { openTab?: boolean } = {}) => {
      enterNotesExplorer()
      closeGraphAndTabOverview()
      setWorkspaceSettingsFolderId(null)
      setJournalViewOpen(note.folder === JOURNAL_FOLDER_ID)
      setSelectedId(note.path)
      setFocusedFolderId(null)
      setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
      setTreeExpandIds(treeExpandIdsForFolderId(note.folder))
      setTreeExpandNonce((n) => n + 1)
      if (options.openTab !== false && note.folder !== JOURNAL_FOLDER_ID) {
        pushOpenNoteTab(note.path)
      }
    },
    [closeGraphAndTabOverview, enterNotesExplorer, pushOpenNoteTab]
  )

  /** Stores a pending subpath (e.g. `#my-heading`) to scroll to after note navigation. */
  const pendingSubpathRef = useRef<string | null>(null)

  const selectNote = useCallback(
    (notePath: string, subpath?: string) => {
      if (selectedNotePath && selectedNotePath !== notePath) {
        commitPendingNoteToState(selectedNotePath)
      }
      const note = findLatestNote(notePath)
      if (!note) return
      pendingSubpathRef.current = subpath ?? null
      openNoteInEditor(note)
    },
    [commitPendingNoteToState, findLatestNote, openNoteInEditor, selectedNotePath]
  )

  /**
   * Consume the pending subpath set by the most recent `selectNote` call.
   * Returns the subpath string (e.g. `#my-heading`) and clears it, or null if none.
   */
  const consumePendingSubpath = useCallback((): string | null => {
    const v = pendingSubpathRef.current
    pendingSubpathRef.current = null
    return v
  }, [])

  const reorderOpenNoteTabs = useCallback(
    (nextOrUpdater: string[] | ((prev: string[]) => string[])) => {
      setOpenNoteTabIds((prev) =>
        typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater
      )
    },
    []
  )

  const closeNoteTab = useCallback(
    (notePath: string) => {
      const prev = openNoteTabIdsRef.current
      const idx = prev.indexOf(notePath)
      const next = prev.filter((path) => path !== notePath)
      setOpenNoteTabIds(next)

      if (selectedNotePath !== notePath) return

      commitPendingNoteToState(notePath)
      const fallback = next[idx - 1] ?? next[idx] ?? next[0] ?? null
      setSelectedId(fallback)
      if (fallback) {
        const n = findLatestNote(fallback)
        if (n) {
          setFocusedFolderId(null)
          setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
          setTreeExpandIds(treeExpandIdsForFolderId(n.folder))
          setTreeExpandNonce((x) => x + 1)
        }
      }
    },
    [commitPendingNoteToState, findLatestNote, selectedNotePath]
  )

  const appendFolder = useCallback(
    (name: string): string => {
      const folder = newFolderPath(name)
      const root = dataRootRef.current
      setFolders((prev) => [...prev, { folder, name, ...(root ? { localGitPath: root } : {}) }])
      if (diskMode && root) {
        const api = getApi()
        void api?.workspace?.createFolder?.({ cwd: root, folder })
        void refreshWorkspaceGitStatuses()
      }
      return folder
    },
    [diskMode, refreshWorkspaceGitStatuses]
  )

  const handleTreeSelectionChange = useCallback(
    (ids: string[]) => {
      setGraphViewOpen(false)
      setWorkspaceSettingsFolderId(null)
      const id = ids[0]
      if (!id) {
        if (selectedNotePath) commitPendingNoteToState(selectedNotePath)
        setSelectedId(null)
        setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
        return
      }
      if (id.startsWith('note:')) {
        selectNote(id.slice(5))
        return
      }
      if (id.startsWith('folder:')) {
        if (selectedNotePath) commitPendingNoteToState(selectedNotePath)
        const fid = id.slice('folder:'.length)
        setFocusedFolderId(fid)
        setNewNoteDestinationFolderId(fid)
      }
    },
    [commitPendingNoteToState, selectNote, selectedNotePath]
  )

  const handleNewNote = useCallback(() => {
    if (selectedNotePath) commitPendingNoteToState(selectedNotePath)
    let fid = newNoteDestinationFolderId
    const valid = fid === DEFAULT_WORKSPACE_ID || foldersRef.current.some((f) => f.folder === fid)
    if (!valid) {
      fid = DEFAULT_WORKSPACE_ID
    }
    const notePath = buildNotePath(fid, '', 'note')
    const note = createEmptyNote(fid, notePath)
    note.hasFrontmatterBlock = editorSettings.newNotesStartWithFrontmatter
    setNotes((prev) => [note, ...prev])
    openNoteInEditor(note)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.path), 0)
    }
  }, [
    buildNotePath,
    newNoteDestinationFolderId,
    diskMode,
    scheduleNoteFlush,
    editorSettings,
    commitPendingNoteToState,
    openNoteInEditor,
    selectedNotePath
  ])

  const handleNoteSerializedChange = useCallback(
    (notePath: string, serialized: SerializedEditorState) => {
      const current = findLatestNote(notePath)
      if (!current || current.kind !== 'note') return
      const normalized = stripSerializedLeadingTitleHeading(serialized, current.title)
      const nextPlainText = extractPlainTextFromSerialized(normalized)
      if (current.isTransient && nextPlainText.trim() === '') return
      if (serializedEditorStatesEqual(current.content, normalized)) return
      queueNoteSave(
        notePath,
        {
          ...current,
          content: normalized,
          properties: touchJournalProperties(current, current.properties),
          ...(current.isTransient ? { isTransient: undefined } : {})
        },
        { commitToState: !diskMode }
      )
    },
    [diskMode, findLatestNote, queueNoteSave, touchJournalProperties]
  )

  const handleNewDrawing = useCallback(() => {
    if (selectedNotePath) commitPendingNoteToState(selectedNotePath)
    let fid = newNoteDestinationFolderId
    const valid = fid === DEFAULT_WORKSPACE_ID || foldersRef.current.some((f) => f.folder === fid)
    if (!valid) {
      fid = DEFAULT_WORKSPACE_ID
    }
    const notePath = buildNotePath(fid, 'New drawing', 'drawing')
    const note = createEmptyDrawing(fid, notePath)
    setNotes((prev) => [note, ...prev])
    openNoteInEditor(note)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.path), 0)
    }
  }, [
    buildNotePath,
    newNoteDestinationFolderId,
    diskMode,
    scheduleNoteFlush,
    commitPendingNoteToState,
    openNoteInEditor,
    selectedNotePath
  ])

  const handleExcalidrawSceneChange = useCallback(
    (notePath: string, json: string) => {
      const current = findLatestNote(notePath)
      if (!current || current.kind !== 'drawing') return
      queueNoteSave(notePath, { ...current, excalidrawScene: json, updatedAt: Date.now() })
    },
    [findLatestNote, queueNoteSave]
  )

  const renameNote = useCallback(
    (notePath: string, title: string) => {
      const trimmed = title.trim()
      const current = findLatestNote(notePath)
      if (!current) return
      const nextPath = buildNotePath(current.folder, trimmed, current.kind, current.path)
      const nextNote = {
        ...current,
        path: nextPath,
        title:
          trimmed ||
          nextPath
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/g, '') ||
          'Untitled',
        properties: touchJournalProperties(current, current.properties),
        ...(current.isTransient ? { isTransient: undefined } : {}),
        updatedAt: Date.now()
      }
      pendingSavedNotesRef.current.delete(notePath)
      setNotes((prev) => prev.map((n) => (n.path === notePath ? nextNote : n)))
      replaceTrackedNoteId(notePath, nextPath)
      const flushTid = noteFlushTimers.current.get(notePath)
      if (flushTid !== undefined) {
        window.clearTimeout(flushTid)
        noteFlushTimers.current.delete(notePath)
      }
      if (diskMode) {
        void flushNoteMoveToDisk(notePath, nextNote)
      }
    },
    [
      buildNotePath,
      diskMode,
      findLatestNote,
      flushNoteMoveToDisk,
      replaceTrackedNoteId,
      touchJournalProperties
    ]
  )

  const setNoteCover = useCallback(
    (notePath: string, coverImageSrc: string | null) => {
      const current = findLatestNote(notePath)
      if (!current) return
      queueNoteSave(notePath, {
        ...current,
        ...(coverImageSrc === null || coverImageSrc === ''
          ? { coverImageSrc: undefined }
          : { coverImageSrc }),
        ...(coverImageSrc ? { hasFrontmatterBlock: true } : {}),
        properties: touchJournalProperties(current, current.properties),
        ...(current.isTransient ? { isTransient: undefined } : {}),
        updatedAt: Date.now()
      })
    },
    [findLatestNote, queueNoteSave, touchJournalProperties]
  )

  const setNoteTitleEmoji = useCallback(
    (notePath: string, titleEmoji: string | null) => {
      const trimmed = titleEmoji?.trim() ?? ''
      const current = findLatestNote(notePath)
      if (!current) return
      queueNoteSave(notePath, {
        ...current,
        ...(trimmed === '' ? { titleEmoji: undefined } : { titleEmoji: trimmed }),
        ...(trimmed !== '' ? { hasFrontmatterBlock: true } : {}),
        properties: touchJournalProperties(current, current.properties),
        ...(current.isTransient ? { isTransient: undefined } : {}),
        updatedAt: Date.now()
      })
    },
    [findLatestNote, queueNoteSave, touchJournalProperties]
  )

  const setNoteProperty = useCallback(
    (notePath: string, key: string, value: NotePropertyValue | null) => {
      const trimmedKey = key.trim()
      if (!trimmedKey) return
      if (trimmedKey === 'cover_image') {
        setNoteCover(notePath, typeof value === 'string' ? value : null)
        return
      }
      if (trimmedKey === 'title_emoji') {
        setNoteTitleEmoji(notePath, typeof value === 'string' ? value : null)
        return
      }
      const current = findLatestNote(notePath)
      if (!current) return
      const nextProperties = { ...(current.properties ?? {}) }
      const empty =
        value == null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0)
      if (empty) {
        delete nextProperties[trimmedKey]
      } else {
        nextProperties[trimmedKey] = value
      }
      const stampedProperties = touchJournalProperties(current, nextProperties)
      queueNoteSave(notePath, {
        ...current,
        properties: stampedProperties,
        hasFrontmatterBlock:
          current.hasFrontmatterBlock || Object.keys(stampedProperties ?? {}).length > 0,
        ...(current.isTransient ? { isTransient: undefined } : {}),
        updatedAt: Date.now()
      })
    },
    [findLatestNote, queueNoteSave, setNoteCover, setNoteTitleEmoji, touchJournalProperties]
  )

  const moveNoteToFolder = useCallback(
    (notePath: string, targetFolderId: string) => {
      const note = findLatestNote(notePath)
      if (!note || note.folder === targetFolderId) return
      const targetOk =
        targetFolderId === DEFAULT_WORKSPACE_ID ||
        foldersRef.current.some((f) => f.folder === targetFolderId)
      if (!targetOk) return

      const nextId = buildNotePath(targetFolderId, note.title, note.kind, note.path)
      setGraphViewOpen(false)
      setNotes((prev) =>
        prev.map((n) =>
          n.path === notePath
            ? { ...n, path: nextId, folder: targetFolderId, updatedAt: Date.now() }
            : n
        )
      )
      setSelectedId((prev) => (prev === notePath ? nextId : prev))
      setOpenNoteTabIds((prev) => prev.map((path) => (path === notePath ? nextId : path)))
      setFocusedFolderId(targetFolderId)
      setNewNoteDestinationFolderId(targetFolderId)
      setTreeExpandIds(treeExpandIdsForFolderId(targetFolderId))
      setTreeExpandNonce((n) => n + 1)

      pendingSavedNotesRef.current.delete(notePath)
      const tid = noteFlushTimers.current.get(notePath)
      if (tid !== undefined) window.clearTimeout(tid)
      noteFlushTimers.current.delete(notePath)
      if (diskMode) {
        void flushNoteMoveToDisk(notePath, {
          ...note,
          path: nextId,
          folder: targetFolderId,
          updatedAt: Date.now()
        })
      }
    },
    [buildNotePath, diskMode, findLatestNote, flushNoteMoveToDisk]
  )

  const reorderFolders = useCallback((draggedFolderId: string, targetFolderId: string) => {
    if (draggedFolderId === targetFolderId) return
    setFolders((prev) => {
      const ids = prev.map((f) => f.folder)
      const nextIds = reorderFolderIdsBeforeTarget(ids, draggedFolderId, targetFolderId)
      if (!nextIds) return prev
      const byId = new Map(prev.map((f) => [f.folder, f]))
      return nextIds.map((folder) => byId.get(folder)!).filter(Boolean) as Folder[]
    })
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const reorderFolderToEnd = useCallback((draggedFolderId: string) => {
    setFolders((prev) => {
      const ids = prev.map((f) => f.folder)
      const nextIds = reorderFolderIdsToEnd(ids, draggedFolderId)
      if (!nextIds) return prev
      const byId = new Map(prev.map((f) => [f.folder, f]))
      return nextIds.map((folder) => byId.get(folder)!).filter(Boolean) as Folder[]
    })
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const deleteNoteNow = useCallback(
    (notePath: string) => {
      pendingSavedNotesRef.current.delete(notePath)
      const tid = noteFlushTimers.current.get(notePath)
      if (tid !== undefined) window.clearTimeout(tid)
      noteFlushTimers.current.delete(notePath)
      const snapshotNotes = notesRef.current
      const snapshotOpenTabs = openNoteTabIdsRef.current
      const snapshotSelected = selectedNotePath
      const deleted = snapshotNotes.find((n) => n.path === notePath)

      // Update renderer state first so large-workspace deletes feel instant.
      setNotes((prev) => prev.filter((n) => n.path !== notePath))
      setOpenNoteTabIds((prev) => prev.filter((path) => path !== notePath))
      if (snapshotSelected === notePath) {
        const next = snapshotNotes.filter((n) => n.path !== notePath)
        const nextSel = next[0]?.path ?? null
        setSelectedId(nextSel)
        if (nextSel) {
          setFocusedFolderId(null)
          setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
        } else if (deleted) {
          setFocusedFolderId(null)
        }
      }

      void (async () => {
        const api = getApi()
        const cwd = dataRootRef.current

        if (diskMode && cwd && api?.workspace?.deleteNoteFile && deleted) {
          const result = await api.workspace.deleteNoteFile({ cwd, note: notePath })
          if (!result.ok) {
            console.error('[notelab] delete note file failed', result.error)
            setNotes(snapshotNotes)
            setOpenNoteTabIds(snapshotOpenTabs)
            setSelectedId(snapshotSelected)
            toast.error('Could not delete note. Restored it in the workspace.')
            return
          }

          void refreshWorkspaceGitStatuses()
        }

        if (deleted && cwd && api?.embeddings?.deleteNoteDocument) {
          const result = await api.embeddings.deleteNoteDocument({
            workspacePath: cwd,
            note: notePath
          })
          if (!result.ok) {
            console.error('[notelab] deleteNoteDocument failed', result.error)
          }
        }
      })()
    },
    [diskMode, refreshWorkspaceGitStatuses, selectedNotePath]
  )

  const handleDeleteNote = useCallback(
    (notePath: string, e: MouseEvent) => {
      e.stopPropagation()
      const note = notesRef.current.find((item) => item.path === notePath)
      if (!note) return

      if (!editorSettings.confirmNoteDeletion) {
        deleteNoteNow(notePath)
        return
      }

      setPendingDeleteNote({
        path: notePath,
        title: note.title?.trim() || 'Untitled'
      })
    },
    [deleteNoteNow, editorSettings.confirmNoteDeletion]
  )

  const cancelDeleteNoteConfirmation = useCallback(() => {
    setPendingDeleteNote(null)
  }, [])

  const confirmDeleteNote = useCallback(
    ({ dontAskAgain = false }: { dontAskAgain?: boolean } = {}) => {
      if (!pendingDeleteNote) return
      if (dontAskAgain) {
        const next = { ...editorSettings, confirmNoteDeletion: false }
        setEditorSettings(next)
        saveEditorSettings(next)
      }
      const notePath = pendingDeleteNote.path
      setPendingDeleteNote(null)
      deleteNoteNow(notePath)
    },
    [deleteNoteNow, editorSettings, pendingDeleteNote]
  )

  const cancelFolderCreate = useCallback(() => {
    setFolderCreateOpen(false)
    setFolderDraft('')
    folderDraftRef.current = ''
  }, [])

  const commitFolderCreate = useCallback(() => {
    const name = folderDraftRef.current.trim()
    if (!name) {
      cancelFolderCreate()
      return
    }
    appendFolder(name)
    cancelFolderCreate()
  }, [appendFolder, cancelFolderCreate])

  const onFolderDraftKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitFolderCreate()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelFolderCreate()
      }
    },
    [commitFolderCreate, cancelFolderCreate]
  )

  const openSettings = useCallback(() => {
    setWorkspaceSettingsFolderId(null)
    closeSettingsIncompatibleViews()
    setAppMode('settings')
    setAppSidebarView('settings')
    setSettingsSection('account')
  }, [closeSettingsIncompatibleViews])

  const selectAppSidebarView = useCallback(
    (view: AppSidebarView) => {
      if (view === 'settings') {
        openSettings()
        return
      }
      setAppSidebarView(view)
      setAppMode('notes')
      if (view === 'source-control') {
        setWorkspaceSettingsFolderId(null)
        closeSettingsIncompatibleViews()
      }
    },
    [closeSettingsIncompatibleViews, openSettings]
  )

  const openFolderSettings = useCallback(
    (folder: string, e: MouseEvent) => {
      e.stopPropagation()
      focusFolderWorkspace(folder, { openSettings: true })
    },
    [focusFolderWorkspace]
  )

  const navigateToNotesRoot = useCallback(() => {
    enterNotesExplorer()
    setWorkspaceSettingsFolderId(null)
    setSelectedId(null)
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
  }, [enterNotesExplorer])

  const focusFolderInTree = useCallback(
    (folder: string) => {
      focusFolderWorkspace(folder)
    },
    [focusFolderWorkspace]
  )

  const openFolderSettingsPanel = useCallback(
    (folder: string) => {
      focusFolderWorkspace(folder, { openSettings: true })
    },
    [focusFolderWorkspace]
  )

  const clearSidebarWorkspaceIntent = useCallback(() => {
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
    setFocusedFolderId(null)
  }, [])

  const renameFolder = useCallback(
    async (folder: string, name: string) => {
      const current = foldersRef.current.find((f) => f.folder === folder)
      if (!current) return
      const nextFolderId = buildFolderPath(name)
      const root = dataRootRef.current
      if (diskMode && root && folder !== nextFolderId) {
        const rename = await getApi()?.workspace?.renamePath?.({
          cwd: root,
          from: folder,
          to: nextFolderId
        })
        if (!rename?.ok) {
          console.error('[notelab] rename folder failed', rename?.error)
          return
        }
      }
      setFolders((prev) =>
        prev.map((f) => (f.folder === folder ? { ...f, folder: nextFolderId, name } : f))
      )
      setNotes((prev) =>
        prev.map((note) =>
          note.folder !== folder
            ? note
            : {
                ...note,
                folder: nextFolderId,
                path: note.path.startsWith(`${folder}/`)
                  ? `${nextFolderId}/${note.path.slice(folder.length + 1)}`
                  : note.path
              }
        )
      )
      setSelectedId((prev) =>
        prev?.startsWith(`${folder}/`) ? `${nextFolderId}/${prev.slice(folder.length + 1)}` : prev
      )
      setOpenNoteTabIds((prev) =>
        prev.map((path) =>
          path.startsWith(`${folder}/`) ? `${nextFolderId}/${path.slice(folder.length + 1)}` : path
        )
      )
      if (diskMode && root) {
        void refreshWorkspaceGitStatuses()
      }
    },
    [diskMode, refreshWorkspaceGitStatuses]
  )

  const deleteFolder = useCallback(
    async (folder: string) => {
      if (folder === DEFAULT_WORKSPACE_ID) return
      const root = dataRootRef.current
      const api = getApi()
      if (!diskMode || !root || !api?.workspace?.deleteFolder) return

      const notePathsToClose = new Set(
        notesRef.current.filter((n) => n.folder === folder).map((n) => n.path)
      )
      const prevTabs = openNoteTabIdsRef.current
      const nextTabs = prevTabs.filter((path) => !notePathsToClose.has(path))

      const r = await api.workspace.deleteFolder({
        cwd: root,
        folder: folder
      })
      if (!r.ok) {
        console.error('[notelab] delete workspace failed', r.error)
        return
      }
      void api?.embeddings?.deleteWorkspaceDocuments?.({ workspacePath: root, workspaceId: folder })

      setWorkspaceSettingsFolderId((prev) => (prev === folder ? null : prev))
      setFocusedFolderId((fid) => (fid === folder ? null : fid))
      setOpenNoteTabIds(nextTabs)
      setSelectedId((current) => {
        if (!current || !notePathsToClose.has(current)) return current
        const idx = prevTabs.indexOf(current)
        return nextTabs[idx - 1] ?? nextTabs[idx] ?? nextTabs[0] ?? null
      })
      await reloadNotesFromDisk()
      await refreshWorkspaceGitStatuses()
    },
    [diskMode, reloadNotesFromDisk, refreshWorkspaceGitStatuses]
  )

  const defaultExpandedFolderIds = useMemo(
    () => folders.map((f) => treeFolderPath(f.folder)),
    [folders]
  )

  const canCreateNote = true

  const {
    backToNotes,
    toggleSidebar,
    toggleChatSidebar: toggleChatSidebarBase,
    closeGraphView,
    openGraphView,
    openTabOverview,
    openCanvasView,
    closeCanvasView,
    openJournalView,
    closeJournalView,
    closeTabOverview,
    setShortcutsCaptureActive,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    openShortcuts
  } = useNotesAppUi({
    appMode,
    setAppMode,
    workspaceSettingsFolderId,
    setWorkspaceSettingsFolderId,
    selectedNote,
    sidebarCollapsed,
    setSidebarCollapsed,
    graphViewOpen,
    setGraphViewOpen,
    canvasViewOpen,
    setCanvasViewOpen,
    journalViewOpen,
    setJournalViewOpen,
    setTabOverviewOpen,
    zenMode,
    setZenMode,
    shortcutBindings,
    setShortcutBindings,
    chatSidebarOpen,
    setChatSidebarOpen,
    workspaceRoot,
    selectedNotePath,
    openNoteTabPaths,
    setSelectedId,
    setOpenNoteTabIds,
    setAppSidebarView,
    setSettingsSection,
    handleNewNote,
    openNoteTabIdsRef,
    shortcutBindingsRef,
    shortcutsSuppressedRef,
    triggerRenameSelectedRef,
    startFolderCreateRef,
    zenModeRef,
    sidebarCollapsedBeforeZenRef,
    lastZenEscPressRef
  })

  const toggleChatSidebar = useCallback(() => {
    if (chatSidebarOpen && chatSidebarPanel === 'chat') {
      toggleChatSidebarBase()
      return
    }
    setChatSidebarPanel('chat')
    setChatSidebarOpen(true)
  }, [chatSidebarOpen, chatSidebarPanel, toggleChatSidebarBase])

  const openLinkedNotesSidebar = useCallback(() => {
    if (chatSidebarOpen && chatSidebarPanel === 'links') {
      setChatSidebarOpen(false)
      return
    }
    setChatSidebarPanel('links')
    setChatSidebarOpen(true)
  }, [chatSidebarOpen, chatSidebarPanel])

  const startFolderCreate = useCallback(() => {
    setFolderCreateOpen(true)
    setFolderDraft('')
    folderDraftRef.current = ''
  }, [])

  useEffect(() => {
    startFolderCreateRef.current = startFolderCreate
  }, [startFolderCreate])

  const onFolderNameChange = useCallback((value: string) => {
    setFolderDraft(value)
    folderDraftRef.current = value
  }, [])

  const onFolderNameBlur = useCallback(() => {
    const t = folderDraftRef.current.trim()
    if (!t) {
      cancelFolderCreate()
    } else {
      commitFolderCreate()
    }
  }, [cancelFolderCreate, commitFolderCreate])

  const handleJournalDateSelect = useCallback(
    (dateStr: string) => {
      const existingNote = notesRef.current.find((n) => {
        if (n.folder !== JOURNAL_FOLDER_ID) return false
        const propertyDate = n.properties?.date
        return typeof propertyDate === 'string' && propertyDate.trim() === dateStr
      })
      if (existingNote) {
        log.info('handleJournalDateSelect existing note', {
          dateStr,
          notePath: existingNote.path,
          title: existingNote.title,
          isTransient: Boolean(existingNote.isTransient)
        })
        selectNote(existingNote.path)
        return
      }

      const notePath = buildNotePath(JOURNAL_FOLDER_ID, dateStr, 'note')
      const note = createEmptyNote(JOURNAL_FOLDER_ID, notePath)
      note.title = dateStr
      note.hasFrontmatterBlock = true
      note.isTransient = true
      note.properties = {
        date: dateStr,
        last_updated_at: format(new Date(), "MMMM d, yyyy 'at' h:mm a")
      }

      log.info('handleJournalDateSelect created transient journal note', {
        dateStr,
        notePath,
        title: note.title
      })
      setNotes((prev) => [note, ...prev])
      openNoteInEditor(note, { openTab: false })
    },
    [buildNotePath, openNoteInEditor, selectNote]
  )

  return {
    user,
    guestMode,
    onSignOut,
    onConnectGitHub,
    isMacNotelab,
    macTitlebarStyles,
    appMode,
    settingsSection,
    setSettingsSection,
    editorSettings,
    appearanceSettings,
    setEditorSettings: (patch: Partial<typeof editorSettings>) => {
      const next = { ...editorSettings, ...patch }
      setEditorSettings(next)
      saveEditorSettings(next)
    },
    setAppearanceSettings: (patch: Partial<typeof appearanceSettings>) => {
      const next = { ...appearanceSettings, ...patch }
      setAppearanceSettings(next)
      saveAppearanceSettings(next)
    },
    folders,
    notesByFolder,
    canCreateNote,
    folderCreateOpen,
    folderDraft,
    folderInputRef,
    onFolderNameChange,
    onFolderNameBlur,
    selectedNotePath,
    openNoteTabPaths,
    reorderOpenNoteTabs,
    closeNoteTab,
    focusedFolderId,
    workspaceSettingsFolderId,
    workspaceSettingsFolder,
    workspaceSettingsCanDelete,
    treeExpandNonce,
    treeExpandIds,
    treeSelectedIds,
    defaultExpandedFolderIds,
    selectedNote,
    focusedFolder,
    sidebarCollapsed,
    zenMode,
    toggleSidebar,
    dirtyByWorkspaceId,
    gitCommitMessage,
    setGitCommitMessage,
    gitSyncBusy: gitUiBusy,
    gitSyncError: gitUiError,
    gitSynced,
    handleTreeSelectionChange,
    handleNewNote,
    handleNewDrawing,
    handleExcalidrawSceneChange,
    renameNote,
    setNoteCover,
    setNoteTitleEmoji,
    setNoteProperty,
    moveNoteToFolder,
    reorderFolders,
    reorderFolderToEnd,
    handleDeleteNote,
    pendingDeleteNote,
    cancelDeleteNoteConfirmation,
    confirmDeleteNote,
    handleNoteSerializedChange,
    shortcutBindings,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    setShortcutsCaptureActive,
    onFolderDraftKeyDown,
    cancelFolderCreate,
    commitFolderCreate,
    openSettings,
    openFolderSettings,
    navigateToNotesRoot,
    focusFolderInTree,
    openFolderSettingsPanel,
    clearSidebarWorkspaceIntent,
    selectNote,
    consumePendingSubpath,
    renameFolder,
    deleteFolder,
    backToNotes,
    handleGitCommit,
    handleGitPull,
    handleGitPullThenPush,
    handleGitPush,
    handleGitCommitAndPush,
    startFolderCreate,
    githubRemoteUrl,
    setGithubRemoteUrl,
    handleSaveGithubRemote,
    handleGitRemoteConnected,
    handleApplyGithubRemote,
    gitHubBusy,
    gitHubMessage,
    gitToolbarFolder,
    gitRepoReady,
    gitHasOriginRemote,
    gitInitBusy,
    gitInitError,
    handleInitGit,
    gitDirtyGlobal,
    primaryGitFolderId: primaryGitFolder?.folder ?? null,
    refreshWorkspaceGitStatuses,
    // Source control panel
    appSidebarView,
    setAppSidebarView,
    selectAppSidebarView,
    toggleGitSourceControl,
    gitSourceControlFiles,
    gitSourceControlLoading,
    gitSourceControlHasConflicts,
    gitSourceControlIsRebasing,
    gitSourceControlError,
    refreshGitSourceControl,
    handleGitStageFile,
    handleGitUnstageFile,
    handleGitDiscardFile,
    handleGitAcceptResolution,
    handleGitAbortRebase,
    handleGitContinueRebase,
    // Conflict view
    conflictViewPath,
    openConflictView,
    closeConflictView,
    notes,
    graphViewOpen,
    openGraphView,
    closeGraphView,
    canvasViewOpen,
    openCanvasView,
    closeCanvasView,
    journalViewOpen,
    openJournalView,
    closeJournalView,
    handleJournalDateSelect,
    tabOverviewOpen,
    openTabOverview,
    closeTabOverview,
    notesCount: notes.length,
    indexingStatus,
    refreshIndexingStatus,
    runIndexPending,
    runReindexAll,
    dataRootPath,
    workspaceRoot,
    handleWorkspaceRootChange,
    gitRemoteDialogOpen,
    setGitRemoteDialogOpen,
    gitUserConfigDialogOpen,
    setGitUserConfigDialogOpen,
    gitPendingRetry,
    setGitPendingRetry,
    chatSidebarOpen,
    chatSidebarPanel,
    chatSidebarLinkMode,
    toggleChatSidebar,
    setChatSidebarPanel,
    setChatSidebarLinkMode,
    openLinkedNotesSidebar,
    triggerRenameSelectedRef,
    openShortcuts
  }
}

export type NotesAppViewModel = ReturnType<typeof useNotesApp>

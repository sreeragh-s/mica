import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import type { SerializedEditorState } from 'lexical'

import { getApi } from '@/lib/auth/auth-bridge'
import { isMacNotelab as checkIsMac } from '@/lib/core/electron-env'
import { stripSerializedLeadingTitleHeading } from '@/lib/editor/markdown-to-serialized'
import type { AppSidebarView } from '@/lib/notes/notes-types'
import {
  DEFAULT_WORKSPACE_ID,
  loadNotesState,
  type SavedNote,
  type Folder
} from '@/lib/notes/notes-storage'
import {
  loadShortcutBindings,
  type ShortcutBindingsMap
} from '@/lib/config/shortcuts-storage'
import {
  loadEditorSettings,
  saveEditorSettings,
} from '@/lib/config/notelab-app-config'
import {
  buildFolderPath,
  buildUniqueNoteRelativePath,
  newFolderPath
} from '@/lib/workspace/workspace-markdown-sync'
import type { AppMode, NotesAppProps, SettingsSection } from '@/components/notes/notes-app-types'
import {
  createEmptyDrawing,
  createEmptyNote,
  macTitlebarStyles,
  reorderFolderIdsBeforeTarget,
  reorderFolderIdsToEnd,
  serializedEditorStatesEqual,
  treeFolderPath,
  treeNotePath
} from '@/components/notes/notes-app-utils'
import { treeExpandIdsForFolderId } from './use-notes-app/shared'
import { useNotesAppDisk } from './use-notes-app/useNotesAppDisk'
import { useNotesAppIndexing } from './use-notes-app/useNotesAppIndexing'
import { useNotesAppUi } from './use-notes-app/useNotesAppUi'
import { useNotesGitSourceControl } from '@/components/notes/git/useNotesGitSourceControl'
import { useNotesGitSync } from '@/components/notes/git/useNotesGitSync'

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

  const [appMode, setAppMode] = useState<AppMode>('notes')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('account')

  const initial = useMemo(() => loadNotesState(), [])
  const initialFolders = initial.version === 3 ? [] : initial.folders
  const initialNotes = initial.version === 3 ? [] : initial.notes
  const [folders, setFolders] = useState<Folder[]>(initialFolders)
  const [notes, setNotes] = useState<SavedNote[]>(initialNotes)

  const [selectedNotePath, setSelectedId] = useState<string | null>(() => {
    const n = initialNotes
    return n.length > 0 ? ([...n].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.path ?? null) : null
  })

  const [openNoteTabPaths, setOpenNoteTabIds] = useState<string[]>(() => {
    const n = initialNotes
    if (n.length === 0) return []
    const path = [...n].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.path
    return path ? [path] : []
  })

  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null)

  /** User workspace folder for new notes, or {@link DEFAULT_WORKSPACE_ID} for root. */
  const [newNoteDestinationFolderId, setNewNoteDestinationFolderId] =
    useState<string>(DEFAULT_WORKSPACE_ID)

  const [folderCreateOpen, setFolderCreateOpen] = useState(false)
  const [folderDraft, setFolderDraft] = useState('')

  const [workspaceSettingsFolderId, setWorkspaceSettingsFolderId] = useState<string | null>(null)

  const [treeExpandNonce, setTreeExpandNonce] = useState(0)
  const [treeExpandIds, setTreeExpandIds] = useState<string[]>([])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const zenModeRef = useRef(false)
  zenModeRef.current = zenMode
  const sidebarCollapsedBeforeZenRef = useRef<boolean | null>(null)
  const lastZenEscPressRef = useRef(0)

  const [shortcutBindings, setShortcutBindings] =
    useState<ShortcutBindingsMap>(loadShortcutBindings)
  const [editorSettings, setEditorSettings] = useState(() => loadEditorSettings())
  const shortcutBindingsRef = useRef(shortcutBindings)
  shortcutBindingsRef.current = shortcutBindings
  const shortcutsSuppressedRef = useRef(false)

  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [graphViewOpen, setGraphViewOpen] = useState(false)
  const [canvasViewOpen, setCanvasViewOpen] = useState(false)
  const [tabOverviewOpen, setTabOverviewOpen] = useState(false)

  /** Sidebar registers its rename-trigger here so the keyboard shortcut can invoke it. */
  const triggerRenameSelectedRef = useRef<(() => void) | null>(null)
  /** Ref so the keyboard handler (defined before startFolderCreate) can call it. */
  const startFolderCreateRef = useRef<(() => void) | null>(null)
  const foldersRef = useRef(folders)
  foldersRef.current = folders
  const notesRef = useRef(notes)
  notesRef.current = notes
  const openNoteTabIdsRef = useRef(openNoteTabPaths)
  openNoteTabIdsRef.current = openNoteTabPaths
  const noteFlushTimers = useRef<Map<string, number>>(new Map())
  const pendingDiskWrites = useRef<Set<string>>(new Set())

  // App sidebar: explorer (notes tree), source control, or settings nav
  const [appSidebarView, setAppSidebarView] = useState<AppSidebarView>('explorer')

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
    gitRepoReady,
    setGitRepoReady,
    gitHasOriginRemote,
    setGitHasOriginRemote,
    gitInitBusy,
    setGitInitBusy,
    gitInitError,
    setGitInitError,
    useGithubApiSync,
    setGithubApiDirty,
    gitDirtyGlobal,
    refreshWorkspaceGitStatuses,
    reloadNotesFromDisk,
    handleGithubApiPull,
    handleGithubApiPush,
    scheduleNoteFlush,
    flushNoteMoveToDisk,
    handleWorkspaceRootChange
  } = useNotesAppDisk({
    initialGithubRemoteUrl: initial.githubRemoteUrl ?? '',
    folders,
    notes,
    setFolders,
    setNotes,
    setSelectedId,
    setOpenNoteTabIds,
    setFocusedFolderId,
    setNewNoteDestinationFolderId,
    setChatSidebarOpen,
    dataRootRef,
    foldersRef,
    notesRef,
    noteFlushTimers,
    pendingDiskWrites
  })

  const { indexingStatus, refreshIndexingStatus, runIndexPending, runReindexAll } =
    useNotesAppIndexing({
      dataRootRef
    })

  const selectedNote = useMemo(
    () => notes.find((n) => n.path === selectedNotePath) ?? null,
    [notes, selectedNotePath]
  )

  const focusedFolder = useMemo((): Folder | null => {
    if (!focusedFolderId) return null
    if (focusedFolderId === DEFAULT_WORKSPACE_ID) {
      return { folder: DEFAULT_WORKSPACE_ID, name: 'Root' }
    }
    return folders.find((f) => f.folder === focusedFolderId) ?? null
  }, [folders, focusedFolderId])

  const notesByFolder = useMemo(() => {
    const map = new Map<string, SavedNote[]>()
    for (const f of folders) {
      map.set(f.folder, [])
    }
    if (!map.has(DEFAULT_WORKSPACE_ID)) {
      map.set(DEFAULT_WORKSPACE_ID, [])
    }
    for (const n of notes) {
      let fid = n.folder
      if (!map.has(fid)) {
        fid = folders.some((f) => f.folder === n.folder) ? n.folder : DEFAULT_WORKSPACE_ID
      }
      map.get(fid)!.push(n)
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return map
  }, [folders, notes])

  const takenNotePaths = useCallback(() => notesRef.current.map((note) => note.path), [])

  const buildNotePath = useCallback(
    (folder: string, title: string, kind: SavedNote['kind'], currentPath?: string) =>
      buildUniqueNoteRelativePath(folder, title, kind, takenNotePaths(), currentPath),
    [takenNotePaths]
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
        ? (folders.find((f) => f.folder === workspaceSettingsFolderId) ??
          (workspaceSettingsFolderId === DEFAULT_WORKSPACE_ID && dataRootPath
            ? ({
                folder: DEFAULT_WORKSPACE_ID,
                name: 'Root',
                localGitPath: dataRootPath
              } satisfies Folder)
            : null))
        : null,
    [folders, workspaceSettingsFolderId, dataRootPath]
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
      const found = folders.find((x) => x.folder === workspaceId && x.localGitPath)
      if (found) return found
      if (workspaceId === DEFAULT_WORKSPACE_ID && dataRootPath) {
        return { folder: DEFAULT_WORKSPACE_ID, name: 'Root', localGitPath: dataRootPath }
      }
      return null
    },
    [folders, dataRootPath]
  )

  const toggleGitSourceControl = useCallback(() => {
    setAppSidebarView((v) => {
      const next: AppSidebarView = v === 'source-control' ? 'explorer' : 'source-control'
      if (next === 'source-control') {
        setWorkspaceSettingsFolderId(null)
        setGraphViewOpen(false)
        setTabOverviewOpen(false)
      }
      return next
    })
    setAppMode('notes')
  }, [])

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
    closeConflictView,
  } = useNotesGitSourceControl({
    primaryGitFolder,
    user,
    refreshWorkspaceGitStatuses,
    setAppSidebarView,
    setAppMode,
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
    handleApplyGithubRemote,
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
    gitRepoReady,
    setGitRepoReady,
    gitHasOriginRemote,
    setGitHasOriginRemote,
    gitInitBusy,
    setGitInitBusy,
    gitInitError,
    setGitInitError,
    user,
    useGithubApiSync,
    handleGithubApiPull,
    handleGithubApiPush,
    reloadNotesFromDisk,
    refreshWorkspaceGitStatuses,
    refreshGitSourceControl,
    revealConflictResolver,
  })

  const gitUiBusy = gitSyncBusy || gitSourceControlBusy
  const gitUiError = gitSyncError ?? gitSourceControlActionError

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
    if (
      focusedFolderId &&
      focusedFolderId !== DEFAULT_WORKSPACE_ID &&
      !folders.some((f) => f.folder === focusedFolderId)
    ) {
      setFocusedFolderId(null)
    }
  }, [folders, focusedFolderId])

  useEffect(() => {
    if (!workspaceSettingsFolderId) return
    const ok =
      workspaceSettingsFolderId === DEFAULT_WORKSPACE_ID ||
      folders.some((f) => f.folder === workspaceSettingsFolderId)
    if (!ok) setWorkspaceSettingsFolderId(null)
  }, [folders, workspaceSettingsFolderId])

  useEffect(() => {
    setOpenNoteTabIds((prev) => {
      const next = prev.filter((path) => notes.some((n) => n.path === path))
      return next.length === prev.length ? prev : next
    })
  }, [notes])

  useEffect(() => {
    return () => {
      for (const timerId of noteFlushTimers.current.values()) {
        window.clearTimeout(timerId)
      }
      noteFlushTimers.current.clear()
    }
  }, [])

  const pushOpenNoteTab = useCallback((notePath: string) => {
    if (!notesRef.current.some((n) => n.path === notePath)) return
    setOpenNoteTabIds((prev) => (prev.includes(notePath) ? prev : [...prev, notePath]))
  }, [])

  const selectNote = useCallback(
    (notePath: string) => {
      const note = notesRef.current.find((n) => n.path === notePath)
      if (!note) return
      setWorkspaceSettingsFolderId(null)
      setAppMode('notes')
      setAppSidebarView('explorer')
      setSelectedId(notePath)
      setFocusedFolderId(null)
      setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
      setTreeExpandIds(treeExpandIdsForFolderId(note.folder))
      setTreeExpandNonce((n) => n + 1)
      pushOpenNoteTab(notePath)
    },
    [pushOpenNoteTab]
  )

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

      const fallback = next[idx - 1] ?? next[idx] ?? next[0] ?? null
      setSelectedId(fallback)
      if (fallback) {
        const n = notesRef.current.find((x) => x.path === fallback)
        if (n) {
          setFocusedFolderId(null)
          setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
          setTreeExpandIds(treeExpandIdsForFolderId(n.folder))
          setTreeExpandNonce((x) => x + 1)
        }
      }
    },
    [selectedNotePath]
  )

  const appendFolder = useCallback(
    (name: string): string => {
      const folder = newFolderPath(name)
      const root = dataRootRef.current
      setFolders((prev) => [...prev, { folder, name, ...(root ? { localGitPath: root } : {}) }])
      if (diskMode && root) {
        const api = getApi()
        void api?.workspace?.createFolder?.({ cwd: root, folder })
        if (useGithubApiSync) setGithubApiDirty(true)
        void refreshWorkspaceGitStatuses()
      }
      return folder
    },
    [diskMode, refreshWorkspaceGitStatuses, useGithubApiSync]
  )

  const handleTreeSelectionChange = useCallback(
    (ids: string[]) => {
      setGraphViewOpen(false)
      setWorkspaceSettingsFolderId(null)
      const id = ids[0]
      if (!id) {
        setSelectedId(null)
        setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
        return
      }
      if (id.startsWith('note:')) {
        selectNote(id.slice(5))
        return
      }
      if (id.startsWith('folder:')) {
        const fid = id.slice('folder:'.length)
        setFocusedFolderId(fid)
        setNewNoteDestinationFolderId(fid)
      }
    },
    [selectNote]
  )

  const handleNewNote = useCallback(() => {
    let fid = newNoteDestinationFolderId
    const valid = fid === DEFAULT_WORKSPACE_ID || foldersRef.current.some((f) => f.folder === fid)
    if (!valid) {
      fid = DEFAULT_WORKSPACE_ID
    }
    setAppMode('notes')
    setAppSidebarView('explorer')
    setGraphViewOpen(false)
    setTabOverviewOpen(false)
    const notePath = buildNotePath(fid, '', 'note')
    const note = createEmptyNote(fid, notePath)
    note.hasFrontmatterBlock = editorSettings.newNotesStartWithFrontmatter
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.path)
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
    setTreeExpandIds(treeExpandIdsForFolderId(fid))
    setTreeExpandNonce((n) => n + 1)
    pushOpenNoteTab(note.path)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.path), 0)
    }
  }, [buildNotePath, newNoteDestinationFolderId, diskMode, scheduleNoteFlush, pushOpenNoteTab, editorSettings])

  const handleNoteSerializedChange = useCallback(
    (notePath: string, serialized: SerializedEditorState) => {
      const current = notesRef.current.find((n) => n.path === notePath)
      const normalized =
        current?.kind === 'note'
          ? stripSerializedLeadingTitleHeading(serialized, current.title)
          : serialized
      if (current && serializedEditorStatesEqual(current.content, normalized)) {
        return
      }
      setNotes((prev) =>
        prev.map((n) =>
          n.path === notePath ? { ...n, content: normalized, updatedAt: Date.now() } : n
        )
      )
      scheduleNoteFlush(notePath)
    },
    [scheduleNoteFlush]
  )

  const handleNewDrawing = useCallback(() => {
    let fid = newNoteDestinationFolderId
    const valid = fid === DEFAULT_WORKSPACE_ID || foldersRef.current.some((f) => f.folder === fid)
    if (!valid) {
      fid = DEFAULT_WORKSPACE_ID
    }
    setAppMode('notes')
    setAppSidebarView('explorer')
    setGraphViewOpen(false)
    setTabOverviewOpen(false)
    const notePath = buildNotePath(fid, 'New drawing', 'drawing')
    const note = createEmptyDrawing(fid, notePath)
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.path)
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
    setTreeExpandIds(treeExpandIdsForFolderId(fid))
    setTreeExpandNonce((n) => n + 1)
    pushOpenNoteTab(note.path)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.path), 0)
    }
  }, [buildNotePath, newNoteDestinationFolderId, diskMode, scheduleNoteFlush, pushOpenNoteTab])

  const handleExcalidrawSceneChange = useCallback(
    (notePath: string, json: string) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.path === notePath && n.kind === 'drawing'
            ? { ...n, excalidrawScene: json, updatedAt: Date.now() }
            : n
        )
      )
      scheduleNoteFlush(notePath)
    },
    [scheduleNoteFlush]
  )

  const renameNote = useCallback(
    (notePath: string, title: string) => {
      const trimmed = title.trim()
      const current = notesRef.current.find((n) => n.path === notePath)
      if (!current) return
      const nextPath = buildNotePath(current.folder, trimmed, current.kind, current.path)
      const nextNote = {
        ...current,
        path: nextPath,
        title: trimmed || nextPath.split('/').pop()?.replace(/\.[^.]+$/g, '') || 'Untitled',
        updatedAt: Date.now()
      }
      setNotes((prev) => prev.map((n) => (n.path === notePath ? nextNote : n)))
      replaceTrackedNoteId(notePath, nextPath)
      const flushTid = noteFlushTimers.current.get(notePath)
      if (flushTid !== undefined) {
        window.clearTimeout(flushTid)
        noteFlushTimers.current.delete(notePath)
      }
      if (diskMode) {
        void flushNoteMoveToDisk(notePath, nextNote)
      } else if (useGithubApiSync) {
        setGithubApiDirty(true)
      }
    },
    [buildNotePath, diskMode, flushNoteMoveToDisk, replaceTrackedNoteId, useGithubApiSync]
  )

  const setNoteCover = useCallback(
    (notePath: string, coverImageSrc: string | null) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.path === notePath
            ? {
              ...n,
                ...(coverImageSrc === null || coverImageSrc === ''
                  ? { coverImageSrc: undefined }
                  : { coverImageSrc }),
                ...(coverImageSrc ? { hasFrontmatterBlock: true } : {}),
                updatedAt: Date.now()
              }
            : n
        )
      )
      scheduleNoteFlush(notePath)
    },
    [scheduleNoteFlush]
  )

  const setNoteTitleEmoji = useCallback(
    (notePath: string, titleEmoji: string | null) => {
      const trimmed = titleEmoji?.trim() ?? ''
      setNotes((prev) =>
        prev.map((n) =>
          n.path === notePath
            ? {
              ...n,
                ...(trimmed === '' ? { titleEmoji: undefined } : { titleEmoji: trimmed }),
                ...(trimmed !== '' ? { hasFrontmatterBlock: true } : {}),
                updatedAt: Date.now()
              }
            : n
        )
      )
      scheduleNoteFlush(notePath)
    },
    [scheduleNoteFlush]
  )

  const setNoteProperty = useCallback(
    (notePath: string, key: string, value: string | null) => {
      const trimmedKey = key.trim()
      if (!trimmedKey) return
      if (trimmedKey === 'cover_image') {
        setNoteCover(notePath, value)
        return
      }
      if (trimmedKey === 'title_emoji') {
        setNoteTitleEmoji(notePath, value)
        return
      }
      setNotes((prev) =>
        prev.map((n) => {
          if (n.path !== notePath) return n
          const nextProperties = { ...(n.properties ?? {}) }
          if (value == null || value.trim() === '') {
            delete nextProperties[trimmedKey]
          } else {
            nextProperties[trimmedKey] = value
          }
          return {
            ...n,
            properties: nextProperties,
            hasFrontmatterBlock: n.hasFrontmatterBlock || Object.keys(nextProperties).length > 0,
            updatedAt: Date.now()
          }
        })
      )
      scheduleNoteFlush(notePath)
    },
    [scheduleNoteFlush, setNoteCover, setNoteTitleEmoji]
  )

  const moveNoteToFolder = useCallback(
    (notePath: string, targetFolderId: string) => {
      const note = notesRef.current.find((n) => n.path === notePath)
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
      } else if (useGithubApiSync) {
        setGithubApiDirty(true)
      }
    },
    [buildNotePath, diskMode, flushNoteMoveToDisk, useGithubApiSync]
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

  const handleDeleteNote = useCallback(
    (notePath: string, e: MouseEvent) => {
      e.stopPropagation()
      const tid = noteFlushTimers.current.get(notePath)
      if (tid !== undefined) window.clearTimeout(tid)
      noteFlushTimers.current.delete(notePath)
      const snapshotNotes = notesRef.current
      const snapshotSelected = selectedNotePath
      const deleted = snapshotNotes.find((n) => n.path === notePath)
      void (async () => {
        const api = getApi()
        const cwd = dataRootRef.current
        if (diskMode && cwd && api?.workspace?.deleteNoteFile && deleted) {
          const r = await api.workspace.deleteNoteFile({
            cwd,
            note: notePath
          })
          if (!r.ok) {
            console.error('[notelab] delete note files failed', r.error)
          }
          if (useGithubApiSync) setGithubApiDirty(true)
          await refreshWorkspaceGitStatuses()
        }
        if (deleted && cwd && api?.embeddings?.deleteNoteDocument) {
          const emb = await api.embeddings.deleteNoteDocument({
            workspacePath: cwd,
            note: notePath,
          })
          if (!emb.ok) {
            console.error('[notelab] deleteNoteDocument failed', emb.error)
          }
        }
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
      })()
    },
    [diskMode, refreshWorkspaceGitStatuses, selectedNotePath, useGithubApiSync]
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
    setGraphViewOpen(false)
    setTabOverviewOpen(false)
    setAppMode('settings')
    setAppSidebarView('settings')
    setSettingsSection('account')
  }, [])

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
        setGraphViewOpen(false)
        setTabOverviewOpen(false)
      }
    },
    [openSettings]
  )

  const openFolderSettings = useCallback((folder: string, e: MouseEvent) => {
    e.stopPropagation()
    setAppMode('notes')
    setAppSidebarView('explorer')
    setTabOverviewOpen(false)
    setWorkspaceSettingsFolderId(folder)
    setSelectedId(null)
    setFocusedFolderId(folder)
    setNewNoteDestinationFolderId(folder)
    setTreeExpandIds(treeExpandIdsForFolderId(folder))
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const navigateToNotesRoot = useCallback(() => {
    setAppMode('notes')
    setAppSidebarView('explorer')
    setWorkspaceSettingsFolderId(null)
    setSelectedId(null)
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
  }, [])

  const focusFolderInTree = useCallback((folder: string) => {
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setAppSidebarView('explorer')
    setSelectedId(null)
    setFocusedFolderId(folder)
    setNewNoteDestinationFolderId(folder)
    setTreeExpandIds(treeExpandIdsForFolderId(folder))
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const openFolderSettingsPanel = useCallback((folder: string) => {
    setAppMode('notes')
    setAppSidebarView('explorer')
    setWorkspaceSettingsFolderId(folder)
    setSelectedId(null)
    setFocusedFolderId(folder)
    setNewNoteDestinationFolderId(folder)
    setTreeExpandIds(treeExpandIdsForFolderId(folder))
    setTreeExpandNonce((n) => n + 1)
  }, [])

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
        if (useGithubApiSync) setGithubApiDirty(true)
        void refreshWorkspaceGitStatuses()
      }
    },
    [diskMode, refreshWorkspaceGitStatuses, useGithubApiSync]
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
      if (useGithubApiSync) setGithubApiDirty(true)
      await reloadNotesFromDisk()
      await refreshWorkspaceGitStatuses()
    },
    [
      diskMode,
      reloadNotesFromDisk,
      refreshWorkspaceGitStatuses,
      useGithubApiSync
    ]
  )

  const defaultExpandedFolderIds = useMemo(() => folders.map((f) => treeFolderPath(f.folder)), [folders])

  const canCreateNote = true

  const {
    nativeLiquidGlassAttached,
    backToNotes,
    toggleSidebar,
    toggleChatSidebar,
    closeGraphView,
    openGraphView,
    openTabOverview,
    openCanvasView,
    closeCanvasView,
    closeTabOverview,
    setShortcutsCaptureActive,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    sidebarOverlayActive,
    openShortcuts
  } = useNotesAppUi({
    isMacNotelab,
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

  const startFolderCreate = useCallback(() => {
    setFolderCreateOpen(true)
    setFolderDraft('')
    folderDraftRef.current = ''
  }, [])
  startFolderCreateRef.current = startFolderCreate

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

  return {
    user,
    guestMode,
    onSignOut,
    onConnectGitHub,
    isMacNotelab,
    nativeLiquidGlassAttached,
    macTitlebarStyles,
    appMode,
    settingsSection,
    setSettingsSection,
    editorSettings,
    setEditorSettings: (patch: Partial<typeof editorSettings>) => {
      const next = { ...editorSettings, ...patch }
      setEditorSettings(next)
      saveEditorSettings(next)
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
    sidebarOverlayActive,
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
    tabOverviewOpen,
    openTabOverview,
    closeTabOverview,
    notesCount: notes.length,
    syncTransport: useGithubApiSync ? ('github_api' as const) : ('git' as const),
    indexingStatus,
    refreshIndexingStatus,
    runIndexPending,
    runReindexAll,
    dataRootPath,
    workspaceRoot,
    handleWorkspaceRootChange,
    gitRemoteDialogOpen,
    setGitRemoteDialogOpen,
    chatSidebarOpen,
    toggleChatSidebar,
    triggerRenameSelectedRef,
    openShortcuts,
  }
}

export type NotesAppViewModel = ReturnType<typeof useNotesApp>

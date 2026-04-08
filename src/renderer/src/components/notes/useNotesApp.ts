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

import { getApi } from '@/lib/auth-bridge'
import { isMacNotelab as checkIsMac } from '@/lib/electron-env'
import type { AppSidebarView } from '@/lib/notes-types'
import {
  DEFAULT_WORKSPACE_ID,
  loadNotesState,
  type SavedNote,
  type Folder
} from '@/lib/notes-storage'
import {
  loadShortcutBindings,
  type ShortcutBindingsMap
} from '@/lib/shortcuts-storage'
import { newFolderId } from '@/lib/workspace-markdown-sync'
import type { AppMode, NotesAppProps, SettingsSection } from './notes-app-types'
import {
  createEmptyDrawing,
  createEmptyNote,
  macTitlebarStyles,
  reorderFolderIdsBeforeTarget,
  reorderFolderIdsToEnd,
  serializedEditorStatesEqual,
  treeFolderId,
  treeNoteId
} from './notes-app-utils'
import { treeExpandIdsForFolderId } from './use-notes-app/shared'
import { useNotesAppDisk } from './use-notes-app/useNotesAppDisk'
import { useNotesAppIndexing } from './use-notes-app/useNotesAppIndexing'
import { useNotesAppUi } from './use-notes-app/useNotesAppUi'
import { useNotesGitSourceControl } from './useNotesGitSourceControl'
import { useNotesGitSync } from './useNotesGitSync'

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

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const n = initialNotes
    return n.length > 0 ? ([...n].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null) : null
  })

  const [openNoteTabIds, setOpenNoteTabIds] = useState<string[]>(() => {
    const n = initialNotes
    if (n.length === 0) return []
    const id = [...n].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id
    return id ? [id] : []
  })

  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null)

  /** User workspace folder id for new notes, or {@link DEFAULT_WORKSPACE_ID} for root. */
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
  const openNoteTabIdsRef = useRef(openNoteTabIds)
  openNoteTabIdsRef.current = openNoteTabIds
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
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  )

  const focusedFolder = useMemo((): Folder | null => {
    if (!focusedFolderId) return null
    if (focusedFolderId === DEFAULT_WORKSPACE_ID) {
      return { id: DEFAULT_WORKSPACE_ID, name: 'Root' }
    }
    return folders.find((f) => f.id === focusedFolderId) ?? null
  }, [folders, focusedFolderId])

  const notesByFolder = useMemo(() => {
    const map = new Map<string, SavedNote[]>()
    for (const f of folders) {
      map.set(f.id, [])
    }
    if (!map.has(DEFAULT_WORKSPACE_ID)) {
      map.set(DEFAULT_WORKSPACE_ID, [])
    }
    for (const n of notes) {
      let fid = n.folderId
      if (!map.has(fid)) {
        fid = folders.some((f) => f.id === n.folderId) ? n.folderId : DEFAULT_WORKSPACE_ID
      }
      map.get(fid)!.push(n)
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return map
  }, [folders, notes])

  const treeSelectedIds = useMemo(() => {
    if (workspaceSettingsFolderId) return [treeFolderId(workspaceSettingsFolderId)]
    if (focusedFolderId) return [treeFolderId(focusedFolderId)]
    if (selectedId) return [treeNoteId(selectedId)]
    return []
  }, [selectedId, focusedFolderId, workspaceSettingsFolderId])

  const workspaceSettingsFolder = useMemo(
    () =>
      workspaceSettingsFolderId
        ? (folders.find((f) => f.id === workspaceSettingsFolderId) ??
          (workspaceSettingsFolderId === DEFAULT_WORKSPACE_ID && dataRootPath
            ? ({
                id: DEFAULT_WORKSPACE_ID,
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
        id: DEFAULT_WORKSPACE_ID,
        name: 'Root',
        localGitPath: dataRootPath
      }
    }
    return null
  }, [folders, diskMode, dataRootPath])

  const resolveGitFolderForId = useCallback(
    (workspaceId: string | undefined | null): Folder | null => {
      if (workspaceId == null) return null
      const found = folders.find((x) => x.id === workspaceId && x.localGitPath)
      if (found) return found
      if (workspaceId === DEFAULT_WORKSPACE_ID && dataRootPath) {
        return { id: DEFAULT_WORKSPACE_ID, name: 'Root', localGitPath: dataRootPath }
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
    selectedNoteFolderId: selectedNote?.folderId ?? null,
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
      !folders.some((f) => f.id === focusedFolderId)
    ) {
      setFocusedFolderId(null)
    }
  }, [folders, focusedFolderId])

  useEffect(() => {
    if (!workspaceSettingsFolderId) return
    const ok =
      workspaceSettingsFolderId === DEFAULT_WORKSPACE_ID ||
      folders.some((f) => f.id === workspaceSettingsFolderId)
    if (!ok) setWorkspaceSettingsFolderId(null)
  }, [folders, workspaceSettingsFolderId])

  useEffect(() => {
    setOpenNoteTabIds((prev) => {
      const next = prev.filter((id) => notes.some((n) => n.id === id))
      return next.length === prev.length ? prev : next
    })
  }, [notes])

  const pushOpenNoteTab = useCallback((noteId: string) => {
    if (!notesRef.current.some((n) => n.id === noteId)) return
    setOpenNoteTabIds((prev) => (prev.includes(noteId) ? prev : [...prev, noteId]))
  }, [])

  const selectNote = useCallback(
    (noteId: string) => {
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note) return
      setWorkspaceSettingsFolderId(null)
      setAppMode('notes')
      setAppSidebarView('explorer')
      setSelectedId(noteId)
      setFocusedFolderId(null)
      setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
      setTreeExpandIds(treeExpandIdsForFolderId(note.folderId))
      setTreeExpandNonce((n) => n + 1)
      pushOpenNoteTab(noteId)
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
    (noteId: string) => {
      const prev = openNoteTabIdsRef.current
      const idx = prev.indexOf(noteId)
      const next = prev.filter((id) => id !== noteId)
      setOpenNoteTabIds(next)

      if (selectedId !== noteId) return

      const fallback = next[idx - 1] ?? next[idx] ?? next[0] ?? null
      setSelectedId(fallback)
      if (fallback) {
        const n = notesRef.current.find((x) => x.id === fallback)
        if (n) {
          setFocusedFolderId(null)
          setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
          setTreeExpandIds(treeExpandIdsForFolderId(n.folderId))
          setTreeExpandNonce((x) => x + 1)
        }
      }
    },
    [selectedId]
  )

  const appendFolder = useCallback(
    (name: string): string => {
      const id = newFolderId(name)
      const root = dataRootRef.current
      setFolders((prev) => [...prev, { id, name, ...(root ? { localGitPath: root } : {}) }])
      if (diskMode && root) {
        const api = getApi()
        void api?.workspace?.createFolder?.({ cwd: root, folderId: id })
        if (useGithubApiSync) setGithubApiDirty(true)
        void refreshWorkspaceGitStatuses()
      }
      return id
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
    const valid = fid === DEFAULT_WORKSPACE_ID || foldersRef.current.some((f) => f.id === fid)
    if (!valid) {
      fid = DEFAULT_WORKSPACE_ID
    }
    setAppMode('notes')
    setAppSidebarView('explorer')
    setGraphViewOpen(false)
    setTabOverviewOpen(false)
    const note = createEmptyNote(fid)
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.id)
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
    setTreeExpandIds(treeExpandIdsForFolderId(fid))
    setTreeExpandNonce((n) => n + 1)
    pushOpenNoteTab(note.id)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.id), 0)
    }
  }, [newNoteDestinationFolderId, diskMode, scheduleNoteFlush, pushOpenNoteTab])

  const handleNoteSerializedChange = useCallback(
    (noteId: string, serialized: SerializedEditorState) => {
      const current = notesRef.current.find((n) => n.id === noteId)
      if (current && serializedEditorStatesEqual(current.content, serialized)) {
        return
      }
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, content: serialized, updatedAt: Date.now() } : n
        )
      )
      scheduleNoteFlush(noteId)
    },
    [scheduleNoteFlush]
  )

  const handleNewDrawing = useCallback(() => {
    let fid = newNoteDestinationFolderId
    const valid = fid === DEFAULT_WORKSPACE_ID || foldersRef.current.some((f) => f.id === fid)
    if (!valid) {
      fid = DEFAULT_WORKSPACE_ID
    }
    setAppMode('notes')
    setAppSidebarView('explorer')
    setGraphViewOpen(false)
    setTabOverviewOpen(false)
    const note = createEmptyDrawing(fid)
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.id)
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
    setTreeExpandIds(treeExpandIdsForFolderId(fid))
    setTreeExpandNonce((n) => n + 1)
    pushOpenNoteTab(note.id)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.id), 0)
    }
  }, [newNoteDestinationFolderId, diskMode, scheduleNoteFlush, pushOpenNoteTab])

  const handleExcalidrawSceneChange = useCallback(
    (noteId: string, json: string) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId && n.kind === 'drawing'
            ? { ...n, excalidrawScene: json, updatedAt: Date.now() }
            : n
        )
      )
      scheduleNoteFlush(noteId)
    },
    [scheduleNoteFlush]
  )

  const renameNote = useCallback(
    (noteId: string, title: string) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, title: title.trim(), updatedAt: Date.now() } : n))
      )
      scheduleNoteFlush(noteId)
    },
    [scheduleNoteFlush]
  )

  const setNoteCover = useCallback(
    (noteId: string, coverImageSrc: string | null) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                ...(coverImageSrc === null || coverImageSrc === ''
                  ? { coverImageSrc: undefined }
                  : { coverImageSrc }),
                updatedAt: Date.now()
              }
            : n
        )
      )
      scheduleNoteFlush(noteId)
    },
    [scheduleNoteFlush]
  )

  const setNoteTitleEmoji = useCallback(
    (noteId: string, titleEmoji: string | null) => {
      const trimmed = titleEmoji?.trim() ?? ''
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                ...(trimmed === '' ? { titleEmoji: undefined } : { titleEmoji: trimmed }),
                updatedAt: Date.now()
              }
            : n
        )
      )
      scheduleNoteFlush(noteId)
    },
    [scheduleNoteFlush]
  )

  const moveNoteToFolder = useCallback(
    (noteId: string, targetFolderId: string) => {
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note || note.folderId === targetFolderId) return
      const targetOk =
        targetFolderId === DEFAULT_WORKSPACE_ID ||
        foldersRef.current.some((f) => f.id === targetFolderId)
      if (!targetOk) return

      const fromFolderId = note.folderId
      setGraphViewOpen(false)
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, folderId: targetFolderId, updatedAt: Date.now() } : n
        )
      )
      setFocusedFolderId(targetFolderId)
      setNewNoteDestinationFolderId(targetFolderId)
      setTreeExpandIds(treeExpandIdsForFolderId(targetFolderId))
      setTreeExpandNonce((n) => n + 1)

      const tid = noteFlushTimers.current.get(noteId)
      if (tid !== undefined) window.clearTimeout(tid)
      noteFlushTimers.current.delete(noteId)

      if (diskMode) {
        void flushNoteMoveToDisk(noteId, fromFolderId, targetFolderId)
      } else if (useGithubApiSync) {
        setGithubApiDirty(true)
      }
    },
    [diskMode, flushNoteMoveToDisk, useGithubApiSync]
  )

  const reorderFolders = useCallback((draggedFolderId: string, targetFolderId: string) => {
    if (draggedFolderId === targetFolderId) return
    setFolders((prev) => {
      const ids = prev.map((f) => f.id)
      const nextIds = reorderFolderIdsBeforeTarget(ids, draggedFolderId, targetFolderId)
      if (!nextIds) return prev
      const byId = new Map(prev.map((f) => [f.id, f]))
      return nextIds.map((id) => byId.get(id)!).filter(Boolean) as Folder[]
    })
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const reorderFolderToEnd = useCallback((draggedFolderId: string) => {
    setFolders((prev) => {
      const ids = prev.map((f) => f.id)
      const nextIds = reorderFolderIdsToEnd(ids, draggedFolderId)
      if (!nextIds) return prev
      const byId = new Map(prev.map((f) => [f.id, f]))
      return nextIds.map((id) => byId.get(id)!).filter(Boolean) as Folder[]
    })
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const handleDeleteNote = useCallback(
    (noteId: string, e: MouseEvent) => {
      e.stopPropagation()
      const tid = noteFlushTimers.current.get(noteId)
      if (tid !== undefined) window.clearTimeout(tid)
      noteFlushTimers.current.delete(noteId)
      const snapshotNotes = notesRef.current
      const snapshotSelected = selectedId
      const deleted = snapshotNotes.find((n) => n.id === noteId)
      void (async () => {
        const api = getApi()
        const cwd = dataRootRef.current
        if (diskMode && cwd && api?.workspace?.deleteNoteFiles && deleted) {
          const r = await api.workspace.deleteNoteFiles({
            cwd,
            folderId: deleted.folderId,
            noteId
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
            noteId,
          })
          if (!emb.ok) {
            console.error('[notelab] deleteNoteDocument failed', emb.error)
          }
        }
        setNotes((prev) => prev.filter((n) => n.id !== noteId))
        setOpenNoteTabIds((prev) => prev.filter((id) => id !== noteId))
        if (snapshotSelected === noteId) {
          const next = snapshotNotes.filter((n) => n.id !== noteId)
          const nextSel = next[0]?.id ?? null
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
    [diskMode, refreshWorkspaceGitStatuses, selectedId, useGithubApiSync]
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

  const openFolderSettings = useCallback((folderId: string, e: MouseEvent) => {
    e.stopPropagation()
    setAppMode('notes')
    setAppSidebarView('explorer')
    setTabOverviewOpen(false)
    setWorkspaceSettingsFolderId(folderId)
    setSelectedId(null)
    setFocusedFolderId(folderId)
    setNewNoteDestinationFolderId(folderId)
    setTreeExpandIds(treeExpandIdsForFolderId(folderId))
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

  const focusFolderInTree = useCallback((folderId: string) => {
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setAppSidebarView('explorer')
    setSelectedId(null)
    setFocusedFolderId(folderId)
    setNewNoteDestinationFolderId(folderId)
    setTreeExpandIds(treeExpandIdsForFolderId(folderId))
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const openFolderSettingsPanel = useCallback((folderId: string) => {
    setAppMode('notes')
    setAppSidebarView('explorer')
    setWorkspaceSettingsFolderId(folderId)
    setSelectedId(null)
    setFocusedFolderId(folderId)
    setNewNoteDestinationFolderId(folderId)
    setTreeExpandIds(treeExpandIdsForFolderId(folderId))
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const clearSidebarWorkspaceIntent = useCallback(() => {
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
    setFocusedFolderId(null)
  }, [])

  const renameFolder = useCallback(
    (folderId: string, name: string) => {
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)))
      const root = dataRootRef.current
      if (diskMode && root) {
        if (useGithubApiSync) setGithubApiDirty(true)
        void refreshWorkspaceGitStatuses()
      }
    },
    [diskMode, refreshWorkspaceGitStatuses, useGithubApiSync]
  )

  const deleteFolder = useCallback(
    async (folderId: string) => {
      if (folderId === DEFAULT_WORKSPACE_ID) return
      const root = dataRootRef.current
      const api = getApi()
      if (!diskMode || !root || !api?.workspace?.deleteFolder) return

      const noteIdsToClose = new Set(
        notesRef.current.filter((n) => n.folderId === folderId).map((n) => n.id)
      )
      const prevTabs = openNoteTabIdsRef.current
      const nextTabs = prevTabs.filter((id) => !noteIdsToClose.has(id))

      const r = await api.workspace.deleteFolder({
        cwd: root,
        folderId
      })
      if (!r.ok) {
        console.error('[notelab] delete workspace failed', r.error)
        return
      }
      void api?.embeddings?.deleteWorkspaceDocuments?.({ workspacePath: root, workspaceId: folderId })

      setWorkspaceSettingsFolderId((prev) => (prev === folderId ? null : prev))
      setFocusedFolderId((fid) => (fid === folderId ? null : fid))
      setOpenNoteTabIds(nextTabs)
      setSelectedId((current) => {
        if (!current || !noteIdsToClose.has(current)) return current
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

  const defaultExpandedFolderIds = useMemo(() => folders.map((f) => treeFolderId(f.id)), [folders])

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
    selectedId,
    openNoteTabIds,
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
    folders,
    notesByFolder,
    canCreateNote,
    folderCreateOpen,
    folderDraft,
    folderInputRef,
    onFolderNameChange,
    onFolderNameBlur,
    selectedId,
    openNoteTabIds,
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
    primaryGitFolderId: primaryGitFolder?.id ?? null,
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

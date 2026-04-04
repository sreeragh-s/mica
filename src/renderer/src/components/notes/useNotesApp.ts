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

import { backendFetchJson } from '@/lib/backend-api'
import { getApi, getWindowApi } from '@/lib/auth-bridge'
import {
  buildIndexingStatus,
  indexNote,
  type IndexingNoteStatus,
  type IndexingStatus
} from '@/lib/embedding-pipeline'
import { mergeGithubContentShas, loadGithubContentShas } from '@/lib/github-shas-storage'
import { isMacElectron } from '@/lib/electron-env'
import { loadSetupState } from '@/lib/setup-storage'
import { diskBodyToContent } from '@/lib/markdown-to-serialized'
import {
  DEFAULT_WORKSPACE_ID,
  loadNotesState,
  type SavedNote,
  type WorkspaceFolder,
  saveNotesState
} from '@/lib/notes-storage'
import {
  loadShortcutBindings,
  resetShortcutBindings,
  saveShortcutBindings,
  keyboardEventMatchesBinding,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutBindingsMap
} from '@/lib/shortcuts-storage'
import {
  buildMarkdownSyncPayload,
  buildNoteMarkdownDocument,
  newWorkspaceFolderId,
  noteMarkdownRelativePath,
  workspaceReadmeMarkdown
} from '@/lib/workspace-markdown-sync'
import type { AppMode, NotesAppProps, SettingsSection } from './notes-app-types'
import {
  createEmptyDrawing,
  createEmptyNote,
  macTitlebarStyles,
  mergeFolderOrder,
  reorderFolderIdsBeforeTarget,
  reorderFolderIdsToEnd,
  serializedEditorStatesEqual,
  treeFolderId,
  treeNoteId
} from './notes-app-utils'

/** Root notes have no folder node in the tree; only user workspaces expand. */
function treeExpandIdsForFolderId(folderId: string): string[] {
  return folderId === DEFAULT_WORKSPACE_ID ? [] : [treeFolderId(folderId)]
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- view-model shape is NotesAppViewModel below
export function useNotesApp({
  user,
  guestMode = false,
  onSignOut,
  onConnectGitHub
}: NotesAppProps) {
  const macElectron = isMacElectron()
  const folderInputRef = useRef<HTMLInputElement>(null)
  const folderDraftRef = useRef('')
  const dataRootRef = useRef<string | null>(null)

  const [appMode, setAppMode] = useState<AppMode>('notes')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('account')

  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus>({
    notes: [],
    pendingCount: 0,
    indexedCount: 0,
    running: false
  })
  /** Used to abort an in-progress indexing run when a new one starts. */
  const indexingAbortRef = useRef(false)

  const initial = useMemo(() => loadNotesState(), [])
  const persistedSidebarFolderOrderRef = useRef<string[]>(
    initial.version === 3 && Array.isArray(initial.sidebarFolderOrder)
      ? initial.sidebarFolderOrder
      : []
  )
  const initialFolders = initial.version === 3 ? [] : initial.folders
  const initialNotes = initial.version === 3 ? [] : initial.notes
  const [folders, setFolders] = useState<WorkspaceFolder[]>(initialFolders)
  const [notes, setNotes] = useState<SavedNote[]>(initialNotes)
  const [githubRemoteUrl, setGithubRemoteUrl] = useState(() => initial.githubRemoteUrl ?? '')
  const [diskMode, setDiskMode] = useState(false)
  /** Data root (~/.gitnotes); used when `folders` omits the default workspace but Git still runs at repo root. */
  const [dataRootPath, setDataRootPath] = useState<string | null>(null)

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

  const [graphViewOpen, setGraphViewOpen] = useState(false)
  const [tabOverviewOpen, setTabOverviewOpen] = useState(false)

  const [nativeLiquidGlassAttached, setNativeLiquidGlassAttached] = useState(false)

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  )

  const focusedFolder = useMemo((): WorkspaceFolder | null => {
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
    if (selectedId) return [treeNoteId(selectedId)]
    if (workspaceSettingsFolderId) {
      return [treeFolderId(workspaceSettingsFolderId)]
    }
    if (focusedFolderId) return [treeFolderId(focusedFolderId)]
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
              } satisfies WorkspaceFolder)
            : null))
        : null,
    [folders, workspaceSettingsFolderId, dataRootPath]
  )

  const workspaceSettingsCanDelete = useMemo(
    () =>
      diskMode &&
      Boolean(dataRootPath) &&
      Boolean(getApi()?.workspace?.deleteWorkspaceFolder) &&
      workspaceSettingsFolderId != null &&
      workspaceSettingsFolderId !== DEFAULT_WORKSPACE_ID,
    [diskMode, dataRootPath, workspaceSettingsFolderId]
  )

  const primaryGitFolder = useMemo((): WorkspaceFolder | null => {
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
    (workspaceId: string | undefined | null): WorkspaceFolder | null => {
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

  const foldersRef = useRef(folders)
  foldersRef.current = folders
  const notesRef = useRef(notes)
  notesRef.current = notes

  const openNoteTabIdsRef = useRef(openNoteTabIds)
  openNoteTabIdsRef.current = openNoteTabIds

  const markdownSyncGen = useRef(0)
  const noteFlushTimers = useRef<Map<string, number>>(new Map())
  const pendingDiskWrites = useRef<Set<string>>(new Set())

  const [dirtyByWorkspaceId, setDirtyByWorkspaceId] = useState<Record<string, boolean>>({})
  const [gitCommitMessage, setGitCommitMessage] = useState('Update notes')
  const [gitSyncBusy, setGitSyncBusy] = useState(false)
  const [gitSyncError, setGitSyncError] = useState<string | null>(null)
  const [gitHubBusy, setGitHubBusy] = useState(false)
  const [gitHubMessage, setGitHubMessage] = useState<string | null>(null)

  const [setupSyncMode] = useState<'git' | 'github_api' | 'local' | undefined>(
    () => loadSetupState().syncMode
  )
  const useGithubApiSync = setupSyncMode === 'github_api'
  const [githubApiDirty, setGithubApiDirty] = useState(false)

  const refreshWorkspaceGitStatuses = useCallback(async () => {
    const api = getApi()
    if (useGithubApiSync) {
      const next: Record<string, boolean> = {}
      for (const f of foldersRef.current) {
        if (!f.localGitPath) continue
        next[f.id] = githubApiDirty
      }
      if (foldersRef.current.length === 0 && dataRootRef.current) {
        next[DEFAULT_WORKSPACE_ID] = githubApiDirty
      }
      setDirtyByWorkspaceId(next)
      return
    }
    if (!api?.workspace?.gitStatus) return
    const next: Record<string, boolean> = {}
    for (const f of foldersRef.current) {
      if (!f.localGitPath) continue
      const s = await api.workspace.gitStatus({ cwd: f.localGitPath })
      if (s.ok) next[f.id] = s.dirty
    }
    const rootCwd = dataRootRef.current
    if (foldersRef.current.length === 0 && rootCwd) {
      const s = await api.workspace.gitStatus({ cwd: rootCwd })
      if (s.ok) next[DEFAULT_WORKSPACE_ID] = s.dirty
    }
    setDirtyByWorkspaceId(next)
  }, [useGithubApiSync, githubApiDirty])

  type GitnotesIndexOk = {
    ok: true
    workspaces: { id: string; name: string }[]
    notes: {
      workspaceId: string
      noteId: string
      title: string
      updatedAtMs: number
      markdownBody: string
      kind?: 'note' | 'drawing'
    }[]
  }

  const applyGitnotesIndex = useCallback((idx: GitnotesIndexOk, cwd: string) => {
    /** Root bucket `default/` is shown as top-level notes only, not a second folder row. */
    const mappedFolders: WorkspaceFolder[] = idx.workspaces
      .filter((w) => w.id !== DEFAULT_WORKSPACE_ID)
      .map((w) => ({
        id: w.id,
        name: w.name,
        localGitPath: cwd
      }))
    const mappedNotes: SavedNote[] = idx.notes.map((n) => {
      const kind = n.kind ?? 'note'
      if (kind === 'drawing') {
        return {
          id: n.noteId,
          folderId: n.workspaceId,
          title: n.title,
          updatedAt: n.updatedAtMs,
          content: null,
          kind: 'drawing' as const,
          excalidrawScene: n.markdownBody.trim() || null
        }
      }
      return {
        id: n.noteId,
        folderId: n.workspaceId,
        title: n.title,
        updatedAt: n.updatedAtMs,
        content: diskBodyToContent(n.markdownBody),
        kind: 'note' as const
      }
    })
    if (idx.workspaces.length === 0 && idx.notes.length === 0) {
      setFolders([])
      persistedSidebarFolderOrderRef.current = []
      setNotes([])
      setSelectedId(null)
      setOpenNoteTabIds([])
      setFocusedFolderId(null)
      setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
      return
    }
    /** Keep notes created in this session that are not in the index yet (e.g. before disk flush). */
    const diskIds = new Set(mappedNotes.map((n) => n.id))
    const validFolderId = (fid: string) =>
      fid === DEFAULT_WORKSPACE_ID || mappedFolders.some((f) => f.id === fid)
    const localPending = notesRef.current.filter(
      (n) => !diskIds.has(n.id) && validFolderId(n.folderId)
    )
    const mergedNotes = [...localPending, ...mappedNotes]

    const orderedFolders = mergeFolderOrder(mappedFolders, persistedSidebarFolderOrderRef.current)
    persistedSidebarFolderOrderRef.current = orderedFolders.map((f) => f.id)
    setFolders(orderedFolders)
    setNotes(mergedNotes)
    setSelectedId((sel) => {
      if (sel && mergedNotes.some((x) => x.id === sel)) return sel
      return mergedNotes.length > 0
        ? [...mergedNotes].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id
        : null
    })
    setOpenNoteTabIds((prev) => {
      const validPrev = prev.filter((id) => mergedNotes.some((n) => n.id === id))
      if (validPrev.length > 0) return validPrev
      if (mergedNotes.length === 0) return []
      const defaultId = [...mergedNotes].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id
      return [defaultId]
    })
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
  }, [])

  const reloadNotesFromDisk = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readGitnotesIndex) return
    const r = await api.workspace.readGitnotesIndex({ cwd })
    if (!r.ok) return
    applyGitnotesIndex(r, cwd)
  }, [applyGitnotesIndex])

  const handleGithubApiPull = useCallback(async () => {
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const r = await backendFetchJson<{
        files: { path: string; content: string; sha?: string }[]
        commitSha?: string | null
      }>('/api/github/sync/pull', { method: 'POST' })
      if (!r.ok) {
        setGitSyncError(r.message)
        return
      }
      const cwd = dataRootRef.current
      const api = getApi()
      if (!cwd || !api?.workspace?.writeNoteFile) {
        setGitSyncError('No data root')
        return
      }
      const shaPatch: Record<string, string> = {}
      for (const f of r.data.files) {
        const rel = f.path.replace(/\\/g, '/')
        const wr = await api.workspace.writeNoteFile({
          cwd,
          relativePath: rel,
          content: f.content
        })
        if (!wr.ok) {
          setGitSyncError(wr.error)
          return
        }
        if (f.sha) shaPatch[rel] = f.sha
      }
      mergeGithubContentShas(shaPatch)
      await reloadNotesFromDisk()
      setGithubApiDirty(false)
    } finally {
      setGitSyncBusy(false)
    }
  }, [reloadNotesFromDisk])

  const handleGithubApiPush = useCallback(async () => {
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const cwd = dataRootRef.current
      if (!cwd) {
        setGitSyncError('No data root')
        return
      }
      const shas = loadGithubContentShas()
      const files: { path: string; content: string; sha?: string | null }[] = []
      const rootNotes = notesRef.current.filter((n) => n.folderId === DEFAULT_WORKSPACE_ID)
      if (rootNotes.length > 0) {
        const inbox: WorkspaceFolder = { id: DEFAULT_WORKSPACE_ID, name: 'Root' }
        const payload = buildMarkdownSyncPayload(inbox, rootNotes)
        for (const p of payload) {
          const rel = p.relativePath.replace(/\\/g, '/')
          files.push({
            path: rel,
            content: p.content,
            sha: shas[rel] ?? null
          })
        }
      }
      for (const f of foldersRef.current) {
        const wsNotes = notesRef.current.filter((n) => n.folderId === f.id)
        const payload = buildMarkdownSyncPayload(f, wsNotes)
        for (const p of payload) {
          const rel = p.relativePath.replace(/\\/g, '/')
          files.push({
            path: rel,
            content: p.content,
            sha: shas[rel] ?? null
          })
        }
      }
      const r = await backendFetchJson<{ ok?: boolean; commitSha?: string | null }>(
        '/api/github/sync/push',
        {
          method: 'POST',
          body: {
            message: gitCommitMessage.trim() || 'Update notes',
            files
          }
        }
      )
      if (!r.ok || !(r.data as { ok?: boolean })?.ok) {
        setGitSyncError(!r.ok ? r.message : 'Push failed')
        return
      }
      setGithubApiDirty(false)
      await refreshWorkspaceGitStatuses()
    } finally {
      setGitSyncBusy(false)
    }
  }, [gitCommitMessage, refreshWorkspaceGitStatuses])

  const flushNoteToDisk = useCallback(
    async (noteId: string) => {
      const api = getApi()
      const cwd = dataRootRef.current
      if (!cwd || !api?.workspace?.writeNoteFile || !api.workspace.deleteNoteFiles) return
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note) return
      const isRoot = note.folderId === DEFAULT_WORKSPACE_ID
      const folder = foldersRef.current.find((f) => f.id === note.folderId)
      const effectiveCwd = isRoot ? cwd : folder?.localGitPath
      if (!effectiveCwd) return
      pendingDiskWrites.current.add(noteId)
      try {
        const rel = noteMarkdownRelativePath(note.folderId, note)
        const del = await api.workspace.deleteNoteFiles({
          cwd: effectiveCwd,
          workspaceId: note.folderId,
          noteId,
          exceptRelativePath: rel
        })
        if (!del.ok) {
          console.error('[gitnotes] delete before write failed', del.error)
        }
        const wr = await api.workspace.writeNoteFile({
          cwd: effectiveCwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note)
        })
        if (!wr.ok) {
          console.error('[gitnotes] write note failed', wr.error)
        }
        if (useGithubApiSync) {
          setGithubApiDirty(true)
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        pendingDiskWrites.current.delete(noteId)
      }
    },
    [refreshWorkspaceGitStatuses, useGithubApiSync]
  )

  const flushNoteMoveToDisk = useCallback(
    async (noteId: string, fromFolderId: string, toFolderId: string) => {
      const api = getApi()
      const cwd = dataRootRef.current
      if (!cwd || !api?.workspace?.writeNoteFile || !api.workspace.deleteNoteFiles) return
      /** `setNotes` runs before the next render; `notesRef` may still hold the pre-move folder. */
      const raw = notesRef.current.find((n) => n.id === noteId)
      if (!raw) return
      const note = { ...raw, folderId: toFolderId }
      const targetRoot = toFolderId === DEFAULT_WORKSPACE_ID
      const targetFolder = foldersRef.current.find((f) => f.id === toFolderId)
      const writeCwd = targetRoot ? cwd : targetFolder?.localGitPath
      if (!writeCwd) return
      pendingDiskWrites.current.add(noteId)
      try {
        const del = await api.workspace.deleteNoteFiles({
          cwd,
          workspaceId: fromFolderId,
          noteId
        })
        if (!del.ok) {
          console.error('[gitnotes] delete note files after move failed', del.error)
        }
        const rel = noteMarkdownRelativePath(toFolderId, note)
        const wr = await api.workspace.writeNoteFile({
          cwd: writeCwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note)
        })
        if (!wr.ok) {
          console.error('[gitnotes] write note after move failed', wr.error)
        }
        if (useGithubApiSync) {
          setGithubApiDirty(true)
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        pendingDiskWrites.current.delete(noteId)
      }
    },
    [refreshWorkspaceGitStatuses, useGithubApiSync]
  )

  const scheduleNoteFlush = useCallback(
    (noteId: string) => {
      if (!diskMode) return
      const prev = noteFlushTimers.current.get(noteId)
      if (prev !== undefined) window.clearTimeout(prev)
      const tid = window.setTimeout(() => {
        noteFlushTimers.current.delete(noteId)
        void flushNoteToDisk(noteId)
      }, 480)
      noteFlushTimers.current.set(noteId, tid)
    },
    [diskMode, flushNoteToDisk]
  )

  const handleGitCommit = useCallback(
    async (workspaceId?: string) => {
      if (useGithubApiSync) {
        await handleGithubApiPush()
        return
      }
      const api = getApi()
      const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
      const folder = resolveGitFolderForId(wid)
      if (!folder?.localGitPath || !api?.workspace?.gitCommit) return
      setGitSyncBusy(true)
      setGitSyncError(null)
      try {
        const r = await api.workspace.gitCommit({
          cwd: folder.localGitPath,
          message: gitCommitMessage.trim() || 'Update notes',
          authorName: user?.name?.trim() || 'GitNotes',
          authorEmail: user?.email?.trim() || 'gitnotes@local'
        })
        if (!r.ok && r.error !== 'nothing_to_commit') {
          setGitSyncError(r.error)
          return
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        setGitSyncBusy(false)
      }
    },
    [
      selectedNote,
      focusedFolderId,
      resolveGitFolderForId,
      gitCommitMessage,
      user,
      refreshWorkspaceGitStatuses,
      useGithubApiSync,
      handleGithubApiPush
    ]
  )

  const handleGitPush = useCallback(
    async (workspaceId?: string) => {
      if (useGithubApiSync) {
        await handleGithubApiPush()
        return
      }
      const api = getApi()
      const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
      const folder = resolveGitFolderForId(wid)
      if (!folder?.localGitPath || !api?.workspace?.gitPush) return
      setGitSyncBusy(true)
      setGitSyncError(null)
      try {
        const r = await api.workspace.gitPush({ cwd: folder.localGitPath })
        if (!r.ok) {
          setGitSyncError(r.error)
          return
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        setGitSyncBusy(false)
      }
    },
    [
      selectedNote,
      focusedFolderId,
      resolveGitFolderForId,
      refreshWorkspaceGitStatuses,
      useGithubApiSync,
      handleGithubApiPush
    ]
  )

  const handleGitPull = useCallback(
    async (workspaceId?: string) => {
      if (useGithubApiSync) {
        await handleGithubApiPull()
        return
      }
      const api = getApi()
      const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
      const folder = resolveGitFolderForId(wid)
      if (!folder?.localGitPath || !api?.workspace?.gitPull) return
      setGitSyncBusy(true)
      setGitSyncError(null)
      try {
        const r = await api.workspace.gitPull({ cwd: folder.localGitPath })
        if (!r.ok) {
          setGitSyncError(r.error)
          return
        }
        await reloadNotesFromDisk()
        await refreshWorkspaceGitStatuses()
      } finally {
        setGitSyncBusy(false)
      }
    },
    [
      selectedNote,
      focusedFolderId,
      resolveGitFolderForId,
      reloadNotesFromDisk,
      refreshWorkspaceGitStatuses,
      useGithubApiSync,
      handleGithubApiPull
    ]
  )

  const handleGitPullThenPush = useCallback(
    async (workspaceId?: string) => {
      if (useGithubApiSync) {
        await handleGithubApiPull()
        await handleGithubApiPush()
        return
      }
      const api = getApi()
      const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
      const folder = resolveGitFolderForId(wid)
      if (!folder?.localGitPath || !api?.workspace?.gitPull || !api.workspace.gitPush) return
      setGitSyncBusy(true)
      setGitSyncError(null)
      try {
        const pullR = await api.workspace.gitPull({ cwd: folder.localGitPath })
        if (!pullR.ok) {
          setGitSyncError(pullR.error)
          return
        }
        await reloadNotesFromDisk()
        const pushR = await api.workspace.gitPush({ cwd: folder.localGitPath })
        if (!pushR.ok) {
          setGitSyncError(pushR.error)
          return
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        setGitSyncBusy(false)
      }
    },
    [
      selectedNote,
      focusedFolderId,
      resolveGitFolderForId,
      reloadNotesFromDisk,
      refreshWorkspaceGitStatuses,
      useGithubApiSync,
      handleGithubApiPull,
      handleGithubApiPush
    ]
  )

  const handleGitCommitAndPush = useCallback(
    async (workspaceId?: string) => {
      if (useGithubApiSync) {
        await handleGithubApiPush()
        return
      }
      const api = getApi()
      const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
      const folder = resolveGitFolderForId(wid)
      if (!folder?.localGitPath || !api?.workspace?.gitCommit) return
      setGitSyncBusy(true)
      setGitSyncError(null)
      try {
        const c = await api.workspace.gitCommit({
          cwd: folder.localGitPath,
          message: gitCommitMessage.trim() || 'Update notes',
          authorName: user?.name?.trim() || 'GitNotes',
          authorEmail: user?.email?.trim() || 'gitnotes@local'
        })
        if (!c.ok && c.error !== 'nothing_to_commit') {
          setGitSyncError(c.error)
          return
        }
        if (api.workspace.gitPush) {
          const p = await api.workspace.gitPush({
            cwd: folder.localGitPath
          })
          if (!p.ok) {
            setGitSyncError(p.error)
            return
          }
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        setGitSyncBusy(false)
      }
    },
    [
      selectedNote,
      focusedFolderId,
      resolveGitFolderForId,
      gitCommitMessage,
      user,
      refreshWorkspaceGitStatuses,
      useGithubApiSync,
      handleGithubApiPush
    ]
  )

  useEffect(() => {
    const api = getApi()
    const ws = api?.workspace
    if (!ws?.ensureDataRoot || !ws.readGitnotesIndex) return
    let cancelled = false
    void (async () => {
      const rootR = await ws.ensureDataRoot!()
      if (!rootR.ok || cancelled) return
      const cwd = rootR.path
      dataRootRef.current = cwd
      setDataRootPath(cwd)

      const idxR = await ws.readGitnotesIndex({ cwd })
      if (!idxR.ok || cancelled) return

      const persisted = loadNotesState()
      const diskEmpty = idxR.workspaces.length === 0 && idxR.notes.length === 0
      const hasLocal =
        persisted.version === 2 && (persisted.notes.length > 0 || persisted.folders.length > 0)

      if (persisted.version === 2 && hasLocal && diskEmpty && ws.syncMarkdown) {
        for (const f of persisted.folders) {
          const wsNotes = persisted.notes.filter((n) => n.folderId === f.id)
          const files = buildMarkdownSyncPayload(f, wsNotes)
          const sync = await ws.syncMarkdown({
            cwd,
            workspaceId: f.id,
            files,
            pruneOrphanNoteFiles: true
          })
          if (!sync.ok) {
            console.error('[gitnotes] migration sync failed', sync.error)
          }
        }
        saveNotesState({
          version: 3,
          ...(persisted.githubRemoteUrl ? { githubRemoteUrl: persisted.githubRemoteUrl } : {})
        })
      } else if (persisted.version === 2 && !hasLocal && diskEmpty && ws.syncMarkdown) {
        const defaultFolder = {
          id: DEFAULT_WORKSPACE_ID,
          name: 'Notes'
        }
        const files = buildMarkdownSyncPayload(defaultFolder, [])
        const sync = await ws.syncMarkdown({
          cwd,
          workspaceId: DEFAULT_WORKSPACE_ID,
          files,
          pruneOrphanNoteFiles: false
        })
        if (!sync.ok) {
          console.error('[gitnotes] default workspace init failed', sync.error)
        }
        saveNotesState({
          version: 3,
          ...(persisted.githubRemoteUrl ? { githubRemoteUrl: persisted.githubRemoteUrl } : {})
        })
      } else if (persisted.version === 2 && !diskEmpty) {
        saveNotesState({
          version: 3,
          ...(persisted.githubRemoteUrl ? { githubRemoteUrl: persisted.githubRemoteUrl } : {})
        })
      } else if (persisted.version === 3 && diskEmpty && ws.syncMarkdown) {
        const defaultFolder = {
          id: DEFAULT_WORKSPACE_ID,
          name: 'Notes'
        }
        const files = buildMarkdownSyncPayload(defaultFolder, [])
        const sync = await ws.syncMarkdown({
          cwd,
          workspaceId: DEFAULT_WORKSPACE_ID,
          files,
          pruneOrphanNoteFiles: false
        })
        if (!sync.ok) {
          console.error('[gitnotes] v3 empty disk reinit failed', sync.error)
        }
      }

      const fresh = await ws.readGitnotesIndex({ cwd })
      if (!fresh.ok || cancelled) return
      setDiskMode(true)
      applyGitnotesIndex(fresh, cwd)
    })()
    return () => {
      cancelled = true
    }
  }, [applyGitnotesIndex])

  useEffect(() => {
    const t = window.setTimeout(() => {
      const remote = githubRemoteUrl.trim()
      if (diskMode) {
        saveNotesState({
          version: 3,
          ...(remote ? { githubRemoteUrl: remote } : {}),
          sidebarFolderOrder: folders.map((f) => f.id)
        })
        return
      }
      saveNotesState({
        version: 2,
        folders,
        notes,
        ...(remote ? { githubRemoteUrl: remote } : {})
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [diskMode, folders, notes, githubRemoteUrl])

  const gitToolbarFolder = useMemo((): WorkspaceFolder | null => {
    if (!primaryGitFolder?.localGitPath) return null
    return {
      id: 'app-git',
      name: '~/.gitnotes',
      localGitPath: primaryGitFolder.localGitPath,
      githubRemoteUrl: githubRemoteUrl.trim() || primaryGitFolder.githubRemoteUrl
    }
  }, [primaryGitFolder, githubRemoteUrl])

  const gitDirtyGlobal = useMemo(() => {
    if (useGithubApiSync) return githubApiDirty
    return Object.values(dirtyByWorkspaceId).some(Boolean)
  }, [useGithubApiSync, githubApiDirty, dirtyByWorkspaceId])

  const handleSaveGithubRemote = useCallback(() => {
    const u = githubRemoteUrl.trim()
    setGithubRemoteUrl(u)
    setFolders((prev) => prev.map((f) => ({ ...f, githubRemoteUrl: u || undefined })))
    setGitHubMessage(u ? 'Saved remote URL.' : 'Cleared saved remote URL.')
  }, [githubRemoteUrl])

  const handleApplyGithubRemote = useCallback(async () => {
    const api = getApi()
    const cwd = primaryGitFolder?.localGitPath
    if (!api?.workspace?.setGitRemote || !cwd) return
    const url = githubRemoteUrl.trim()
    if (!url) {
      setGitHubMessage('Enter a remote URL first.')
      return
    }
    setGitHubBusy(true)
    setGitHubMessage(null)
    const r = await api.workspace.setGitRemote({ cwd, url })
    setGitHubBusy(false)
    if (r.ok) {
      setGithubRemoteUrl(url)
      setFolders((prev) => prev.map((f) => ({ ...f, githubRemoteUrl: url })))
      setGitHubMessage('Remote origin set on ~/.gitnotes.')
    } else {
      setGitHubMessage(r.error)
    }
  }, [primaryGitFolder?.localGitPath, githubRemoteUrl])

  useEffect(() => {
    if (diskMode) return
    const api = getApi()
    if (!api?.workspace?.syncMarkdown) return
    const targets = folders.filter((f) => f.localGitPath)
    if (targets.length === 0) return
    const gen = ++markdownSyncGen.current
    const t = window.setTimeout(() => {
      void (async () => {
        for (const f of targets) {
          if (gen !== markdownSyncGen.current) return
          const wsNotes = notes.filter((n) => n.folderId === f.id)
          const files = buildMarkdownSyncPayload(f, wsNotes)
          const r = await api.workspace!.syncMarkdown!({
            cwd: f.localGitPath!,
            workspaceId: f.id,
            files,
            pruneOrphanNoteFiles: true
          })
          if (!r.ok) {
            console.error('[gitnotes] markdown sync failed', r.error)
          }
        }
        if (gen === markdownSyncGen.current) {
          await refreshWorkspaceGitStatuses()
        }
      })()
    }, 550)
    return () => window.clearTimeout(t)
  }, [diskMode, folders, notes, refreshWorkspaceGitStatuses])

  useEffect(() => {
    if (!folders.some((f) => f.localGitPath) && !(diskMode && dataRootPath)) return
    void refreshWorkspaceGitStatuses()
  }, [folders, diskMode, dataRootPath, refreshWorkspaceGitStatuses])

  useEffect(() => {
    if (!folders.some((f) => f.localGitPath) && !(diskMode && dataRootPath)) return
    const id = window.setInterval(() => {
      void refreshWorkspaceGitStatuses()
    }, 12_000)
    return () => window.clearInterval(id)
  }, [folders, diskMode, dataRootPath, refreshWorkspaceGitStatuses])

  useEffect(() => {
    const onFocus = (): void => {
      void refreshWorkspaceGitStatuses()
      if (diskMode && pendingDiskWrites.current.size === 0 && dataRootRef.current) {
        void reloadNotesFromDisk()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [diskMode, refreshWorkspaceGitStatuses, reloadNotesFromDisk])

  useEffect(() => {
    return () => {
      for (const tid of noteFlushTimers.current.values()) {
        window.clearTimeout(tid)
      }
      noteFlushTimers.current.clear()
    }
  }, [])

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

  const appendWorkspaceFolder = useCallback(
    (name: string): string => {
      const id = newWorkspaceFolderId(name)
      const root = dataRootRef.current
      setFolders((prev) => {
        const next = [...prev, { id, name, ...(root ? { localGitPath: root } : {}) }]
        persistedSidebarFolderOrderRef.current = next.map((f) => f.id)
        return next
      })
      if (diskMode && root) {
        const api = getApi()
        if (api?.workspace?.writeNoteFile) {
          void (async () => {
            const rel = `gitnotes/workspaces/${id}/README.md`
            const wr = await api.workspace!.writeNoteFile!({
              cwd: root,
              relativePath: rel,
              content: workspaceReadmeMarkdown(name)
            })
            if (!wr.ok) {
              console.error('[gitnotes] workspace readme failed', wr.error)
            }
            if (useGithubApiSync) setGithubApiDirty(true)
            await refreshWorkspaceGitStatuses()
          })()
        }
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
        const fid = id.slice(7)
        setSelectedId(null)
        setFocusedFolderId(fid)
        setNewNoteDestinationFolderId(fid)
        return
      }
      setSelectedId(null)
      setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
    },
    [selectNote]
  )

  const handleNewNote = useCallback(() => {
    let fid = newNoteDestinationFolderId
    const valid = fid === DEFAULT_WORKSPACE_ID || foldersRef.current.some((f) => f.id === fid)
    if (!valid) {
      fid = DEFAULT_WORKSPACE_ID
    }
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
      const t = title.trim()
      if (!t) return
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, title: t, updatedAt: Date.now() } : n))
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

  const reorderWorkspaceFolders = useCallback((draggedFolderId: string, targetFolderId: string) => {
    if (draggedFolderId === targetFolderId) return
    setFolders((prev) => {
      const ids = prev.map((f) => f.id)
      const nextIds = reorderFolderIdsBeforeTarget(ids, draggedFolderId, targetFolderId)
      if (!nextIds) return prev
      const byId = new Map(prev.map((f) => [f.id, f]))
      persistedSidebarFolderOrderRef.current = nextIds
      return nextIds.map((id) => byId.get(id)!).filter(Boolean) as WorkspaceFolder[]
    })
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const reorderWorkspaceFolderToEnd = useCallback((draggedFolderId: string) => {
    setFolders((prev) => {
      const ids = prev.map((f) => f.id)
      const nextIds = reorderFolderIdsToEnd(ids, draggedFolderId)
      if (!nextIds) return prev
      const byId = new Map(prev.map((f) => [f.id, f]))
      persistedSidebarFolderOrderRef.current = nextIds
      return nextIds.map((id) => byId.get(id)!).filter(Boolean) as WorkspaceFolder[]
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
            workspaceId: deleted.folderId,
            noteId
          })
          if (!r.ok) {
            console.error('[gitnotes] delete note files failed', r.error)
          }
          if (useGithubApiSync) setGithubApiDirty(true)
          await refreshWorkspaceGitStatuses()
        }
        if (deleted) {
          void api?.embeddings?.deleteNoteEmbeddings({
            workspaceId: deleted.folderId,
            noteId
          })
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
    appendWorkspaceFolder(name)
    cancelFolderCreate()
  }, [appendWorkspaceFolder, cancelFolderCreate])

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
    setSettingsSection('account')
  }, [])

  const openWorkspaceSettings = useCallback((folderId: string, e: MouseEvent) => {
    e.stopPropagation()
    setAppMode('notes')
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
    setWorkspaceSettingsFolderId(null)
    setSelectedId(null)
    setFocusedFolderId(null)
    setNewNoteDestinationFolderId(DEFAULT_WORKSPACE_ID)
  }, [])

  const focusFolderInTree = useCallback((folderId: string) => {
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setSelectedId(null)
    setFocusedFolderId(folderId)
    setNewNoteDestinationFolderId(folderId)
    setTreeExpandIds(treeExpandIdsForFolderId(folderId))
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const openWorkspaceSettingsForFolder = useCallback((folderId: string) => {
    setAppMode('notes')
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

  const renameWorkspace = useCallback(
    (folderId: string, name: string) => {
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)))
      const root = dataRootRef.current
      if (diskMode && root) {
        const api = getApi()
        if (api?.workspace?.writeNoteFile) {
          void (async () => {
            const rel = `gitnotes/workspaces/${folderId}/README.md`
            const wr = await api.workspace!.writeNoteFile!({
              cwd: root,
              relativePath: rel,
              content: workspaceReadmeMarkdown(name)
            })
            if (!wr.ok) {
              console.error('[gitnotes] rename workspace readme failed', wr.error)
            }
            if (useGithubApiSync) setGithubApiDirty(true)
            await refreshWorkspaceGitStatuses()
          })()
        }
      }
    },
    [diskMode, refreshWorkspaceGitStatuses, useGithubApiSync]
  )

  const deleteWorkspace = useCallback(
    async (folderId: string) => {
      if (folderId === DEFAULT_WORKSPACE_ID) return
      const root = dataRootRef.current
      const api = getApi()
      if (!diskMode || !root || !api?.workspace?.deleteWorkspaceFolder) return

      const noteIdsToClose = new Set(
        notesRef.current.filter((n) => n.folderId === folderId).map((n) => n.id)
      )
      const prevTabs = openNoteTabIdsRef.current
      const nextTabs = prevTabs.filter((id) => !noteIdsToClose.has(id))

      const r = await api.workspace.deleteWorkspaceFolder({
        cwd: root,
        workspaceId: folderId
      })
      if (!r.ok) {
        console.error('[gitnotes] delete workspace failed', r.error)
        return
      }
      void api?.embeddings?.deleteWorkspaceEmbeddings({ workspaceId: folderId })

      persistedSidebarFolderOrderRef.current = persistedSidebarFolderOrderRef.current.filter(
        (id) => id !== folderId
      )
      setWorkspaceSettingsFolderId((prev) => (prev === folderId ? null : prev))
      setFocusedFolderId((fid) => (fid === folderId ? null : fid))
      setOpenNoteTabIds(nextTabs)
      setSelectedId((current) => {
        if (!current || !noteIdsToClose.has(current)) return current
        const idx = prevTabs.indexOf(current)
        return nextTabs[idx - 1] ?? nextTabs[idx] ?? nextTabs[0] ?? null
      })
      setDirtyByWorkspaceId((prev) => {
        if (!(folderId in prev)) return prev
        const next = { ...prev }
        delete next[folderId]
        return next
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

  /** Load all notes from disk and compare hashes to determine pending status. */
  const refreshIndexingStatus = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readGitnotesIndex) return
    const idx = await api.workspace.readGitnotesIndex({ cwd })
    if (!idx.ok) return
    const allNotes = idx.notes.map((n) => ({
      workspaceId: n.workspaceId,
      noteId: n.noteId,
      title: n.title,
      content: n.markdownBody,
      kind: n.kind
    }))
    const status = await buildIndexingStatus(allNotes)
    setIndexingStatus((prev) => ({ ...status, running: prev.running }))
  }, [])

  /** Index only notes that are new or have changed content. */
  const runIndexPending = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readGitnotesIndex) return
    indexingAbortRef.current = false
    setIndexingStatus((prev) => ({ ...prev, running: true }))

    const idx = await api.workspace.readGitnotesIndex({ cwd })
    if (!idx.ok) {
      setIndexingStatus((prev) => ({ ...prev, running: false }))
      return
    }

    // Ensure table exists
    await api.embeddings?.ensureTable()

    // Fetch stored hashes once
    const hashRes = await api.embeddings?.getIndexedHashes?.()
    const storedHashes = hashRes?.ok ? hashRes.hashes : {}

    const toIndex = idx.notes.filter((n) => {
      const stored = storedHashes[n.noteId]
      if (!stored) return true // not indexed yet
      // Compare hash inline: mark pending if we can't confirm it's the same
      // (full hash comparison happens inside indexNote)
      return true // we'll let indexNote skip unchanged ones
    })

    const updated: Record<string, IndexingNoteStatus['state']> = {}

    for (const n of toIndex) {
      if (indexingAbortRef.current) break
      setIndexingStatus((prev) => ({
        ...prev,
        notes: prev.notes.map((ns) =>
          ns.noteId === n.noteId ? { ...ns, state: 'indexing' } : ns
        )
      }))
      const result = await indexNote({
        workspaceId: n.workspaceId,
        noteId: n.noteId,
        content: n.markdownBody,
        kind: n.kind,
        storedHash: storedHashes[n.noteId]?.contentHash
      })
      if (!result.ok) {
        updated[n.noteId] = 'error'
      } else if (result.skipped && result.reason === 'no indexable content') {
        // No chunks → nothing to embed. buildIndexingStatus marks these as 'indexed' automatically.
        updated[n.noteId] = 'indexed'
      } else {
        // Either embedded successfully or skipped because content was unchanged (still indexed).
        updated[n.noteId] = 'indexed'
      }
    }

    setIndexingStatus((prev) => ({
      ...prev,
      running: false,
      notes: prev.notes.map((ns) =>
        updated[ns.noteId] !== undefined ? { ...ns, state: updated[ns.noteId]! } : ns
      ),
      pendingCount: prev.notes.filter((ns) =>
        updated[ns.noteId] !== undefined ? updated[ns.noteId] !== 'indexed' : ns.state === 'pending'
      ).length,
      indexedCount: prev.notes.filter((ns) =>
        updated[ns.noteId] !== undefined ? updated[ns.noteId] === 'indexed' : ns.state === 'indexed'
      ).length
    }))
  }, [])

  /** Force re-embed all notes regardless of stored hashes. */
  const runReindexAll = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readGitnotesIndex) return
    indexingAbortRef.current = false
    setIndexingStatus((prev) => ({ ...prev, running: true }))

    const idx = await api.workspace.readGitnotesIndex({ cwd })
    if (!idx.ok) {
      setIndexingStatus((prev) => ({ ...prev, running: false }))
      return
    }

    await api.embeddings?.ensureTable()

    const updated: Record<string, IndexingNoteStatus['state']> = {}

    for (const n of idx.notes) {
      if (indexingAbortRef.current) break
      setIndexingStatus((prev) => ({
        ...prev,
        notes: prev.notes.map((ns) =>
          ns.noteId === n.noteId ? { ...ns, state: 'indexing' } : ns
        )
      }))
      // Pass no storedHash to force re-embed
      const result = await indexNote({
        workspaceId: n.workspaceId,
        noteId: n.noteId,
        content: n.markdownBody,
        kind: n.kind
      })
      updated[n.noteId] = result.ok ? 'indexed' : 'error'
      // Notes with no indexable content are treated as 'indexed' (buildIndexingStatus handles them)
    }

    setIndexingStatus((prev) => ({
      ...prev,
      running: false,
      notes: prev.notes.map((ns) =>
        updated[ns.noteId] !== undefined ? { ...ns, state: updated[ns.noteId]! } : ns
      ),
      pendingCount: 0,
      indexedCount: prev.notes.filter((ns) => updated[ns.noteId] === 'indexed').length
    }))
  }, [])

  const backToNotes = useCallback(() => {
    setAppMode('notes')
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => !c)
  }, [])

  const exitZenMode = useCallback(() => {
    lastZenEscPressRef.current = 0
    setZenMode(false)
    const prev = sidebarCollapsedBeforeZenRef.current
    sidebarCollapsedBeforeZenRef.current = null
    if (prev !== null) {
      setSidebarCollapsed(prev)
    }
  }, [])

  const enterZenMode = useCallback(() => {
    if (appMode !== 'notes' || workspaceSettingsFolderId) return
    if (!selectedNote || selectedNote.kind === 'drawing') return
    if (zenModeRef.current) return
    lastZenEscPressRef.current = 0
    sidebarCollapsedBeforeZenRef.current = sidebarCollapsed
    setSidebarCollapsed(true)
    if (graphViewOpen) {
      setGraphViewOpen(false)
    }
    setZenMode(true)
  }, [appMode, workspaceSettingsFolderId, selectedNote, sidebarCollapsed, graphViewOpen])

  const toggleZenMode = useCallback(() => {
    if (zenModeRef.current) {
      exitZenMode()
    } else {
      enterZenMode()
    }
  }, [exitZenMode, enterZenMode])

  const closeGraphView = useCallback(() => {
    setGraphViewOpen(false)
  }, [])

  const openGraphView = useCallback(() => {
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setTabOverviewOpen(false)
    setGraphViewOpen(true)
  }, [])

  const openTabOverview = useCallback(() => {
    setGraphViewOpen(false)
    setTabOverviewOpen(true)
  }, [])

  const closeTabOverview = useCallback(() => {
    setTabOverviewOpen(false)
  }, [])

  const setShortcutsCaptureActive = useCallback((active: boolean) => {
    shortcutsSuppressedRef.current = active
  }, [])

  const updateShortcutBinding = useCallback((id: ShortcutActionId, binding: ShortcutBinding) => {
    setShortcutBindings((prev) => {
      const next = { ...prev, [id]: binding }
      saveShortcutBindings(next)
      return next
    })
  }, [])

  const resetShortcutsToDefaults = useCallback(() => {
    const next = resetShortcutBindings()
    setShortcutBindings(next)
  }, [])

  const defaultExpandedFolderIds = useMemo(() => folders.map((f) => treeFolderId(f.id)), [folders])

  const canCreateNote = true

  /** macOS: liquid sidebar overlays full-bleed main so glass blurs --background from the editor column. */
  const sidebarOverlayActive = useMemo(
    () => macElectron && !sidebarCollapsed && !zenMode,
    [macElectron, sidebarCollapsed, zenMode]
  )

  useEffect(() => {
    if (!zenMode) return
    if (
      appMode !== 'notes' ||
      workspaceSettingsFolderId ||
      !selectedNote ||
      selectedNote.kind === 'drawing'
    ) {
      exitZenMode()
    }
  }, [appMode, workspaceSettingsFolderId, selectedNote, zenMode, exitZenMode])

  useEffect(() => {
    const win = getWindowApi()
    if (!win) return
    void win.setZenPresentation(zenMode)
  }, [zenMode])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.getLiquidGlassState || !win.onLiquidGlassState) return
    void win.getLiquidGlassState().then((s) => setNativeLiquidGlassAttached(s.attached))
    return win.onLiquidGlassState((s) => setNativeLiquidGlassAttached(s.attached))
  }, [])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.onNativeFullScreenExit) return
    return win.onNativeFullScreenExit(() => {
      if (zenModeRef.current) {
        exitZenMode()
      }
    })
  }, [exitZenMode])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.setZenShortcutBinding) return
    void win.setZenShortcutBinding(shortcutBindings.toggleZenMode)
  }, [shortcutBindings.toggleZenMode])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.onZenShortcutFromMain) return
    return win.onZenShortcutFromMain(() => {
      if (shortcutsSuppressedRef.current) return
      toggleZenMode()
    })
  }, [toggleZenMode])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (shortcutsSuppressedRef.current) return
      if (zenModeRef.current && e.key === 'Escape' && !e.repeat) {
        const now = Date.now()
        if (now - lastZenEscPressRef.current < 500) {
          e.preventDefault()
          e.stopPropagation()
          lastZenEscPressRef.current = 0
          exitZenMode()
        } else {
          lastZenEscPressRef.current = now
        }
        return
      }
      if (e.repeat) return
      const map = shortcutBindingsRef.current
      if (keyboardEventMatchesBinding(e, map.toggleSidebar)) {
        e.preventDefault()
        e.stopPropagation()
        toggleSidebar()
        return
      }
      if (keyboardEventMatchesBinding(e, map.newNote)) {
        e.preventDefault()
        e.stopPropagation()
        if (appMode === 'settings') {
          setAppMode('notes')
        }
        handleNewNote()
        return
      }
      if (keyboardEventMatchesBinding(e, map.toggleZenMode)) {
        e.preventDefault()
        e.stopPropagation()
        toggleZenMode()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [appMode, handleNewNote, toggleSidebar, toggleZenMode, exitZenMode])

  const startFolderCreate = useCallback(() => {
    setFolderCreateOpen(true)
    setFolderDraft('')
    folderDraftRef.current = ''
  }, [])

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
    macElectron,
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
    gitSyncBusy,
    gitSyncError,
    handleTreeSelectionChange,
    handleNewNote,
    handleNewDrawing,
    handleExcalidrawSceneChange,
    renameNote,
    moveNoteToFolder,
    reorderWorkspaceFolders,
    reorderWorkspaceFolderToEnd,
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
    openWorkspaceSettings,
    navigateToNotesRoot,
    focusFolderInTree,
    openWorkspaceSettingsForFolder,
    clearSidebarWorkspaceIntent,
    selectNote,
    renameWorkspace,
    deleteWorkspace,
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
    handleApplyGithubRemote,
    gitHubBusy,
    gitHubMessage,
    gitToolbarFolder,
    gitDirtyGlobal,
    primaryGitFolderId: primaryGitFolder?.id ?? null,
    refreshWorkspaceGitStatuses,
    notes,
    graphViewOpen,
    openGraphView,
    closeGraphView,
    tabOverviewOpen,
    openTabOverview,
    closeTabOverview,
    notesCount: notes.length,
    syncTransport: useGithubApiSync ? ('github_api' as const) : ('git' as const),
    indexingStatus,
    refreshIndexingStatus,
    runIndexPending,
    runReindexAll
  }
}

export type NotesAppViewModel = ReturnType<typeof useNotesApp>

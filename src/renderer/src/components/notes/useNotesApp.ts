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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- view-model shape is NotesAppViewModel below
export function useNotesApp({ user, guestMode = false, onSignOut, onConnectGitHub }: NotesAppProps) {
  const macElectron = isMacElectron()
  const folderInputRef = useRef<HTMLInputElement>(null)
  const folderDraftRef = useRef('')
  const dataRootRef = useRef<string | null>(null)

  const [appMode, setAppMode] = useState<AppMode>('notes')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('account')

  const initial = useMemo(() => loadNotesState(), [])
  const persistedSidebarFolderOrderRef = useRef<string[]>(
    initial.version === 3 && Array.isArray(initial.sidebarFolderOrder)
      ? initial.sidebarFolderOrder
      : []
  )
  const initialFolders =
    initial.version === 3 ? [] : initial.folders
  const initialNotes = initial.version === 3 ? [] : initial.notes
  const [folders, setFolders] = useState<WorkspaceFolder[]>(initialFolders)
  const [notes, setNotes] = useState<SavedNote[]>(initialNotes)
  const [githubRemoteUrl, setGithubRemoteUrl] = useState(
    () => initial.githubRemoteUrl ?? ''
  )
  const [diskMode, setDiskMode] = useState(false)

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

  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(() => {
    const n = initialNotes
    if (n.length > 0) {
      const first = [...n].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      return first?.folderId ?? initialFolders[0]?.id ?? null
    }
    return initialFolders[0]?.id ?? null
  })

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

  const [splitViewOpen, setSplitViewOpen] = useState(false)
  const [splitNoteId, setSplitNoteId] = useState<string | null>(null)
  const [graphViewOpen, setGraphViewOpen] = useState(false)

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  )

  const focusedFolder = useMemo(
    () =>
      focusedFolderId
        ? folders.find((f) => f.id === focusedFolderId) ?? null
        : null,
    [folders, focusedFolderId]
  )

  const notesByFolder = useMemo(() => {
    const map = new Map<string, SavedNote[]>()
    for (const f of folders) {
      map.set(f.id, [])
    }
    const fallbackId = folders[0]?.id
    for (const n of notes) {
      const fid = map.has(n.folderId) ? n.folderId : fallbackId
      if (!fid) continue
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
        ? (folders.find((f) => f.id === workspaceSettingsFolderId) ?? null)
        : null,
    [folders, workspaceSettingsFolderId]
  )

  const splitNote = useMemo(
    () =>
      splitNoteId ? (notes.find((n) => n.id === splitNoteId) ?? null) : null,
    [notes, splitNoteId]
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

  const applyGitnotesIndex = useCallback(
    (idx: GitnotesIndexOk, cwd: string) => {
      const mappedFolders: WorkspaceFolder[] = idx.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        localGitPath: cwd,
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
      if (mappedFolders.length === 0) {
        setFolders([
          { id: DEFAULT_WORKSPACE_ID, name: 'Notes', localGitPath: cwd },
        ])
        persistedSidebarFolderOrderRef.current = [DEFAULT_WORKSPACE_ID]
        setNotes([])
        setSelectedId(null)
        setOpenNoteTabIds([])
        setFocusedFolderId(DEFAULT_WORKSPACE_ID)
        return
      }
      /** Keep notes created in this session that are not in the index yet (e.g. before disk flush). */
      const diskIds = new Set(mappedNotes.map((n) => n.id))
      const localPending = notesRef.current.filter((n) => !diskIds.has(n.id))
      const mergedNotes = [...localPending, ...mappedNotes]

      const orderedFolders = mergeFolderOrder(
        mappedFolders,
        persistedSidebarFolderOrderRef.current
      )
      persistedSidebarFolderOrderRef.current = orderedFolders.map((f) => f.id)
      setFolders(orderedFolders)
      setNotes(mergedNotes)
      setSelectedId((sel) => {
        if (sel && mergedNotes.some((x) => x.id === sel)) return sel
        return mergedNotes.length > 0
          ? [...mergedNotes].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id
          : null
      })
      setFocusedFolderId((fid) => {
        if (fid && mappedFolders.some((f) => f.id === fid)) return fid
        const n = mergedNotes[0]
        return n?.folderId ?? mappedFolders[0]?.id ?? null
      })
    },
    []
  )

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
          content: f.content,
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
      for (const f of foldersRef.current) {
        const wsNotes = notesRef.current.filter((n) => n.folderId === f.id)
        const payload = buildMarkdownSyncPayload(f, wsNotes)
        for (const p of payload) {
          const rel = p.relativePath.replace(/\\/g, '/')
          files.push({
            path: rel,
            content: p.content,
            sha: shas[rel] ?? null,
          })
        }
      }
      const r = await backendFetchJson<{ ok?: boolean; commitSha?: string | null }>(
        '/api/github/sync/push',
        {
          method: 'POST',
          body: {
            message: gitCommitMessage.trim() || 'Update notes',
            files,
          },
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
      const folder = foldersRef.current.find((f) => f.id === note.folderId)
      if (!folder?.localGitPath) return
      pendingDiskWrites.current.add(noteId)
      try {
        const del = await api.workspace.deleteNoteFiles({
          cwd,
          workspaceId: note.folderId,
          noteId,
        })
        if (!del.ok) {
          console.error('[gitnotes] delete before write failed', del.error)
        }
        const rel = noteMarkdownRelativePath(note.folderId, note)
        const wr = await api.workspace.writeNoteFile({
          cwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note),
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
    async (noteId: string, fromFolderId: string) => {
      const api = getApi()
      const cwd = dataRootRef.current
      if (!cwd || !api?.workspace?.writeNoteFile || !api.workspace.deleteNoteFiles) return
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note || note.folderId === fromFolderId) return
      const folder = foldersRef.current.find((f) => f.id === note.folderId)
      if (!folder?.localGitPath) return
      pendingDiskWrites.current.add(noteId)
      try {
        const del = await api.workspace.deleteNoteFiles({
          cwd,
          workspaceId: fromFolderId,
          noteId,
        })
        if (!del.ok) {
          console.error('[gitnotes] delete note files after move failed', del.error)
        }
        const rel = noteMarkdownRelativePath(note.folderId, note)
        const wr = await api.workspace.writeNoteFile({
          cwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note),
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

  const handleGitCommit = useCallback(async (workspaceId?: string) => {
    if (useGithubApiSync) {
      await handleGithubApiPush()
      return
    }
    const api = getApi()
    const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
    const folder = folders.find((x) => x.id === wid && x.localGitPath) ?? null
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
  }, [
    selectedNote,
    focusedFolderId,
    folders,
    gitCommitMessage,
    user,
    refreshWorkspaceGitStatuses,
    useGithubApiSync,
    handleGithubApiPush,
  ])

  const handleGitPush = useCallback(async (workspaceId?: string) => {
    if (useGithubApiSync) {
      await handleGithubApiPush()
      return
    }
    const api = getApi()
    const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
    const folder = folders.find((x) => x.id === wid && x.localGitPath) ?? null
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
  }, [
    selectedNote,
    focusedFolderId,
    folders,
    refreshWorkspaceGitStatuses,
    useGithubApiSync,
    handleGithubApiPush,
  ])

  const handleGitPull = useCallback(async (workspaceId?: string) => {
    if (useGithubApiSync) {
      await handleGithubApiPull()
      return
    }
    const api = getApi()
    const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
    const folder = folders.find((x) => x.id === wid && x.localGitPath) ?? null
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
  }, [
    selectedNote,
    focusedFolderId,
    folders,
    reloadNotesFromDisk,
    refreshWorkspaceGitStatuses,
    useGithubApiSync,
    handleGithubApiPull,
  ])

  const handleGitPullThenPush = useCallback(
    async (workspaceId?: string) => {
      if (useGithubApiSync) {
        await handleGithubApiPull()
        await handleGithubApiPush()
        return
      }
      const api = getApi()
      const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
      const folder = folders.find((x) => x.id === wid && x.localGitPath) ?? null
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
      folders,
      reloadNotesFromDisk,
      refreshWorkspaceGitStatuses,
      useGithubApiSync,
      handleGithubApiPull,
      handleGithubApiPush,
    ]
  )

  const handleGitCommitAndPush = useCallback(async (workspaceId?: string) => {
    if (useGithubApiSync) {
      await handleGithubApiPush()
      return
    }
    const api = getApi()
    const wid = workspaceId ?? selectedNote?.folderId ?? focusedFolderId
    const folder = folders.find((x) => x.id === wid && x.localGitPath) ?? null
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
  }, [
    selectedNote,
    focusedFolderId,
    folders,
    gitCommitMessage,
    user,
    refreshWorkspaceGitStatuses,
    useGithubApiSync,
    handleGithubApiPush,
  ])

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

      const idxR = await ws.readGitnotesIndex({ cwd })
      if (!idxR.ok || cancelled) return

      const persisted = loadNotesState()
      const diskEmpty =
        idxR.workspaces.length === 0 && idxR.notes.length === 0
      const hasLocal =
        persisted.version === 2 &&
        (persisted.notes.length > 0 || persisted.folders.length > 0)

      if (persisted.version === 2 && hasLocal && diskEmpty && ws.syncMarkdown) {
        for (const f of persisted.folders) {
          const wsNotes = persisted.notes.filter((n) => n.folderId === f.id)
          const files = buildMarkdownSyncPayload(f, wsNotes)
          const sync = await ws.syncMarkdown({
            cwd,
            workspaceId: f.id,
            files,
            pruneOrphanNoteFiles: true,
          })
          if (!sync.ok) {
            console.error('[gitnotes] migration sync failed', sync.error)
          }
        }
        saveNotesState({
          version: 3,
          ...(persisted.githubRemoteUrl
            ? { githubRemoteUrl: persisted.githubRemoteUrl }
            : {}),
        })
      } else if (persisted.version === 2 && !hasLocal && diskEmpty && ws.syncMarkdown) {
        const defaultFolder = {
          id: DEFAULT_WORKSPACE_ID,
          name: 'Notes',
        }
        const files = buildMarkdownSyncPayload(defaultFolder, [])
        const sync = await ws.syncMarkdown({
          cwd,
          workspaceId: DEFAULT_WORKSPACE_ID,
          files,
          pruneOrphanNoteFiles: false,
        })
        if (!sync.ok) {
          console.error('[gitnotes] default workspace init failed', sync.error)
        }
        saveNotesState({
          version: 3,
          ...(persisted.githubRemoteUrl
            ? { githubRemoteUrl: persisted.githubRemoteUrl }
            : {}),
        })
      } else if (persisted.version === 2 && !diskEmpty) {
        saveNotesState({
          version: 3,
          ...(persisted.githubRemoteUrl
            ? { githubRemoteUrl: persisted.githubRemoteUrl }
            : {}),
        })
      } else if (persisted.version === 3 && diskEmpty && ws.syncMarkdown) {
        const defaultFolder = {
          id: DEFAULT_WORKSPACE_ID,
          name: 'Notes',
        }
        const files = buildMarkdownSyncPayload(defaultFolder, [])
        const sync = await ws.syncMarkdown({
          cwd,
          workspaceId: DEFAULT_WORKSPACE_ID,
          files,
          pruneOrphanNoteFiles: false,
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
          sidebarFolderOrder: folders.map((f) => f.id),
        })
        return
      }
      saveNotesState({
        version: 2,
        folders,
        notes,
        ...(remote ? { githubRemoteUrl: remote } : {}),
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [diskMode, folders, notes, githubRemoteUrl])

  const primaryGitFolder = useMemo(
    () => folders.find((f) => f.localGitPath) ?? null,
    [folders]
  )

  const gitToolbarFolder = useMemo((): WorkspaceFolder | null => {
    if (!primaryGitFolder?.localGitPath) return null
    return {
      id: 'app-git',
      name: '~/.gitnotes',
      localGitPath: primaryGitFolder.localGitPath,
      githubRemoteUrl: githubRemoteUrl.trim() || primaryGitFolder.githubRemoteUrl,
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
            pruneOrphanNoteFiles: true,
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
    if (!folders.some((f) => f.localGitPath)) return
    void refreshWorkspaceGitStatuses()
  }, [folders, refreshWorkspaceGitStatuses])

  useEffect(() => {
    if (!folders.some((f) => f.localGitPath)) return
    const id = window.setInterval(() => {
      void refreshWorkspaceGitStatuses()
    }, 12_000)
    return () => window.clearInterval(id)
  }, [folders, refreshWorkspaceGitStatuses])

  useEffect(() => {
    const onFocus = (): void => {
      void refreshWorkspaceGitStatuses()
      if (
        diskMode &&
        pendingDiskWrites.current.size === 0 &&
        dataRootRef.current
      ) {
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
    if (focusedFolderId && !folders.some((f) => f.id === focusedFolderId)) {
      setFocusedFolderId(folders[0]?.id ?? null)
    }
  }, [folders, focusedFolderId])

  useEffect(() => {
    if (workspaceSettingsFolderId && !folders.some((f) => f.id === workspaceSettingsFolderId)) {
      setWorkspaceSettingsFolderId(null)
    }
  }, [folders, workspaceSettingsFolderId])

  useEffect(() => {
    if (splitNoteId && !notes.some((n) => n.id === splitNoteId)) {
      setSplitNoteId(null)
    }
  }, [notes, splitNoteId])

  useEffect(() => {
    if (selectedId && splitNoteId && selectedId === splitNoteId) {
      setSplitNoteId(null)
    }
  }, [selectedId, splitNoteId])

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
      setFocusedFolderId(note.folderId)
      setTreeExpandIds([treeFolderId(note.folderId)])
      setTreeExpandNonce((n) => n + 1)
      pushOpenNoteTab(noteId)
    },
    [pushOpenNoteTab]
  )

  const closeNoteTab = useCallback((noteId: string) => {
    const prev = openNoteTabIdsRef.current
    const idx = prev.indexOf(noteId)
    const next = prev.filter((id) => id !== noteId)
    setOpenNoteTabIds(next)
    setSplitNoteId((sid) => (sid === noteId ? null : sid))

    if (selectedId !== noteId) return

    const fallback = next[idx - 1] ?? next[idx] ?? next[0] ?? null
    setSelectedId(fallback)
    if (fallback) {
      const n = notesRef.current.find((x) => x.id === fallback)
      if (n) {
        setFocusedFolderId(n.folderId)
        setTreeExpandIds([treeFolderId(n.folderId)])
        setTreeExpandNonce((x) => x + 1)
      }
    } else {
      setSplitViewOpen(false)
      setSplitNoteId(null)
    }
  }, [selectedId])

  const handleTreeSelectionChange = useCallback(
    (ids: string[]) => {
      setGraphViewOpen(false)
      setWorkspaceSettingsFolderId(null)
      const id = ids[0]
      if (!id) {
        setSelectedId(null)
        return
      }
      if (id.startsWith('note:')) {
        selectNote(id.slice(5))
        return
      }
      if (id.startsWith('folder:')) {
        setSelectedId(null)
        setFocusedFolderId(id.slice(7))
        return
      }
      setSelectedId(null)
    },
    [selectNote]
  )

  const handleNewNote = useCallback(() => {
    const fid = selectedNote?.folderId ?? focusedFolderId ?? folders[0]?.id
    if (!fid) return
    setGraphViewOpen(false)
    const note = createEmptyNote(fid)
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.id)
    setFocusedFolderId(fid)
    setTreeExpandIds([treeFolderId(fid)])
    setTreeExpandNonce((n) => n + 1)
    pushOpenNoteTab(note.id)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.id), 0)
    }
  }, [selectedNote, focusedFolderId, folders, diskMode, scheduleNoteFlush, pushOpenNoteTab])

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
    const fid = selectedNote?.folderId ?? focusedFolderId ?? folders[0]?.id
    if (!fid) return
    setGraphViewOpen(false)
    const note = createEmptyDrawing(fid)
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.id)
    setFocusedFolderId(fid)
    setTreeExpandIds([treeFolderId(fid)])
    setTreeExpandNonce((n) => n + 1)
    pushOpenNoteTab(note.id)
    if (diskMode) {
      window.setTimeout(() => scheduleNoteFlush(note.id), 0)
    }
  }, [selectedNote, focusedFolderId, folders, diskMode, scheduleNoteFlush, pushOpenNoteTab])

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
      if (!foldersRef.current.some((f) => f.id === targetFolderId)) return

      const fromFolderId = note.folderId
      setGraphViewOpen(false)
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? { ...n, folderId: targetFolderId, updatedAt: Date.now() }
            : n
        )
      )
      setFocusedFolderId(targetFolderId)
      setTreeExpandIds([treeFolderId(targetFolderId)])
      setTreeExpandNonce((n) => n + 1)

      const tid = noteFlushTimers.current.get(noteId)
      if (tid !== undefined) window.clearTimeout(tid)
      noteFlushTimers.current.delete(noteId)

      if (diskMode) {
        void flushNoteMoveToDisk(noteId, fromFolderId)
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
            noteId,
          })
          if (!r.ok) {
            console.error('[gitnotes] delete note files failed', r.error)
          }
          if (useGithubApiSync) setGithubApiDirty(true)
          await refreshWorkspaceGitStatuses()
        }
        setNotes((prev) => prev.filter((n) => n.id !== noteId))
        setOpenNoteTabIds((prev) => prev.filter((id) => id !== noteId))
        setSplitNoteId((sid) => (sid === noteId ? null : sid))
        if (snapshotSelected === noteId) {
          const next = snapshotNotes.filter((n) => n.id !== noteId)
          const nextSel = next[0]?.id ?? null
          setSelectedId(nextSel)
          if (nextSel) {
            const nn = next.find((n) => n.id === nextSel)
            if (nn) setFocusedFolderId(nn.folderId)
          } else if (deleted) {
            setFocusedFolderId(deleted.folderId)
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
    const id = newWorkspaceFolderId(name)
    const root = dataRootRef.current
    setFolders((prev) => {
      const next = [...prev, { id, name, ...(root ? { localGitPath: root } : {}) }]
      persistedSidebarFolderOrderRef.current = next.map((f) => f.id)
      return next
    })
    cancelFolderCreate()
    if (diskMode && root) {
      const api = getApi()
      if (api?.workspace?.writeNoteFile) {
        void (async () => {
          const rel = `gitnotes/workspaces/${id}/README.md`
          const wr = await api.workspace!.writeNoteFile!({
            cwd: root,
            relativePath: rel,
            content: workspaceReadmeMarkdown(name),
          })
          if (!wr.ok) {
            console.error('[gitnotes] workspace readme failed', wr.error)
          }
          if (useGithubApiSync) setGithubApiDirty(true)
          await refreshWorkspaceGitStatuses()
        })()
      }
    }
  }, [cancelFolderCreate, diskMode, refreshWorkspaceGitStatuses, useGithubApiSync])

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
    setAppMode('settings')
    setSettingsSection('account')
  }, [])

  const openWorkspaceSettings = useCallback((folderId: string, e: MouseEvent) => {
    e.stopPropagation()
    setAppMode('notes')
    setWorkspaceSettingsFolderId(folderId)
    setSelectedId(null)
    setFocusedFolderId(folderId)
    setTreeExpandIds([treeFolderId(folderId)])
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const navigateToNotesRoot = useCallback(() => {
    setAppMode('notes')
    setWorkspaceSettingsFolderId(null)
    setSelectedId(null)
  }, [])

  const focusFolderInTree = useCallback((folderId: string) => {
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setSelectedId(null)
    setFocusedFolderId(folderId)
    setTreeExpandIds([treeFolderId(folderId)])
    setTreeExpandNonce((n) => n + 1)
  }, [])

  const openWorkspaceSettingsForFolder = useCallback((folderId: string) => {
    setAppMode('notes')
    setWorkspaceSettingsFolderId(folderId)
    setSelectedId(null)
    setFocusedFolderId(folderId)
    setTreeExpandIds([treeFolderId(folderId)])
    setTreeExpandNonce((n) => n + 1)
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
              content: workspaceReadmeMarkdown(name),
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

  const toggleSplitView = useCallback(() => {
    setSplitViewOpen((prev) => {
      if (prev) {
        setSplitNoteId(null)
        return false
      }
      setGraphViewOpen(false)
      return true
    })
  }, [])

  const closeSplitView = useCallback(() => {
    setSplitViewOpen(false)
    setSplitNoteId(null)
  }, [])

  const closeGraphView = useCallback(() => {
    setGraphViewOpen(false)
  }, [])

  const openGraphView = useCallback(() => {
    setSplitViewOpen(false)
    setSplitNoteId(null)
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setGraphViewOpen(true)
  }, [])

  const openSplitWithNote = useCallback(
    (noteId: string) => {
      if (noteId === selectedId) return
      setSplitViewOpen(true)
      setSplitNoteId(noteId)
      pushOpenNoteTab(noteId)
    },
    [selectedId, pushOpenNoteTab]
  )

  const setShortcutsCaptureActive = useCallback((active: boolean) => {
    shortcutsSuppressedRef.current = active
  }, [])

  const updateShortcutBinding = useCallback(
    (id: ShortcutActionId, binding: ShortcutBinding) => {
      setShortcutBindings((prev) => {
        const next = { ...prev, [id]: binding }
        saveShortcutBindings(next)
        return next
      })
    },
    []
  )

  const resetShortcutsToDefaults = useCallback(() => {
    const next = resetShortcutBindings()
    setShortcutBindings(next)
  }, [])

  const defaultExpandedFolderIds = useMemo(() => folders.map((f) => treeFolderId(f.id)), [folders])

  const canCreateNote = folders.length > 0

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
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
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
        if (canCreateNote) {
          handleNewNote()
        }
        return
      }
      if (keyboardEventMatchesBinding(e, map.toggleSplitView)) {
        e.preventDefault()
        e.stopPropagation()
        toggleSplitView()
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
  }, [appMode, canCreateNote, handleNewNote, toggleSidebar, toggleSplitView, toggleZenMode, exitZenMode])

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
    closeNoteTab,
    focusedFolderId,
    workspaceSettingsFolderId,
    workspaceSettingsFolder,
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
    splitViewOpen,
    splitNoteId,
    splitNote,
    closeSplitView,
    openSplitWithNote,
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
    selectNote,
    renameWorkspace,
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
    notesCount: notes.length,
    syncTransport: useGithubApiSync ? ('github_api' as const) : ('git' as const),
  }
}

export type NotesAppViewModel = ReturnType<typeof useNotesApp>

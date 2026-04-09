import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'

import { serverFetchJson } from '@/lib/core/server-api'
import { getApi } from '@/lib/auth/auth-bridge'
import { mergeGithubContentShas, loadGithubContentShas } from '@/lib/workspace/github-shas-storage'
import { loadSetupState } from '@/lib/workspace/setup-storage'
import { switchDataRoot } from '@/lib/config/notelab-app-config'
import { diskBodyToContent } from '@/lib/editor/markdown-to-serialized'
import {
  DEFAULT_WORKSPACE_ID,
  type SavedNote,
  type Folder,
  loadNotesState,
  saveNotesState
} from '@/lib/notes/notes-storage'
import {
  buildMarkdownSyncPayload,
  buildNoteMarkdownDocument,
  noteMarkdownRelativePath
} from '@/lib/workspace/workspace-markdown-sync'

import type { NotelabIndexOk } from './shared'

type Setter<T> = Dispatch<SetStateAction<T>>

type UseNotesAppDiskArgs = {
  initialGithubRemoteUrl: string
  folders: Folder[]
  notes: SavedNote[]
  setFolders: Setter<Folder[]>
  setNotes: Setter<SavedNote[]>
  setSelectedId: Setter<string | null>
  setOpenNoteTabIds: Setter<string[]>
  setFocusedFolderId: Setter<string | null>
  setNewNoteDestinationFolderId: Setter<string>
  setChatSidebarOpen: Setter<boolean>
  dataRootRef: MutableRefObject<string | null>
  foldersRef: MutableRefObject<Folder[]>
  notesRef: MutableRefObject<SavedNote[]>
  noteFlushTimers: MutableRefObject<Map<string, number>>
  pendingDiskWrites: MutableRefObject<Set<string>>
}

export function useNotesAppDisk({
  initialGithubRemoteUrl,
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
}: UseNotesAppDiskArgs) {
  const [githubRemoteUrl, setGithubRemoteUrl] = useState(() => initialGithubRemoteUrl)
  const [diskMode, setDiskMode] = useState(false)
  /** Data root (~/.notelab); used when `folders` omits the default workspace but Git still runs at repo root. */
  const [dataRootPath, setDataRootPath] = useState<string | null>(null)
  const [dirtyByWorkspaceId, setDirtyByWorkspaceId] = useState<Record<string, boolean>>({})
  const [gitCommitMessage, setGitCommitMessage] = useState('Update notes')
  const [gitSyncBusy, setGitSyncBusy] = useState(false)
  const [gitSyncError, setGitSyncError] = useState<string | null>(null)
  const [gitSynced, setGitSynced] = useState(false)
  const [gitHubBusy, setGitHubBusy] = useState(false)
  const [gitHubMessage, setGitHubMessage] = useState<string | null>(null)
  const [gitRemoteDialogOpen, setGitRemoteDialogOpen] = useState(false)
  const [gitRepoReady, setGitRepoReady] = useState<boolean | null>(null)
  const [gitHasOriginRemote, setGitHasOriginRemote] = useState(false)
  const [gitInitBusy, setGitInitBusy] = useState(false)
  const [gitInitError, setGitInitError] = useState<string | null>(null)
  /** Absolute path of workspace root as saved in setup state (may be null for default ~/.notelab). */
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(
    () => loadSetupState().workspaceRoot ?? null
  )
  const [setupSyncMode] = useState<'git' | 'github_api' | 'local' | undefined>(
    () => loadSetupState().syncMode
  )
  const useGithubApiSync = setupSyncMode === 'github_api'
  const [githubApiDirty, setGithubApiDirty] = useState(false)
  const markdownSyncGen = useRef(0)

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
  }, [dataRootRef, foldersRef, githubApiDirty, useGithubApiSync])

  const applyNotelabIndex = useCallback(
    (idx: NotelabIndexOk, cwd: string) => {
      /** Root bucket `default/` is shown as top-level notes only, not a second folder row. */
      const mappedFolders: Folder[] = idx.folders
        .filter((w) => w.folder !== DEFAULT_WORKSPACE_ID)
        .map((w) => ({
          id: w.folder,
          name: w.name,
          localGitPath: cwd
        }))
      const mappedNotes: SavedNote[] = idx.notes.map((n) => {
        const kind = n.kind ?? 'note'
        if (kind === 'drawing') {
          return {
            id: n.note,
            folderId: n.folder,
            title: n.title,
            updatedAt: n.updatedAtMs,
            content: null,
            kind: 'drawing' as const,
            excalidrawScene: n.markdownBody.trim() || null
          }
        }
        return {
          id: n.note,
          folderId: n.folder,
          title: n.title,
          updatedAt: n.updatedAtMs,
          content: diskBodyToContent(n.markdownBody),
          kind: 'note' as const,
          ...(n.coverImageSrc !== undefined ? { coverImageSrc: n.coverImageSrc } : {}),
          ...(n.titleEmoji !== undefined && n.titleEmoji !== ''
            ? { titleEmoji: n.titleEmoji }
            : {})
        }
      })
      if (idx.folders.length === 0 && idx.notes.length === 0) {
        setFolders([])
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

      setFolders(mappedFolders)
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
    },
    [
      notesRef,
      setFocusedFolderId,
      setFolders,
      setNewNoteDestinationFolderId,
      setNotes,
      setOpenNoteTabIds,
      setSelectedId
    ]
  )

  const reloadNotesFromDisk = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readNotelabIndex) return
    const r = await api.workspace.readNotelabIndex({ cwd })
    if (!r.ok) return
    applyNotelabIndex(r, cwd)
  }, [applyNotelabIndex, dataRootRef])

  const handleGithubApiPull = useCallback(async () => {
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const r = await serverFetchJson<{
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
  }, [dataRootRef, reloadNotesFromDisk])

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
        const inbox: Folder = { id: DEFAULT_WORKSPACE_ID, name: 'Root' }
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
      const r = await serverFetchJson<{ ok?: boolean; commitSha?: string | null }>(
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
  }, [dataRootRef, foldersRef, gitCommitMessage, notesRef, refreshWorkspaceGitStatuses])

  const flushNoteToDisk = useCallback(
    async (noteId: string) => {
      const api = getApi()
      const cwd = dataRootRef.current
      if (!cwd || !api?.workspace?.writeNoteFile || !api.workspace.deleteNoteFile) return
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note) return
      const isRoot = note.folderId === DEFAULT_WORKSPACE_ID
      const folder = foldersRef.current.find((f) => f.id === note.folderId)
      const effectiveCwd = isRoot ? cwd : folder?.localGitPath
      if (!effectiveCwd) return
      pendingDiskWrites.current.add(noteId)
      try {
        const rel = noteMarkdownRelativePath(note.folderId, note)
        if (rel !== noteId && api.workspace.renamePath) {
          const rename = await api.workspace.renamePath({
            cwd: effectiveCwd,
            from: noteId,
            to: rel
          })
          if (!rename.ok) {
            console.error('[notelab] rename before write failed', rename.error)
          }
        }
        const wr = await api.workspace.writeNoteFile({
          cwd: effectiveCwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note)
        })
        if (!wr.ok) {
          console.error('[notelab] write note failed', wr.error)
        }
        if (useGithubApiSync) {
          setGithubApiDirty(true)
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        pendingDiskWrites.current.delete(noteId)
      }
    },
    [
      dataRootRef,
      foldersRef,
      notesRef,
      pendingDiskWrites,
      refreshWorkspaceGitStatuses,
      useGithubApiSync
    ]
  )

  const flushNoteMoveToDisk = useCallback(
    async (noteId: string, _fromFolderId: string, toFolderId: string) => {
      const api = getApi()
      const cwd = dataRootRef.current
      if (!cwd || !api?.workspace?.writeNoteFile || !api.workspace.renamePath) return
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
        const rel = noteMarkdownRelativePath(toFolderId, note)
        const move = await api.workspace.renamePath({
          cwd,
          from: noteId,
          to: rel
        })
        if (!move.ok && move.error !== 'missing_source') {
          console.error('[notelab] move note file failed', move.error)
        }
        const wr = await api.workspace.writeNoteFile({
          cwd: writeCwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note)
        })
        if (!wr.ok) {
          console.error('[notelab] write note after move failed', wr.error)
        }
        if (useGithubApiSync) {
          setGithubApiDirty(true)
        }
        await refreshWorkspaceGitStatuses()
      } finally {
        pendingDiskWrites.current.delete(noteId)
      }
    },
    [
      dataRootRef,
      foldersRef,
      notesRef,
      pendingDiskWrites,
      refreshWorkspaceGitStatuses,
      useGithubApiSync
    ]
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
    [diskMode, flushNoteToDisk, noteFlushTimers]
  )

  useEffect(() => {
    const ws = getApi()?.workspace
    const ensureDataRoot = ws?.ensureDataRoot
    const readNotelabIndex = ws?.readNotelabIndex
    if (!ws || !ensureDataRoot || !readNotelabIndex) return
    let cancelled = false
    const savedRoot = loadSetupState().workspaceRoot
    void (async () => {
      // URL param is set synchronously by the main process when opening a workspace in a new window.
      // It takes priority over everything — no IPC timing issues.
      const urlWorkspace = new URLSearchParams(window.location.search).get('workspace')

      // Restore the window session for note/tab/chat state (not workspace — URL param handles that).
      const windowSession = await getApi()?.multiWindow?.getSession?.() ?? null

      const workspacePathOverride = urlWorkspace ?? windowSession?.workspacePath ?? null
      const effectiveRoot = workspacePathOverride ?? savedRoot

      const rootR = await ensureDataRoot(effectiveRoot ? { path: effectiveRoot } : undefined)
      if (!rootR.ok || cancelled) return
      const cwd = rootR.path
      dataRootRef.current = cwd
      setDataRootPath(cwd)
      setWorkspaceRoot(effectiveRoot ?? cwd)

      const idxR = await readNotelabIndex({ cwd })
      if (!idxR.ok || cancelled) return

      const persisted = loadNotesState()
      const diskEmpty = idxR.folders.length === 0 && idxR.notes.length === 0
      const hasLocal =
        persisted.version === 2 && (persisted.notes.length > 0 || persisted.folders.length > 0)

      if (persisted.version === 2 && hasLocal && diskEmpty && ws.syncMarkdown) {
        for (const f of persisted.folders) {
          const wsNotes = persisted.notes.filter((n) => n.folderId === f.id)
          const files = buildMarkdownSyncPayload(f, wsNotes)
          const sync = await ws.syncMarkdown({
            cwd,
            folder: f.id,
            files,
            pruneOrphanNoteFiles: true
          })
          if (!sync.ok) {
            console.error('[notelab] migration sync failed', sync.error)
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
          folder: DEFAULT_WORKSPACE_ID,
          files,
          pruneOrphanNoteFiles: false
        })
        if (!sync.ok) {
          console.error('[notelab] default workspace init failed', sync.error)
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
          folder: DEFAULT_WORKSPACE_ID,
          files,
          pruneOrphanNoteFiles: false
        })
        if (!sync.ok) {
          console.error('[notelab] v3 empty disk reinit failed', sync.error)
        }
      }

      const fresh = await readNotelabIndex({ cwd })
      if (!fresh.ok || cancelled) return
      setDiskMode(true)
      applyNotelabIndex(fresh, cwd)

      // Restore last selected note and open tabs from window session.
      if (windowSession) {
        const allNoteIds = new Set(fresh.notes.map((n) => n.note))
        if (windowSession.selectedNoteId && allNoteIds.has(windowSession.selectedNoteId)) {
          setSelectedId(windowSession.selectedNoteId)
        }
        if (windowSession.openNoteTabIds) {
          const validTabs = windowSession.openNoteTabIds.filter((id) => allNoteIds.has(id))
          if (validTabs.length > 0) setOpenNoteTabIds(validTabs)
        }
        if (windowSession.chatSidebarOpen) {
          setChatSidebarOpen(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    applyNotelabIndex,
    dataRootRef,
    setChatSidebarOpen,
    setOpenNoteTabIds,
    setSelectedId
  ])

  useEffect(() => {
    if (!diskMode) return
    const t = window.setTimeout(() => {
      const remote = githubRemoteUrl.trim()
      saveNotesState({
        version: 3,
        ...(remote ? { githubRemoteUrl: remote } : {})
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [diskMode, githubRemoteUrl])

  useEffect(() => {
    if (diskMode) return
    const t = window.setTimeout(() => {
      const remote = githubRemoteUrl.trim()
      saveNotesState({
        version: 2,
        folders,
        notes,
        ...(remote ? { githubRemoteUrl: remote } : {})
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [diskMode, folders, githubRemoteUrl, notes])

  const gitDirtyGlobal = useMemo(() => {
    if (useGithubApiSync) return githubApiDirty
    return Object.values(dirtyByWorkspaceId).some(Boolean)
  }, [dirtyByWorkspaceId, githubApiDirty, useGithubApiSync])

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
            folder: f.id,
            files,
            pruneOrphanNoteFiles: true
          })
          if (!r.ok) {
            console.error('[notelab] markdown sync failed', r.error)
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
  }, [dataRootPath, diskMode, folders, refreshWorkspaceGitStatuses])

  useEffect(() => {
    if (!folders.some((f) => f.localGitPath) && !(diskMode && dataRootPath)) return
    const id = window.setInterval(() => {
      void refreshWorkspaceGitStatuses()
    }, 12_000)
    return () => window.clearInterval(id)
  }, [dataRootPath, diskMode, folders, refreshWorkspaceGitStatuses])

  useEffect(() => {
    const onFocus = (): void => {
      void refreshWorkspaceGitStatuses()
      if (diskMode && pendingDiskWrites.current.size === 0 && dataRootRef.current) {
        void reloadNotesFromDisk()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [dataRootRef, diskMode, pendingDiskWrites, refreshWorkspaceGitStatuses, reloadNotesFromDisk])

  useEffect(() => {
    return () => {
      for (const tid of noteFlushTimers.current.values()) {
        window.clearTimeout(tid)
      }
      noteFlushTimers.current.clear()
    }
  }, [noteFlushTimers])

  const handleWorkspaceRootChange = useCallback(async (newRoot: string): Promise<void> => {
    const ws = getApi()?.workspace
    if (!ws?.ensureDataRoot || !ws.readNotelabIndex) return
    const rootR = await ws.ensureDataRoot({ path: newRoot })
    if (!rootR.ok) return
    const cwd = rootR.path
    dataRootRef.current = cwd
    setDataRootPath(cwd)
    setWorkspaceRoot(newRoot)
    // Config always stays in configRoot (~/.notelab), never the user-chosen notes dir
    await switchDataRoot(rootR.configRoot)
    setDiskMode(false)
    setFolders([])
    setNotes([])
    setSelectedId(null)
    setOpenNoteTabIds([])
    const idxR = await ws.readNotelabIndex({ cwd })
    if (!idxR.ok) return
    setDiskMode(true)
    applyNotelabIndex(idxR, cwd)
  }, [applyNotelabIndex, dataRootRef, setFolders, setNotes, setOpenNoteTabIds, setSelectedId])

  return {
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
  }
}

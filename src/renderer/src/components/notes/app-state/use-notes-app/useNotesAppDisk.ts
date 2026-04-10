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

import { getApi } from '@/lib/auth/auth-bridge'
import { createElectronLogger } from '@/lib/core/electron-log'
import { loadSetupState } from '@/lib/workspace/setup-storage'
import { switchDataRoot } from '@/lib/config/notelab-app-config'
import { diskBodyToContent, extractDiskTitleHeading } from '@/lib/editor/markdown-to-serialized'
import { JOURNAL_FOLDER_ID } from '@/lib/notes/notes-types'
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

const LOG = '[useNotesAppDisk]'
const log = createElectronLogger(LOG)

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
  pendingSavedNotesRef: MutableRefObject<Map<string, SavedNote>>
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
  pendingSavedNotesRef,
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
  const [gitUserConfigDialogOpen, setGitUserConfigDialogOpen] = useState(false)
  /** The operation to retry after the user configures git user.name/email. */
  const [gitPendingRetry, setGitPendingRetry] = useState<(() => Promise<void>) | null>(null)
  const [gitRepoReady, setGitRepoReady] = useState<boolean | null>(null)
  const [gitHasOriginRemote, setGitHasOriginRemote] = useState(false)
  const [gitInitBusy, setGitInitBusy] = useState(false)
  const [gitInitError, setGitInitError] = useState<string | null>(null)
  /** Absolute path of workspace root as saved in setup state (may be null for default ~/.notelab). */
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(
    () => loadSetupState().workspaceRoot ?? null
  )
  const markdownSyncGen = useRef(0)
  const gitStatusRefreshTimerRef = useRef<number | null>(null)

  const getLatestNoteSnapshot = useCallback(
    (notePath: string): SavedNote | undefined =>
      pendingSavedNotesRef.current.get(notePath) ?? notesRef.current.find((n) => n.path === notePath),
    [notesRef, pendingSavedNotesRef]
  )

  const refreshWorkspaceGitStatuses = useCallback(async () => {
    const api = getApi()
    if (!api?.workspace?.gitStatus) return
    const gitStatus = api.workspace.gitStatus
    const foldersWithGit = foldersRef.current.filter((f) => f.localGitPath)
    const rootCwd = dataRootRef.current
    const tasks: Promise<[string, boolean] | null>[] = foldersWithGit.map(async (f) => {
      const s = await gitStatus({ cwd: f.localGitPath! })
      return s.ok ? ([f.folder, s.dirty] as [string, boolean]) : null
    })
    if (foldersRef.current.length === 0 && rootCwd) {
      tasks.push(
        gitStatus({ cwd: rootCwd }).then((s) =>
          s.ok ? ([DEFAULT_WORKSPACE_ID, s.dirty] as [string, boolean]) : null
        )
      )
    }
    const results = await Promise.all(tasks)
    const next: Record<string, boolean> = {}
    for (const r of results) {
      if (r) next[r[0]] = r[1]
    }
    setDirtyByWorkspaceId(next)
  }, [dataRootRef, foldersRef])

  const scheduleWorkspaceGitStatusRefresh = useCallback(
    (delayMs = 2500): void => {
      if (gitStatusRefreshTimerRef.current !== null) {
        window.clearTimeout(gitStatusRefreshTimerRef.current)
      }
      gitStatusRefreshTimerRef.current = window.setTimeout(() => {
        gitStatusRefreshTimerRef.current = null
        void refreshWorkspaceGitStatuses()
      }, delayMs)
    },
    [refreshWorkspaceGitStatuses]
  )

  const applyNotelabIndex = useCallback(
    (idx: NotelabIndexOk, cwd: string) => {
      /** Root bucket `default/` is shown as top-level notes only, not a second folder row. */
      const mappedFolders: Folder[] = idx.folders
        .filter((w) => w.folder !== DEFAULT_WORKSPACE_ID)
        .map((w) => ({
          folder: w.folder,
          name: w.name,
          localGitPath: cwd
        }))
      const mappedNotes: SavedNote[] = idx.notes.map((n) => {
        const kind = n.kind ?? 'note'
        if (kind === 'drawing') {
          return {
            path: n.note,
            folder: n.folder,
            title: n.title,
            updatedAt: n.updatedAtMs,
            content: null,
            kind: 'drawing' as const,
            excalidrawScene: n.markdownBody.trim() || null
          }
        }
        const derivedTitle = extractDiskTitleHeading(n.markdownBody)?.trim() || n.title
        return {
          path: n.note,
          folder: n.folder,
          title: derivedTitle,
          updatedAt: n.updatedAtMs,
          content: diskBodyToContent(n.markdownBody),
          kind: 'note' as const,
          ...(n.coverImageSrc !== undefined ? { coverImageSrc: n.coverImageSrc } : {}),
          ...(n.titleEmoji !== undefined && n.titleEmoji !== ''
            ? { titleEmoji: n.titleEmoji }
            : {})
          ,
          ...(n.properties ? { properties: n.properties } : {}),
          ...(n.hasFrontmatterBlock ? { hasFrontmatterBlock: true } : {})
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
      const diskPaths = new Set(mappedNotes.map((n) => n.path))
      const validFolderId = (fid: string) =>
        fid === DEFAULT_WORKSPACE_ID || mappedFolders.some((f) => f.folder === fid)
      const localPending = notesRef.current.filter(
        (n) => !diskPaths.has(n.path) && validFolderId(n.folder)
      )
      const mergedNotes = [...localPending, ...mappedNotes]

      // Sort once — reused by both setSelectedId and setOpenNoteTabIds
      const mergedNotesSorted = mergedNotes.length > 0
        ? [...mergedNotes].sort((a, b) => b.updatedAt - a.updatedAt)
        : mergedNotes
      const defaultPath = mergedNotesSorted[0]?.path ?? null
      const mergedPathSet = new Set(mergedNotes.map((n) => n.path))

      setFolders(mappedFolders)
      setNotes(mergedNotes)
      setSelectedId((sel) => {
        if (sel && mergedPathSet.has(sel)) return sel
        return defaultPath
      })
      setOpenNoteTabIds((prev) => {
        const validPrev = prev.filter((path) => mergedPathSet.has(path))
        if (validPrev.length > 0) return validPrev
        return defaultPath ? [defaultPath] : []
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

  const flushNoteToDisk = useCallback(
    async (notePath: string) => {
      const api = getApi()
      const cwd = dataRootRef.current
      if (!cwd || !api?.workspace?.writeNoteFile || !api.workspace.deleteNoteFile) {
        log.warn('flushNoteToDisk skipped: missing workspace API', { notePath, cwd })
        return
      }
      const note = getLatestNoteSnapshot(notePath)
      if (!note) {
        log.warn('flushNoteToDisk skipped: note missing', { notePath })
        return
      }
      if (note.isTransient) {
        log.info('flushNoteToDisk skipped: transient note', { notePath, title: note.title })
        return
      }
      const isRoot = note.folder === DEFAULT_WORKSPACE_ID || note.folder === JOURNAL_FOLDER_ID
      const folder = foldersRef.current.find((f) => f.folder === note.folder)
      const effectiveCwd = isRoot ? cwd : folder?.localGitPath
      if (!effectiveCwd) {
        log.warn('flushNoteToDisk skipped: no effective cwd', {
          notePath,
          folder: note.folder
        })
        return
      }
      pendingDiskWrites.current.add(notePath)
      try {
        const rel = noteMarkdownRelativePath(note.folder, note)
        log.info('flushNoteToDisk begin', {
          notePath,
          rel,
          folder: note.folder,
          effectiveCwd,
          title: note.title
        })
        if (rel !== notePath && api.workspace.renamePath) {
          const rename = await api.workspace.renamePath({
            cwd: effectiveCwd,
            from: notePath,
            to: rel
          })
          if (!rename.ok) {
            log.error('flushNoteToDisk rename before write failed', {
              notePath,
              rel,
              error: rename.error
            })
            console.error('[notelab] rename before write failed', rename.error)
          }
        }
        const wr = await api.workspace.writeNoteFile({
          cwd: effectiveCwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note)
        })
        if (!wr.ok) {
          log.error('flushNoteToDisk write failed', {
            notePath,
            rel,
            error: wr.error
          })
          console.error('[notelab] write note failed', wr.error)
        } else {
          log.info('flushNoteToDisk write succeeded', { notePath, rel })
          pendingSavedNotesRef.current.delete(notePath)
          const persistedAt = Date.now()
          setNotes((prev) =>
            prev.map((n) => (n.path === notePath ? { ...note, updatedAt: persistedAt } : n))
          )
        }
        scheduleWorkspaceGitStatusRefresh()
      } finally {
        pendingDiskWrites.current.delete(notePath)
      }
    },
    [
      dataRootRef,
      foldersRef,
      getLatestNoteSnapshot,
      pendingDiskWrites,
      pendingSavedNotesRef,
      scheduleWorkspaceGitStatusRefresh,
      setNotes,
    ]
  )

  const flushNoteMoveToDisk = useCallback(
    async (previousPath: string, note: SavedNote) => {
      const api = getApi()
      const cwd = dataRootRef.current
      if (!cwd || !api?.workspace?.writeNoteFile || !api.workspace.renamePath) {
        log.warn('flushNoteMoveToDisk skipped: missing workspace API', {
          previousPath,
          nextPath: note.path
        })
        return
      }
      const targetRoot = note.folder === DEFAULT_WORKSPACE_ID || note.folder === JOURNAL_FOLDER_ID
      const targetFolder = foldersRef.current.find((f) => f.folder === note.folder)
      const writeCwd = targetRoot ? cwd : targetFolder?.localGitPath
      if (!writeCwd) {
        log.warn('flushNoteMoveToDisk skipped: no write cwd', {
          previousPath,
          nextPath: note.path,
          folder: note.folder
        })
        return
      }
      pendingDiskWrites.current.add(previousPath)
      try {
        const rel = noteMarkdownRelativePath(note.folder, note)
        log.info('flushNoteMoveToDisk begin', {
          previousPath,
          rel,
          folder: note.folder,
          writeCwd,
          title: note.title,
          isTransient: Boolean(note.isTransient)
        })
        if (previousPath !== rel) {
          const move = await api.workspace.renamePath({
            cwd,
            from: previousPath,
            to: rel
          })
          if (!move.ok && move.error !== 'missing_source') {
            log.error('flushNoteMoveToDisk move failed', {
              previousPath,
              rel,
              error: move.error
            })
            console.error('[notelab] move note file failed', move.error)
          }
        }
        const wr = await api.workspace.writeNoteFile({
          cwd: writeCwd,
          relativePath: rel,
          content: buildNoteMarkdownDocument(note)
        })
        if (!wr.ok) {
          log.error('flushNoteMoveToDisk write failed', {
            previousPath,
            rel,
            error: wr.error
          })
          console.error('[notelab] write note after move failed', wr.error)
        } else {
          log.info('flushNoteMoveToDisk write succeeded', {
            previousPath,
            rel
          })
          pendingSavedNotesRef.current.delete(previousPath)
          pendingSavedNotesRef.current.delete(note.path)
          const persistedAt = Date.now()
          setNotes((prev) =>
            prev.map((n) => (n.path === note.path ? { ...note, updatedAt: persistedAt } : n))
          )
        }
        scheduleWorkspaceGitStatusRefresh()
      } finally {
        pendingDiskWrites.current.delete(previousPath)
      }
    },
    [
      dataRootRef,
      foldersRef,
      pendingDiskWrites,
      pendingSavedNotesRef,
      scheduleWorkspaceGitStatusRefresh,
      setNotes,
    ]
  )

  const scheduleNoteFlush = useCallback(
    (notePath: string) => {
      if (!diskMode) return
      const prev = noteFlushTimers.current.get(notePath)
      if (prev !== undefined) window.clearTimeout(prev)
      const tid = window.setTimeout(() => {
        noteFlushTimers.current.delete(notePath)
        void flushNoteToDisk(notePath)
      }, 650)
      noteFlushTimers.current.set(notePath, tid)
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
        // Pre-bucket persisted notes by folder once
        const persistedNotesByFolder = new Map<string, typeof persisted.notes>()
        for (const n of persisted.notes) {
          let bucket = persistedNotesByFolder.get(n.folder)
          if (!bucket) { bucket = []; persistedNotesByFolder.set(n.folder, bucket) }
          bucket.push(n)
        }
        const syncMarkdown = ws.syncMarkdown
        await Promise.all(
          persisted.folders.map(async (f) => {
            const wsNotes = persistedNotesByFolder.get(f.folder) ?? []
            const files = buildMarkdownSyncPayload(f, wsNotes)
            const sync = await syncMarkdown({ cwd, folder: f.folder, files, pruneOrphanNoteFiles: true })
            if (!sync.ok) console.error('[notelab] migration sync failed', sync.error)
          })
        )
        saveNotesState({
          version: 3,
          ...(persisted.githubRemoteUrl ? { githubRemoteUrl: persisted.githubRemoteUrl } : {})
        })
      } else if (persisted.version === 2 && !hasLocal && diskEmpty && ws.syncMarkdown) {
        const defaultFolder = {
          folder: DEFAULT_WORKSPACE_ID,
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
          folder: DEFAULT_WORKSPACE_ID,
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
        if (windowSession.openNoteTabPaths) {
          const validTabs = windowSession.openNoteTabPaths.filter((id) => allNoteIds.has(id))
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

  const gitDirtyGlobal = useMemo(
    () => Object.values(dirtyByWorkspaceId).some(Boolean),
    [dirtyByWorkspaceId]
  )

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
          const wsNotes = notes.filter((n) => n.folder === f.folder)
          const files = buildMarkdownSyncPayload(f, wsNotes)
          const r = await api.workspace!.syncMarkdown!({
            cwd: f.localGitPath!,
            folder: f.folder,
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
      if (gitStatusRefreshTimerRef.current !== null) {
        window.clearTimeout(gitStatusRefreshTimerRef.current)
        gitStatusRefreshTimerRef.current = null
      }
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
  }
}

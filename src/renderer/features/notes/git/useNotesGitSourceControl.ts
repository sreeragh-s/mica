import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import { getApi } from '@/lib/auth/auth-bridge'
import { createElectronLogger } from '@/lib/core/electron-log'
import type { AppSidebarView } from '@/lib/notes/notes-types'
import type { Folder } from '@/lib/notes/notes-storage'

import type { AppMode, NotesUser } from '@/features/notes/notes-app-types'

const LOG = '[useNotesGitSourceControl]'
const log = createElectronLogger(LOG)

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start)
}

export type GitSourceControlFile = {
  path: string
  x: string
  y: string
  staged: boolean
  conflicted: boolean
}

export type GitSourceControlSnapshot = {
  files: GitSourceControlFile[]
  hasConflicts: boolean
  isRebasing: boolean
}

type UseNotesGitSourceControlArgs = {
  primaryGitFolder: Folder | null
  user?: NotesUser | null
  refreshWorkspaceGitStatuses: () => Promise<void>
  setAppSidebarView: Dispatch<SetStateAction<AppSidebarView>>
  setAppMode: Dispatch<SetStateAction<AppMode>>
}

// eslint-disable-next-line react-hooks/exhaustive-deps -- return shape is inferred below
export function useNotesGitSourceControl({
  primaryGitFolder,
  user,
  refreshWorkspaceGitStatuses,
  setAppSidebarView,
  setAppMode
}: UseNotesGitSourceControlArgs) {
  const [gitSourceControlFiles, setGitSourceControlFiles] = useState<GitSourceControlFile[]>([])
  const [gitSourceControlLoading, setGitSourceControlLoading] = useState(false)
  const [gitSourceControlHasConflicts, setGitSourceControlHasConflicts] = useState(false)
  const [gitSourceControlIsRebasing, setGitSourceControlIsRebasing] = useState(false)
  const [gitSourceControlError, setGitSourceControlError] = useState<string | null>(null)
  const [gitSourceControlBusy, setGitSourceControlBusy] = useState(false)
  const [gitSourceControlActionError, setGitSourceControlActionError] = useState<string | null>(
    null
  )
  const [conflictViewPath, setConflictViewPath] = useState<string | null>(null)

  const focusSourceControl = useCallback(() => {
    setAppSidebarView('source-control')
    setAppMode('notes')
  }, [setAppMode, setAppSidebarView])

  const refreshGitSourceControl =
    useCallback(async (): Promise<GitSourceControlSnapshot | null> => {
      const api = getApi()
      const cwd = primaryGitFolder?.localGitPath
      if (!cwd || !api?.workspace?.gitFileStatuses) return null
      const startedAt = performance.now()
      setGitSourceControlLoading(true)
      setGitSourceControlError(null)
      try {
        const r = await api.workspace.gitFileStatuses({ cwd })
        if (!r.ok) {
          log.warn('refreshGitSourceControl failed', {
            cwd,
            durationMs: elapsedMs(startedAt),
            error: r.error
          })
          setGitSourceControlError(r.error)
          return null
        }

        const snapshot: GitSourceControlSnapshot = {
          files: r.files,
          hasConflicts: r.hasConflicts,
          isRebasing: r.isRebasing
        }

        setGitSourceControlFiles(snapshot.files)
        setGitSourceControlHasConflicts(snapshot.hasConflicts)
        setGitSourceControlIsRebasing(snapshot.isRebasing)
        if (snapshot.isRebasing || snapshot.hasConflicts) {
          log.info('refreshGitSourceControl snapshot', {
            cwd,
            durationMs: elapsedMs(startedAt),
            isRebasing: snapshot.isRebasing,
            hasConflicts: snapshot.hasConflicts,
            conflictedFiles: snapshot.files
              .filter((file) => file.conflicted)
              .map((file) => file.path)
          })
        }
        return snapshot
      } finally {
        setGitSourceControlLoading(false)
      }
    }, [primaryGitFolder?.localGitPath])

  const revealConflictResolver = useCallback(async (): Promise<boolean> => {
    const startedAt = performance.now()
    log.info('revealConflictResolver requested', {
      cwd: primaryGitFolder?.localGitPath ?? null
    })
    const snapshot = await refreshGitSourceControl()
    if (!snapshot || (!snapshot.hasConflicts && !snapshot.isRebasing)) {
      log.info('revealConflictResolver skipped', {
        durationMs: elapsedMs(startedAt),
        hasSnapshot: Boolean(snapshot)
      })
      return false
    }

    focusSourceControl()
    const firstConflict = snapshot.files.find((file) => file.conflicted)?.path ?? null
    setConflictViewPath(firstConflict)
    log.info('revealConflictResolver focused source control', {
      durationMs: elapsedMs(startedAt),
      hasConflicts: snapshot.hasConflicts,
      isRebasing: snapshot.isRebasing,
      firstConflict
    })
    return true
  }, [focusSourceControl, primaryGitFolder?.localGitPath, refreshGitSourceControl])

  const handleGitStageFile = useCallback(
    async (filePath: string) => {
      const api = getApi()
      const cwd = primaryGitFolder?.localGitPath
      if (!cwd || !api?.workspace?.gitStageFile) return
      setGitSourceControlActionError(null)
      const r = await api.workspace.gitStageFile({ cwd, path: filePath })
      if (!r.ok) setGitSourceControlActionError(r.error)
      await refreshWorkspaceGitStatuses()
    },
    [primaryGitFolder?.localGitPath, refreshWorkspaceGitStatuses]
  )

  const handleGitUnstageFile = useCallback(
    async (filePath: string) => {
      const api = getApi()
      const cwd = primaryGitFolder?.localGitPath
      if (!cwd || !api?.workspace?.gitUnstageFile) return
      setGitSourceControlActionError(null)
      const r = await api.workspace.gitUnstageFile({ cwd, path: filePath })
      if (!r.ok) setGitSourceControlActionError(r.error)
      await refreshWorkspaceGitStatuses()
    },
    [primaryGitFolder?.localGitPath, refreshWorkspaceGitStatuses]
  )

  const handleGitDiscardFile = useCallback(
    async (filePath: string) => {
      const api = getApi()
      const cwd = primaryGitFolder?.localGitPath
      if (!cwd || !api?.workspace?.gitDiscardFile) return
      setGitSourceControlActionError(null)
      const r = await api.workspace.gitDiscardFile({ cwd, path: filePath })
      if (!r.ok) setGitSourceControlActionError(r.error)
      await refreshWorkspaceGitStatuses()
    },
    [primaryGitFolder?.localGitPath, refreshWorkspaceGitStatuses]
  )

  const handleGitAcceptResolution = useCallback(
    async (filePath: string, resolution: 'ours' | 'theirs' | 'content', content?: string) => {
      const api = getApi()
      const cwd = primaryGitFolder?.localGitPath
      if (!cwd || !api?.workspace?.gitAcceptResolution) return
      const startedAt = performance.now()
      log.info('gitAcceptResolution requested', { cwd, filePath, resolution })
      setGitSourceControlActionError(null)
      const r = await api.workspace.gitAcceptResolution({
        cwd,
        path: filePath,
        resolution,
        content
      })
      if (!r.ok) {
        log.warn('gitAcceptResolution failed', {
          cwd,
          filePath,
          resolution,
          durationMs: elapsedMs(startedAt),
          error: r.error
        })
        setGitSourceControlActionError(r.error)
      } else {
        log.info('gitAcceptResolution finished', {
          cwd,
          filePath,
          resolution,
          durationMs: elapsedMs(startedAt)
        })
      }
      await refreshGitSourceControl()
      await refreshWorkspaceGitStatuses()
    },
    [primaryGitFolder?.localGitPath, refreshGitSourceControl, refreshWorkspaceGitStatuses]
  )

  const handleGitAbortRebase = useCallback(async () => {
    const api = getApi()
    const cwd = primaryGitFolder?.localGitPath
    if (!cwd || !api?.workspace?.gitAbortRebase) return
    const startedAt = performance.now()
    log.info('rebase --abort requested', { cwd })
    setGitSourceControlBusy(true)
    setGitSourceControlActionError(null)
    try {
      const r = await api.workspace.gitAbortRebase({ cwd })
      if (!r.ok) {
        log.warn('rebase --abort failed', {
          cwd,
          durationMs: elapsedMs(startedAt),
          error: r.error
        })
        setGitSourceControlActionError(r.error)
      } else {
        log.info('rebase --abort finished', {
          cwd,
          durationMs: elapsedMs(startedAt)
        })
        setConflictViewPath(null)
      }
      await refreshGitSourceControl()
      await refreshWorkspaceGitStatuses()
    } finally {
      setGitSourceControlBusy(false)
    }
  }, [primaryGitFolder?.localGitPath, refreshGitSourceControl, refreshWorkspaceGitStatuses])

  const handleGitContinueRebase = useCallback(async () => {
    const api = getApi()
    const cwd = primaryGitFolder?.localGitPath
    if (!cwd || !api?.workspace?.gitContinueRebase) return
    const startedAt = performance.now()
    log.info('rebase --continue requested', { cwd })
    setGitSourceControlBusy(true)
    setGitSourceControlActionError(null)
    try {
      const r = await api.workspace.gitContinueRebase({
        cwd,
        authorName: user?.name?.trim() || 'notelab.io',
        authorEmail: user?.email?.trim() || 'notes@notelab.io'
      })
      if (!r.ok) {
        log.warn('rebase --continue failed', {
          cwd,
          durationMs: elapsedMs(startedAt),
          error: r.error
        })
        setGitSourceControlActionError(r.error)
      } else {
        log.info('rebase --continue finished', {
          cwd,
          durationMs: elapsedMs(startedAt)
        })
      }
      await refreshGitSourceControl()
      await refreshWorkspaceGitStatuses()
      if (r.ok) {
        await revealConflictResolver()
      }
    } finally {
      setGitSourceControlBusy(false)
    }
  }, [
    primaryGitFolder?.localGitPath,
    refreshGitSourceControl,
    refreshWorkspaceGitStatuses,
    revealConflictResolver,
    user
  ])

  const openConflictView = useCallback(
    (filePath: string) => {
      focusSourceControl()
      setConflictViewPath(filePath)
    },
    [focusSourceControl]
  )

  const closeConflictView = useCallback(() => {
    setConflictViewPath(null)
  }, [])

  return {
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
  }
}

export type NotesGitSourceControlModel = ReturnType<typeof useNotesGitSourceControl>

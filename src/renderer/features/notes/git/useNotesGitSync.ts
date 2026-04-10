import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'

import { getApi } from '@/lib/auth/auth-bridge'
import { createElectronLogger } from '@/lib/core/electron-log'
import type { Folder } from '@/lib/notes/notes-storage'

import { friendlyGitSyncError } from '@/features/notes/git/git-sync-errors'
import type { NotesUser } from '@/features/notes/notes-app-types'
import type { GitSourceControlSnapshot } from '@/features/notes/git/useNotesGitSourceControl'

const LOG = '[useNotesGitSync]'
const log = createElectronLogger(LOG)

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start)
}

function summarizeGitText(text: string, maxLength = 220): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const singleLine = trimmed.replace(/\s+/g, ' ')
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength)}...`
}

type UseNotesGitSyncArgs = {
  primaryGitFolder: Folder | null
  selectedNoteFolderId: string | null
  focusedFolderId: string | null
  resolveGitFolderForId: (workspaceId: string | undefined | null) => Folder | null
  setFolders: Dispatch<SetStateAction<Folder[]>>
  githubRemoteUrl: string
  setGithubRemoteUrl: Dispatch<SetStateAction<string>>
  gitCommitMessage: string
  setGitCommitMessage: Dispatch<SetStateAction<string>>
  gitSyncBusy: boolean
  setGitSyncBusy: Dispatch<SetStateAction<boolean>>
  gitSyncError: string | null
  setGitSyncError: Dispatch<SetStateAction<string | null>>
  gitSynced: boolean
  setGitSynced: Dispatch<SetStateAction<boolean>>
  gitHubBusy: boolean
  setGitHubBusy: Dispatch<SetStateAction<boolean>>
  gitHubMessage: string | null
  setGitHubMessage: Dispatch<SetStateAction<string | null>>
  gitRemoteDialogOpen: boolean
  setGitRemoteDialogOpen: Dispatch<SetStateAction<boolean>>
  gitRepoReady: boolean | null
  setGitRepoReady: Dispatch<SetStateAction<boolean | null>>
  gitHasOriginRemote: boolean
  setGitHasOriginRemote: Dispatch<SetStateAction<boolean>>
  gitInitBusy: boolean
  setGitInitBusy: Dispatch<SetStateAction<boolean>>
  gitInitError: string | null
  setGitInitError: Dispatch<SetStateAction<string | null>>
  setGitUserConfigDialogOpen: Dispatch<SetStateAction<boolean>>
  setGitPendingRetry: Dispatch<SetStateAction<(() => Promise<void>) | null>>
  user?: NotesUser | null
  reloadNotesFromDisk: () => Promise<void>
  refreshWorkspaceGitStatuses: () => Promise<void>
  refreshGitSourceControl: () => Promise<GitSourceControlSnapshot | null>
  revealConflictResolver: () => Promise<boolean>
}

// eslint-disable-next-line react-hooks/exhaustive-deps -- return shape is inferred below
export function useNotesGitSync({
  primaryGitFolder,
  selectedNoteFolderId,
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
  setGitUserConfigDialogOpen,
  setGitPendingRetry,
  user,
  reloadNotesFromDisk,
  refreshWorkspaceGitStatuses,
  refreshGitSourceControl,
  revealConflictResolver,
}: UseNotesGitSyncArgs) {
  const updateSavedRemoteUrl = useCallback((url: string) => {
    setGithubRemoteUrl(url)
    setFolders((prev) => prev.map((folder) => ({ ...folder, githubRemoteUrl: url || undefined })))
  }, [setFolders])

  const refreshGitRepositoryStatus = useCallback(async (): Promise<boolean> => {
    const api = getApi()
    const cwd = primaryGitFolder?.localGitPath
    if (!cwd) {
      setGitRepoReady(null)
      setGitHasOriginRemote(false)
      return false
    }
    if (!api?.workspace?.gitStatus) {
      setGitRepoReady(false)
      setGitHasOriginRemote(false)
      return false
    }

    const r = await api.workspace.gitStatus({ cwd })
    if (!r.ok) {
      setGitRepoReady(false)
      setGitHasOriginRemote(false)
      return false
    }

    const remoteUrl = r.remoteUrl?.trim() ?? ''
    setGitRepoReady(true)
    setGitHasOriginRemote(Boolean(remoteUrl))
    if (remoteUrl && !githubRemoteUrl.trim()) {
      setGithubRemoteUrl(remoteUrl)
    }
    return Boolean(remoteUrl)
  }, [githubRemoteUrl, primaryGitFolder?.localGitPath])

  useEffect(() => {
    void refreshGitRepositoryStatus()
  }, [refreshGitRepositoryStatus])

  const resolveActiveGitFolder = useCallback((workspaceId?: string) => {
    const wid = workspaceId ?? selectedNoteFolderId ?? focusedFolderId
    return resolveGitFolderForId(wid)
  }, [focusedFolderId, resolveGitFolderForId, selectedNoteFolderId])

  const handleGitOperationError = useCallback(async (error: string): Promise<void> => {
    log.warn('git operation failed', { error: summarizeGitText(error) ?? error })
    const revealed = await revealConflictResolver()
    log.info('git operation error handled', { revealedConflictResolver: revealed })
    if (revealed) {
      // Use the real error (e.g. rebase_in_progress vs rebase_conflicts), not a generic label.
      setGitSyncError(friendlyGitSyncError(error))
      return
    }
    setGitSyncError(friendlyGitSyncError(error))
  }, [revealConflictResolver])

  const handleInitGit = useCallback(async (): Promise<void> => {
    const api = getApi()
    const cwd = primaryGitFolder?.localGitPath
    if (!cwd || !api?.workspace?.initGit) return
    setGitInitBusy(true)
    setGitInitError(null)
    try {
      const r = await api.workspace.initGit({ cwd })
      if (!r.ok) {
        const err = r.error.toLowerCase()
        if (err.includes('user.name') || err.includes('user.email') || err.includes('please tell me who you are')) {
          setGitPendingRetry(() => handleInitGit)
          setGitUserConfigDialogOpen(true)
          return
        }
        setGitInitError(r.error)
        return
      }
      setGitRepoReady(true)
      setGitHasOriginRemote(false)
      await Promise.all([
        refreshGitRepositoryStatus(),
        refreshWorkspaceGitStatuses(),
        refreshGitSourceControl(),
      ])
    } finally {
      setGitInitBusy(false)
    }
  }, [primaryGitFolder?.localGitPath, refreshGitRepositoryStatus, refreshGitSourceControl, refreshWorkspaceGitStatuses, setGitUserConfigDialogOpen, setGitPendingRetry])

  const handleGitCommit = useCallback(async (workspaceId?: string) => {
    const api = getApi()
    const folder = resolveActiveGitFolder(workspaceId)
    if (!folder?.localGitPath || !api?.workspace?.gitCommit) return
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const r = await api.workspace.gitCommit({
        cwd: folder.localGitPath,
        message: gitCommitMessage.trim() || 'Update notes',
        authorName: user?.name?.trim() || 'notelab.io',
        authorEmail: user?.email?.trim() || 'notes@notelab.io',
      })
      if (!r.ok && r.error !== 'nothing_to_commit') {
        await handleGitOperationError(r.error)
        return
      }
      setGitCommitMessage('')
      await Promise.all([refreshWorkspaceGitStatuses(), refreshGitSourceControl()])
    } finally {
      setGitSyncBusy(false)
    }
  }, [gitCommitMessage, handleGitOperationError, refreshGitSourceControl, refreshWorkspaceGitStatuses, resolveActiveGitFolder, user])

  const handleGitPush = useCallback(async (workspaceId?: string) => {
    const api = getApi()
    const folder = resolveActiveGitFolder(workspaceId)
    if (!folder?.localGitPath || !api?.workspace?.gitPush) return
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const r = await api.workspace.gitPush({ cwd: folder.localGitPath })
      if (!r.ok) {
        await handleGitOperationError(r.error)
        setGitSynced(false)
        return
      }
      await Promise.all([
        refreshWorkspaceGitStatuses(),
        refreshGitRepositoryStatus(),
        refreshGitSourceControl(),
      ])
    } finally {
      setGitSyncBusy(false)
    }
  }, [handleGitOperationError, refreshGitRepositoryStatus, refreshGitSourceControl, refreshWorkspaceGitStatuses, resolveActiveGitFolder])

  const handleGitPull = useCallback(async (workspaceId?: string) => {
    const api = getApi()
    const folder = resolveActiveGitFolder(workspaceId)
    if (!folder?.localGitPath || !api?.workspace?.gitPull) return
    const flowStart = performance.now()
    log.info('pull(rebase) requested', {
      workspaceId: workspaceId ?? null,
      cwd: folder.localGitPath,
    })
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const pullStart = performance.now()
      const r = await api.workspace.gitPull({ cwd: folder.localGitPath })
      if (!r.ok) {
        log.warn('pull(rebase) failed', {
          cwd: folder.localGitPath,
          durationMs: elapsedMs(pullStart),
          error: summarizeGitText(r.error) ?? r.error,
        })
        await handleGitOperationError(r.error)
        return
      }
      log.info('pull(rebase) finished', {
        cwd: folder.localGitPath,
        durationMs: elapsedMs(pullStart),
        output: summarizeGitText(r.stdout) ?? undefined,
      })
      const reloadStart = performance.now()
      await reloadNotesFromDisk()
      log.info('pull(rebase) reloadNotesFromDisk complete', {
        cwd: folder.localGitPath,
        durationMs: elapsedMs(reloadStart),
      })
      const refreshStart = performance.now()
      await Promise.all([
        refreshWorkspaceGitStatuses(),
        refreshGitRepositoryStatus(),
        refreshGitSourceControl(),
      ])
      log.info('pull(rebase) post-refresh complete', {
        cwd: folder.localGitPath,
        durationMs: elapsedMs(refreshStart),
      })
    } finally {
      log.info('pull(rebase) flow finished', {
        cwd: folder.localGitPath,
        totalDurationMs: elapsedMs(flowStart),
      })
      setGitSyncBusy(false)
    }
  }, [handleGitOperationError, refreshGitRepositoryStatus, refreshGitSourceControl, refreshWorkspaceGitStatuses, reloadNotesFromDisk, resolveActiveGitFolder])

  const handleGitPullThenPush = useCallback(async (workspaceId?: string) => {
    const api = getApi()
    const folder = resolveActiveGitFolder(workspaceId)
    if (!folder?.localGitPath || !api?.workspace?.gitPull || !api.workspace.gitPush) return
    const flowStart = performance.now()
    log.info('pull(rebase)+push requested', {
      workspaceId: workspaceId ?? null,
      cwd: folder.localGitPath,
    })
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const pullStart = performance.now()
      const pullR = await api.workspace.gitPull({ cwd: folder.localGitPath })
      if (!pullR.ok) {
        log.warn('pull(rebase)+push pull failed', {
          cwd: folder.localGitPath,
          durationMs: elapsedMs(pullStart),
          error: summarizeGitText(pullR.error) ?? pullR.error,
        })
        await handleGitOperationError(pullR.error)
        return
      }
      log.info('pull(rebase)+push pull finished', {
        cwd: folder.localGitPath,
        durationMs: elapsedMs(pullStart),
        output: summarizeGitText(pullR.stdout) ?? undefined,
      })

      const reloadStart = performance.now()
      await reloadNotesFromDisk()
      log.info('pull(rebase)+push reloadNotesFromDisk complete', {
        cwd: folder.localGitPath,
        durationMs: elapsedMs(reloadStart),
      })

      const pushStart = performance.now()
      const pushR = await api.workspace.gitPush({ cwd: folder.localGitPath })
      if (!pushR.ok) {
        log.warn('pull(rebase)+push push failed', {
          cwd: folder.localGitPath,
          durationMs: elapsedMs(pushStart),
          error: summarizeGitText(pushR.error) ?? pushR.error,
        })
        await handleGitOperationError(pushR.error)
        setGitSynced(false)
        return
      }
      log.info('pull(rebase)+push push finished', {
        cwd: folder.localGitPath,
        durationMs: elapsedMs(pushStart),
        output: summarizeGitText(pushR.stdout) ?? undefined,
      })

      setGitSynced(true)
      const refreshStart = performance.now()
      await Promise.all([
        refreshWorkspaceGitStatuses(),
        refreshGitRepositoryStatus(),
        refreshGitSourceControl(),
      ])
      log.info('pull(rebase)+push post-refresh complete', {
        cwd: folder.localGitPath,
        durationMs: elapsedMs(refreshStart),
      })
    } finally {
      log.info('pull(rebase)+push flow finished', {
        cwd: folder.localGitPath,
        totalDurationMs: elapsedMs(flowStart),
      })
      setGitSyncBusy(false)
    }
  }, [handleGitOperationError, refreshGitRepositoryStatus, refreshGitSourceControl, refreshWorkspaceGitStatuses, reloadNotesFromDisk, resolveActiveGitFolder])

  const handleGitCommitAndPush = useCallback(async (workspaceId?: string) => {
    const api = getApi()
    const folder = resolveActiveGitFolder(workspaceId)
    if (!folder?.localGitPath || !api?.workspace?.gitCommit) return
    setGitSyncBusy(true)
    setGitSyncError(null)
    try {
      const commitR = await api.workspace.gitCommit({
        cwd: folder.localGitPath,
        message: gitCommitMessage.trim() || 'Update notes',
        authorName: user?.name?.trim() || 'notelab.io',
        authorEmail: user?.email?.trim() || 'notes@notelab.io',
      })
      if (!commitR.ok && commitR.error !== 'nothing_to_commit') {
        await handleGitOperationError(commitR.error)
        return
      }

      if (api.workspace.gitPush) {
        const pushR = await api.workspace.gitPush({ cwd: folder.localGitPath })
        if (!pushR.ok) {
          await handleGitOperationError(pushR.error)
          return
        }
      }

      setGitCommitMessage('')
      await Promise.all([
        refreshWorkspaceGitStatuses(),
        refreshGitRepositoryStatus(),
        refreshGitSourceControl(),
      ])
    } finally {
      setGitSyncBusy(false)
    }
  }, [gitCommitMessage, handleGitOperationError, refreshGitRepositoryStatus, refreshGitSourceControl, refreshWorkspaceGitStatuses, resolveActiveGitFolder, user])

  const handleSaveGithubRemote = useCallback((overrideUrl?: string) => {
    const url = overrideUrl !== undefined ? overrideUrl.trim() : githubRemoteUrl.trim()
    updateSavedRemoteUrl(url)
    setGitHubMessage(url ? 'Saved remote URL.' : 'Cleared saved remote URL.')
  }, [githubRemoteUrl, updateSavedRemoteUrl])

  const handleGitRemoteConnected = useCallback(async (remoteUrl: string) => {
    const url = remoteUrl.trim()
    if (!url) return
    updateSavedRemoteUrl(url)
    setGitHasOriginRemote(true)
    setGitRemoteDialogOpen(false)
    setGitHubMessage('Remote connected.')
    await Promise.all([
      refreshGitRepositoryStatus(),
      refreshWorkspaceGitStatuses(),
      refreshGitSourceControl(),
    ])
  }, [refreshGitRepositoryStatus, refreshGitSourceControl, refreshWorkspaceGitStatuses, updateSavedRemoteUrl])

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
    try {
      const r = await api.workspace.setGitRemote({ cwd, url })
      if (!r.ok) {
        const err = r.error.toLowerCase()
        if (
          err.includes('user.name') ||
          err.includes('user.email') ||
          err.includes('please tell me who you are')
        ) {
          setGitPendingRetry(() => async () => { await handleApplyGithubRemote() })
          setGitUserConfigDialogOpen(true)
          setGitHubBusy(false)
          return
        }
        setGitHubMessage(r.error)
        return
      }
      updateSavedRemoteUrl(url)
      setGitHasOriginRemote(true)
      setGitHubMessage('Remote origin set on the current workspace.')
      await Promise.all([
        refreshGitRepositoryStatus(),
        refreshWorkspaceGitStatuses(),
        refreshGitSourceControl(),
      ])
    } finally {
      setGitHubBusy(false)
    }
  }, [githubRemoteUrl, primaryGitFolder?.localGitPath, refreshGitRepositoryStatus, refreshGitSourceControl, refreshWorkspaceGitStatuses, updateSavedRemoteUrl, setGitUserConfigDialogOpen, setGitPendingRetry])

  const gitToolbarFolder = useMemo((): Folder | null => {
    if (!primaryGitFolder?.localGitPath) return null
    const resolvedRemoteUrl = githubRemoteUrl.trim() || primaryGitFolder.githubRemoteUrl
    return {
      folder: 'app-git',
      name: '~/.notelab',
      localGitPath: primaryGitFolder.localGitPath,
      githubRemoteUrl: resolvedRemoteUrl,
    }
  }, [githubRemoteUrl, primaryGitFolder])

  return {
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
    gitHubMessage,
    gitRemoteDialogOpen,
    setGitRemoteDialogOpen,
    gitRepoReady,
    gitHasOriginRemote,
    gitInitBusy,
    gitInitError,
    gitToolbarFolder,
    refreshGitRepositoryStatus,
    handleInitGit,
    handleGitCommit,
    handleGitPull,
    handleGitPullThenPush,
    handleGitPush,
    handleGitCommitAndPush,
    handleSaveGithubRemote,
    handleGitRemoteConnected,
    handleApplyGithubRemote,
  }
}

export type NotesGitSyncModel = ReturnType<typeof useNotesGitSync>

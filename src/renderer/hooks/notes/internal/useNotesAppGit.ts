import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react'

import { getApi } from '@/bridges/auth/auth-bridge'
import { DEFAULT_WORKSPACE_ID, type Folder } from '@/lib/notes/notes-storage'
import { useNotesStore } from '@/stores/notes/useNotesStore'

type UseNotesAppGitArgs = {
  folders: Folder[]
  foldersRef: MutableRefObject<Folder[]>
  dataRootRef: MutableRefObject<string | null>
  dataRootPath: string | null
  diskMode: boolean
}

export function useNotesAppGit({
  folders,
  foldersRef,
  dataRootRef,
  dataRootPath,
  diskMode
}: UseNotesAppGitArgs) {
  const {
    githubRemoteUrl,
    setGithubRemoteUrl,
    dirtyByWorkspaceId,
    setDirtyByWorkspaceId,
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
    setGitInitError
  } = useNotesStore()
  const gitStatusRefreshTimerRef = useRef<number | null>(null)

  const refreshWorkspaceGitStatuses = useCallback(async () => {
    const api = getApi()
    if (!api?.workspace?.gitStatus) return
    const gitStatus = api.workspace.gitStatus
    const foldersWithGit = foldersRef.current.filter((folder) => folder.localGitPath)
    const rootCwd = dataRootRef.current
    const tasks: Promise<[string, boolean] | null>[] = foldersWithGit.map(async (folder) => {
      const status = await gitStatus({ cwd: folder.localGitPath! })
      return status.ok ? ([folder.folder, status.dirty] as [string, boolean]) : null
    })
    if (foldersRef.current.length === 0 && rootCwd) {
      tasks.push(
        gitStatus({ cwd: rootCwd }).then((status) =>
          status.ok ? ([DEFAULT_WORKSPACE_ID, status.dirty] as [string, boolean]) : null
        )
      )
    }
    const results = await Promise.all(tasks)
    const next: Record<string, boolean> = {}
    for (const result of results) {
      if (result) next[result[0]] = result[1]
    }
    setDirtyByWorkspaceId(next)
  }, [dataRootRef, foldersRef, setDirtyByWorkspaceId])

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

  const gitDirtyGlobal = useMemo(
    () => Object.values(dirtyByWorkspaceId).some(Boolean),
    [dirtyByWorkspaceId]
  )

  useEffect(() => {
    if (!folders.some((folder) => folder.localGitPath) && !(diskMode && dataRootPath)) return
    void refreshWorkspaceGitStatuses()
  }, [dataRootPath, diskMode, folders, refreshWorkspaceGitStatuses])

  useEffect(() => {
    if (!folders.some((folder) => folder.localGitPath) && !(diskMode && dataRootPath)) return
    const id = window.setInterval(() => {
      void refreshWorkspaceGitStatuses()
    }, 12_000)
    return () => window.clearInterval(id)
  }, [dataRootPath, diskMode, folders, refreshWorkspaceGitStatuses])

  useEffect(() => {
    return () => {
      if (gitStatusRefreshTimerRef.current !== null) {
        window.clearTimeout(gitStatusRefreshTimerRef.current)
        gitStatusRefreshTimerRef.current = null
      }
    }
  }, [])

  return {
    githubRemoteUrl,
    setGithubRemoteUrl,
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
    scheduleWorkspaceGitStatusRefresh
  }
}

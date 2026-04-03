import type { JSX } from 'react'

import { ArrowDownToLine, CloudUpload, GitCommitHorizontal, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getApi } from '@/lib/auth-bridge'
import type { WorkspaceFolder } from '@/lib/notes-storage'
import { isPushRejectedFetchFirst } from './git-sync-errors'

export type GitSyncToolbarProps = {
  folder: WorkspaceFolder
  /** When set to `github_api`, sync uses the Worker + GitHub REST API instead of local `git`. */
  syncTransport?: 'git' | 'github_api'
  /** True when there are uncommitted changes in the working tree. */
  dirty: boolean
  /** When true, show the toolbar even if the tree is clean (e.g. after a failed push). */
  hasSyncError: boolean
  commitMessage: string
  onCommitMessageChange: (v: string) => void
  busy: boolean
  actionError: string | null
  onPull?: () => Promise<void>
  /** Runs pull --rebase, then push (for “fetch first” / non-fast-forward rejections). */
  onPullThenPush?: () => Promise<void>
  onCommit: () => Promise<void>
  onPush: () => Promise<void>
  onCommitAndPush: () => Promise<void>
}

const textareaClassName =
  'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[4.5rem] w-full resize-y rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'

export function GitSyncToolbar({
  folder,
  syncTransport = 'git',
  dirty,
  hasSyncError,
  commitMessage,
  onCommitMessageChange,
  busy,
  actionError,
  onPull,
  onPullThenPush,
  onCommit,
  onPush,
  onCommitAndPush,
}: GitSyncToolbarProps): JSX.Element | null {
  const api = getApi()
  const useApi = syncTransport === 'github_api'
  const canPull =
    typeof onPull === 'function' &&
    (useApi ? Boolean(api?.auth?.fetch) : Boolean(api?.workspace?.gitPull))
  const canPullThenPush =
    typeof onPullThenPush === 'function' &&
    (useApi
      ? Boolean(api?.auth?.fetch)
      : Boolean(api?.workspace?.gitPull && api.workspace.gitPush))
  const fetchFirstRejection = actionError ? isPushRejectedFetchFirst(actionError) : false
  if (!folder.localGitPath || (!dirty && !hasSyncError)) {
    return null
  }
  if (!useApi && (!api?.workspace?.gitCommit || !api.workspace.gitPush)) {
    return null
  }
  if (useApi && !api?.auth?.fetch) {
    return null
  }

  const msgId = `gitnotes-commit-msg-${folder.id}`
  const showCommitFields = dirty

  return (
    <div className="border-border bg-muted/20 rounded-lg border p-4">
      {showCommitFields ? (
        <p className="text-foreground text-sm font-medium">
          Uncommitted changes in{' '}
          <span className="text-muted-foreground font-normal">{folder.name}</span>
        </p>
      ) : (
        <p className="text-foreground text-sm font-medium">
          Git reported a problem syncing with the remote (see below).
        </p>
      )}
      {fetchFirstRejection && canPullThenPush ? (
        <div className="bg-muted/80 border-border mt-3 rounded-md border px-3 py-2.5">
          <p className="text-foreground text-xs leading-relaxed">
            The remote has commits you do not have yet (for example a README created on GitHub). Pull
            those in, then push again, using the button below.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-2 gap-1.5"
            disabled={busy}
            onClick={() => void onPullThenPush!()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Pull, then push
          </Button>
        </div>
      ) : null}
      {showCommitFields ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="w-full space-y-1.5">
            <label className="text-foreground text-xs font-medium" htmlFor={msgId}>
              Commit message
            </label>
            <textarea
              id={msgId}
              rows={3}
              value={commitMessage}
              onChange={(e) => onCommitMessageChange(e.target.value)}
              placeholder="Describe this commit"
              className={textareaClassName}
              disabled={busy}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              className="gap-1.5"
              onClick={() => void onCommit()}
            >
              <GitCommitHorizontal className="size-3.5" aria-hidden />
              Commit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              className="gap-1.5"
              onClick={() => void onPush()}
            >
              <CloudUpload className="size-3.5" aria-hidden />
              Push
            </Button>
            {canPull ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                className="gap-1.5"
                onClick={() => void onPull!()}
              >
                <ArrowDownToLine className="size-3.5" aria-hidden />
                Pull (rebase)
              </Button>
            ) : null}
            {canPullThenPush && !fetchFirstRejection ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                className="gap-1.5"
                onClick={() => void onPullThenPush!()}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Pull, then push
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={busy}
              className="gap-1.5"
              onClick={() => void onCommitAndPush()}
            >
              Commit & push
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {canPull ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              className="gap-1.5"
              onClick={() => void onPull!()}
            >
              <ArrowDownToLine className="size-3.5" aria-hidden />
              Pull remote (rebase)
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            className="gap-1.5"
            onClick={() => void onPush()}
          >
            <CloudUpload className="size-3.5" aria-hidden />
            Push
          </Button>
        </div>
      )}
      {actionError ? (
        <p className="text-destructive mt-3 text-xs whitespace-pre-wrap">{actionError}</p>
      ) : null}
    </div>
  )
}

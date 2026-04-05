import { useState, type JSX } from 'react'

import { FolderGit2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApi } from '@/lib/auth-bridge'
import type { WorkspaceFolder } from '@/lib/notes-storage'
import type { MacTitlebarStyles } from './notes-app-types'
import { GitSyncToolbar } from './GitSyncToolbar'
import { slugifyRepoSuggestion } from './notes-app-utils'

export type GitHubSettingsViewProps = {
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
  /** `github_api` when using the Worker + GitHub App; otherwise local `git`. */
  syncTransport?: 'git' | 'github_api'
  folders: WorkspaceFolder[]
  githubRemoteUrl: string
  setGithubRemoteUrl: (v: string) => void
  onSaveRemote: () => void
  onApplyRemote: () => Promise<void>
  gitHubBusy: boolean
  gitHubMessage: string | null
  gitToolbarFolder: WorkspaceFolder | null
  gitDirtyGlobal: boolean
  gitCommitMessage: string
  setGitCommitMessage: (v: string) => void
  gitSyncBusy: boolean
  gitSyncError: string | null
  primaryGitFolderId: string | null
  onGitCommit: (workspaceId?: string) => Promise<void>
  onGitPull: (workspaceId?: string) => Promise<void>
  onGitPullThenPush: (workspaceId?: string) => Promise<void>
  onGitPush: (workspaceId?: string) => Promise<void>
  onGitCommitAndPush: (workspaceId?: string) => Promise<void>
}

export function GitHubSettingsView({
  macElectron,
  macTitlebarStyles,
  syncTransport = 'git',
  folders,
  githubRemoteUrl,
  setGithubRemoteUrl,
  onSaveRemote,
  onApplyRemote,
  gitHubBusy,
  gitHubMessage,
  gitToolbarFolder,
  gitDirtyGlobal,
  gitCommitMessage,
  setGitCommitMessage,
  gitSyncBusy,
  gitSyncError,
  primaryGitFolderId,
  onGitCommit,
  onGitPull,
  onGitPullThenPush,
  onGitPush,
  onGitCommitAndPush,
}: GitHubSettingsViewProps): JSX.Element {
  const syncErrorVisible = Boolean(gitSyncError?.trim())
  const [repoNameDraft, setRepoNameDraft] = useState(() =>
    slugifyRepoSuggestion(folders[0]?.name ?? 'notelab')
  )

  const openGitHubNew = (): void => {
    const q = new URLSearchParams()
    const n = repoNameDraft.trim() || slugifyRepoSuggestion(folders[0]?.name ?? 'notelab')
    q.set('name', n)
    q.set('description', 'notelab.io — notes synced from ~/.notelab.io'.slice(0, 350))
    const url = `https://github.com/new?${q.toString()}`
    const api = getApi()
    if (api?.workspace?.openExternal) {
      void api.workspace.openExternal(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const localPath = gitToolbarFolder?.localGitPath

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">GitHub & Git</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {syncTransport === 'github_api' ? (
            <>
              Sync <code className="text-xs">~/.notelab.io</code> to your linked GitHub repository via the
              GitHub API (no local Git required).
            </>
          ) : (
            <>
              Connect <code className="text-xs">~/.notelab.io</code> to GitHub and commit or push changes.
            </>
          )}
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
          <FolderGit2 className="size-4" aria-hidden />
          Repository on GitHub
        </h3>
        <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
          <li>Create a new empty repository on GitHub (no README required).</li>
          <li>Paste the repository URL below and apply it to your local ~/.notelab.io clone.</li>
        </ol>
        <div className="space-y-2">
          <Label htmlFor="settings-gh-repo-name">Suggested repository name</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="settings-gh-repo-name"
              value={repoNameDraft}
              onChange={(e) => setRepoNameDraft(e.target.value)}
              placeholder="my-notes"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 gap-2"
              onClick={openGitHubNew}
            >
              <FolderGit2 className="size-4" aria-hidden />
              Open GitHub
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-gh-remote">Remote URL</Label>
          <Input
            id="settings-gh-remote"
            value={githubRemoteUrl}
            onChange={(e) => setGithubRemoteUrl(e.target.value)}
            placeholder="https://github.com/you/repo.git"
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onSaveRemote}>
              Save link
            </Button>
            {localPath ? (
              <Button type="button" onClick={() => void onApplyRemote()} disabled={gitHubBusy}>
                Apply remote to ~/.notelab.io
              </Button>
            ) : null}
          </div>
        </div>
        {localPath ? (
          <p className="text-muted-foreground text-xs break-all">Local repository: {localPath}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            The desktop app creates <code className="text-xs">~/.notelab.io</code> when it starts. If
            no path appears here, wait a moment or restart (Git must be installed).
          </p>
        )}
        {gitHubMessage ? (
          <p className="text-foreground text-sm whitespace-pre-wrap">{gitHubMessage}</p>
        ) : null}
      </section>

      {gitToolbarFolder ? (
        <section className="border-border flex flex-col gap-4 border-t pt-6">
          <div className="space-y-1">
            <h3 className="text-foreground text-sm font-semibold tracking-tight">Sync to Git</h3>
            <p className="text-muted-foreground text-xs">
              Commit message and actions apply to your local <code className="text-xs">~/.notelab.io</code>{' '}
              repository.
            </p>
          </div>
          {gitDirtyGlobal || syncErrorVisible ? (
            <GitSyncToolbar
              folder={gitToolbarFolder}
              syncTransport={syncTransport}
              dirty={gitDirtyGlobal}
              hasSyncError={syncErrorVisible}
              commitMessage={gitCommitMessage}
              onCommitMessageChange={setGitCommitMessage}
              busy={gitSyncBusy}
              actionError={gitSyncError}
              onPull={() => onGitPull(primaryGitFolderId ?? undefined)}
              onPullThenPush={() => onGitPullThenPush(primaryGitFolderId ?? undefined)}
              onCommit={() => onGitCommit(primaryGitFolderId ?? undefined)}
              onPush={() => onGitPush(primaryGitFolderId ?? undefined)}
              onCommitAndPush={() => onGitCommitAndPush(primaryGitFolderId ?? undefined)}
            />
          ) : (
            <p className="text-muted-foreground rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-sm">
              Working tree clean — nothing to commit.
            </p>
          )}
        </section>
      ) : null}
    </div>
  )
}

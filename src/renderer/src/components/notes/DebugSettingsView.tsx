import type { JSX } from 'react'

import { Bug, ClipboardCopy, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getApi } from '@/lib/auth-bridge'
import { isMacElectron } from '@/lib/electron-env'
import type { MacTitlebarStyles } from './notes-app-types'

export type DebugSettingsViewProps = {
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
  localGitPath: string | null
  githubRemoteUrl: string
  foldersCount: number
  notesCount: number
  dirtyByWorkspaceId: Record<string, boolean>
  onRefreshGitStatus: () => void
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-muted-foreground w-40 shrink-0 text-xs font-medium">{label}</dt>
      <dd className="text-foreground font-mono text-xs break-all">{value || '—'}</dd>
    </div>
  )
}

export function DebugSettingsView({
  macElectron,
  macTitlebarStyles,
  localGitPath,
  githubRemoteUrl,
  foldersCount,
  notesCount,
  dirtyByWorkspaceId,
  onRefreshGitStatus,
}: DebugSettingsViewProps): JSX.Element {
  const api = getApi()
  const macDarwinUi = isMacElectron()

  const w = api?.workspace
  const workspaceFlags = w
    ? {
        ensureDataRoot: typeof w.ensureDataRoot === 'function',
        openExternal: typeof w.openExternal === 'function',
        setGitRemote: typeof w.setGitRemote === 'function',
        syncMarkdown: typeof w.syncMarkdown === 'function',
        readGitnotesIndex: typeof w.readGitnotesIndex === 'function',
        writeNoteFile: typeof w.writeNoteFile === 'function',
        deleteNoteFiles: typeof w.deleteNoteFiles === 'function',
        gitStatus: typeof w.gitStatus === 'function',
        gitCommit: typeof w.gitCommit === 'function',
        gitPull: typeof w.gitPull === 'function',
        gitPush: typeof w.gitPush === 'function',
      }
    : null

  const copyPath = (): void => {
    if (!localGitPath) return
    void navigator.clipboard.writeText(localGitPath)
  }

  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex items-start gap-3">
        <Bug className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <h2 className="text-foreground text-xl font-semibold tracking-tight">Debug</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Environment and GitNotes integration details for troubleshooting.
          </p>
        </div>
      </div>

      <dl className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <Row label="Renderer API" value={api ? 'window.api present' : 'window.api missing'} />
        <Row label="macOS Electron UI" value={macDarwinUi ? 'yes' : 'no'} />
        <Row label="User agent" value={typeof navigator !== 'undefined' ? navigator.userAgent : ''} />
        <Row label="Workspaces" value={String(foldersCount)} />
        <Row label="Notes" value={String(notesCount)} />
        <Row label="Saved remote URL" value={githubRemoteUrl.trim() || '(none)'} />
        <Row label="Local Git path" value={localGitPath ?? '(none)'} />
        <Row
          label="Dirty by workspace"
          value={
            Object.keys(dirtyByWorkspaceId).length === 0
              ? '{}'
              : JSON.stringify(dirtyByWorkspaceId)
          }
        />
      </dl>

      {workspaceFlags ? (
        <div className="space-y-2">
          <h3 className="text-foreground text-sm font-medium">Workspace IPC</h3>
          <ul className="text-muted-foreground font-mono text-xs">
            {Object.entries(workspaceFlags).map(([k, v]) => (
              <li key={k}>
                {k}: {v ? 'yes' : 'no'}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No workspace API (e.g. web build).</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => onRefreshGitStatus()}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh git status
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={!localGitPath}
          onClick={copyPath}
        >
          <ClipboardCopy className="size-3.5" aria-hidden />
          Copy repo path
        </Button>
      </div>
    </div>
  )
}

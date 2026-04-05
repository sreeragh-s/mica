import type { JSX } from 'react'
import { useState } from 'react'

import { Bug, ClipboardCopy, Database, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getApi } from '@/lib/auth-bridge'
import { getEmbeddingsApi } from '@/lib/lancedb-embeddings-bridge'
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
  const emb = getEmbeddingsApi()
  const [lanceStatusText, setLanceStatusText] = useState<string | null>(null)
  const [lancePingText, setLancePingText] = useState<string | null>(null)
  const [lanceStatusBusy, setLanceStatusBusy] = useState(false)
  const [lancePingBusy, setLancePingBusy] = useState(false)

  const w = api?.workspace
  const workspaceFlags = w
    ? {
        ensureDataRoot: typeof w.ensureDataRoot === 'function',
        openExternal: typeof w.openExternal === 'function',
        setGitRemote: typeof w.setGitRemote === 'function',
        syncMarkdown: typeof w.syncMarkdown === 'function',
        readNotelabIndex: typeof w.readNotelabIndex === 'function',
        writeNoteFile: typeof w.writeNoteFile === 'function',
        deleteNoteFiles: typeof w.deleteNoteFiles === 'function',
        gitStatus: typeof w.gitStatus === 'function',
        gitCommit: typeof w.gitCommit === 'function',
        gitPull: typeof w.gitPull === 'function',
        gitPush: typeof w.gitPush === 'function',
        readAppConfig: typeof w.readAppConfig === 'function',
        writeAppConfig: typeof w.writeAppConfig === 'function',
      }
    : null

  const copyPath = (): void => {
    if (!localGitPath) return
    void navigator.clipboard.writeText(localGitPath)
  }

  const checkLanceStatus = (): void => {
    if (!emb) {
      setLanceStatusText('Not available (not Electron or preload missing embeddings API).')
      return
    }
    setLanceStatusBusy(true)
    setLanceStatusText(null)
    void emb
      .getStatus()
      .then((r) => {
        if (r.ok) {
          setLanceStatusText(
            `Connected. DB path: ${r.dbPath} · table note_embeddings: ${r.tableExists ? 'yes' : 'no (create on first index or ensureTable)'}`
          )
        } else {
          setLanceStatusText(`Error: ${r.error}`)
        }
      })
      .catch((e: unknown) => {
        setLanceStatusText(`Error: ${e instanceof Error ? e.message : String(e)}`)
      })
      .finally(() => {
        setLanceStatusBusy(false)
      })
  }

  /** Writes a 4-D test vector, searches, then deletes — verifies native LanceDB + IPC end-to-end. */
  const pingLanceStore = (): void => {
    if (!emb) {
      setLancePingText('Not available (not Electron).')
      return
    }
    const dim = 4
    const workspaceId = '__notelab_debug__'
    const noteId = '__lancedb_ping__'
    const testVec = [1, 0, 0, 0]
    setLancePingBusy(true)
    setLancePingText(null)
    void (async () => {
      try {
        const ensured = await emb.ensureTable({ vectorDimension: dim })
        if (!ensured.ok) {
          setLancePingText(`ensureTable failed: ${ensured.error}`)
          return
        }
        const indexed = await emb.indexNoteEmbeddings({
          workspaceId,
          noteId,
          vectorDimension: dim,
          chunks: [{ chunkIndex: 0, text: 'lancedb connectivity ping', vector: testVec }],
        })
        if (!indexed.ok) {
          setLancePingText(`indexNoteEmbeddings failed: ${indexed.error}`)
          return
        }
        const searched = await emb.vectorSearch({
          queryVector: testVec,
          limit: 5,
          filterSql: `workspace_id = '${workspaceId.replace(/'/g, "''")}'`,
        })
        if (!searched.ok) {
          setLancePingText(`vectorSearch failed: ${searched.error}`)
          return
        }
        const deleted = await emb.deleteNoteEmbeddings({ workspaceId, noteId })
        if (!deleted.ok) {
          setLancePingText(`deleteNoteEmbeddings failed: ${deleted.error}`)
          return
        }
        const hits = searched.rows.length
        const firstText =
          hits > 0 && typeof searched.rows[0]?.text === 'string'
            ? (searched.rows[0].text as string).slice(0, 40)
            : '(no text)'
        setLancePingText(
          `OK · indexed ${indexed.indexed} row(s), search returned ${hits} row(s), sample: ${firstText} · test row deleted.`
        )
      } catch (e) {
        setLancePingText(`Error: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setLancePingBusy(false)
      }
    })()
  }

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex items-start gap-3">
        <Bug className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-foreground text-lg font-semibold tracking-tight">Debug</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Environment and notelab.io integration details for troubleshooting.
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
          label="App config file"
          value={
            localGitPath
              ? `${localGitPath}/notelab.config`
              : '(set when ~/.notelab.io is available)'
          }
        />
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

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Database className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <h3 className="text-foreground text-sm font-medium">Local embedding store (LanceDB)</h3>
        </div>
        <dl className="border-border flex flex-col gap-2 rounded-lg border p-4">
          <Row
            label="IPC bridge"
            value={emb ? 'window.api.embeddings available' : 'unavailable (use Electron app)'}
          />
          {lanceStatusText ? (
            <Row label="Last status" value={lanceStatusText} />
          ) : null}
          {lancePingText ? (
            <Row label="Last connectivity test" value={lancePingText} />
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={!emb || lanceStatusBusy}
            onClick={checkLanceStatus}
          >
            <Database className="size-3.5" aria-hidden />
            {lanceStatusBusy ? 'Checking…' : 'Check status'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={!emb || lancePingBusy}
            onClick={pingLanceStore}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {lancePingBusy ? 'Testing…' : 'Run connectivity test'}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          <strong className="text-foreground font-medium">Check status</strong> opens the DB and reports the on-disk path.
          <strong className="text-foreground font-medium"> Run connectivity test</strong> creates a tiny table if needed,
          writes a 4-D test vector, runs one search, then deletes the test row.
        </p>
      </div>

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

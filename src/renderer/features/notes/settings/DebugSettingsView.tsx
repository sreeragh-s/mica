import type { JSX } from 'react'
import { useState } from 'react'

import { Bug, ClipboardCopy, Database, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getApi } from '@/bridges/auth/auth-bridge'
import { getEmbeddingsApi } from '@/bridges/ai/embeddings-bridge'
import { isMacNotelab as detectIsMacNotelab } from '@/lib/core/electron-env'
import type { MacTitlebarStyles } from '@/features/notes/notes-app-types'

export type DebugSettingsViewProps = {
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  workspacePath: string | null
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
  isMacNotelab,
  macTitlebarStyles,
  workspacePath,
  localGitPath,
  githubRemoteUrl,
  foldersCount,
  notesCount,
  dirtyByWorkspaceId,
  onRefreshGitStatus
}: DebugSettingsViewProps): JSX.Element {
  const api = getApi()
  const macDarwinUi = detectIsMacNotelab()
  const emb = getEmbeddingsApi()
  const [storeStatusText, setStoreStatusText] = useState<string | null>(null)
  const [storePingText, setStorePingText] = useState<string | null>(null)
  const [storeStatusBusy, setStoreStatusBusy] = useState(false)
  const [storePingBusy, setStorePingBusy] = useState(false)

  const w = api?.workspace
  const workspaceFlags = w
    ? {
        ensureDataRoot: typeof w.ensureDataRoot === 'function',
        openExternal: typeof w.openExternal === 'function',
        setGitRemote: typeof w.setGitRemote === 'function',
        syncMarkdown: typeof w.syncMarkdown === 'function',
        readNotelabIndex: typeof w.readNotelabIndex === 'function',
        writeNoteFile: typeof w.writeNoteFile === 'function',
        deleteNoteFile: typeof w.deleteNoteFile === 'function',
        gitStatus: typeof w.gitStatus === 'function',
        gitCommit: typeof w.gitCommit === 'function',
        gitPull: typeof w.gitPull === 'function',
        gitPush: typeof w.gitPush === 'function',
        readAppConfig: typeof w.readAppConfig === 'function',
        writeAppConfig: typeof w.writeAppConfig === 'function'
      }
    : null

  const copyPath = (): void => {
    if (!localGitPath) return
    void navigator.clipboard.writeText(localGitPath)
  }

  const checkStoreStatus = (): void => {
    if (!emb) {
      setStoreStatusText('Not available (not Electron or preload missing embeddings API).')
      return
    }
    if (!workspacePath) {
      setStoreStatusText('No workspace is currently open.')
      return
    }
    setStoreStatusBusy(true)
    setStoreStatusText(null)
    void emb
      .getStatus({ workspacePath })
      .then((r) => {
        if (r.ok) {
          setStoreStatusText(
            `Connected. Index path: ${r.indexPath} · documents: ${r.documents} · chunks: ${r.chunks}`
          )
        } else {
          setStoreStatusText(`Error: ${r.error}`)
        }
      })
      .catch((e: unknown) => {
        setStoreStatusText(`Error: ${e instanceof Error ? e.message : String(e)}`)
      })
      .finally(() => {
        setStoreStatusBusy(false)
      })
  }

  /** Upserts a tiny document, queries it back, then deletes it. */
  const pingEmbeddingStore = (): void => {
    if (!emb) {
      setStorePingText('Not available (not Electron).')
      return
    }
    if (!workspacePath) {
      setStorePingText('No workspace is currently open.')
      return
    }
    const folder = '__notelab_debug__'
    const note = '__sqlite_vector_ping__'
    setStorePingBusy(true)
    setStorePingText(null)
    void (async () => {
      try {
        const ensured = await emb.ensureIndex({ workspacePath })
        if (!ensured.ok) {
          setStorePingText(`ensureIndex failed: ${ensured.error}`)
          return
        }
        const indexed = await emb.upsertNoteDocument({
          workspacePath,
          folder,
          note,
          title: 'SQLite vector ping',
          kind: 'note',
          contentHash: 'debug-ping',
          text: 'sqlite vector connectivity ping',
          docType: 'txt'
        })
        if (!indexed.ok) {
          setStorePingText(`upsertNoteDocument failed: ${indexed.error}`)
          return
        }
        const searched = await emb.searchDocuments({
          workspacePath,
          query: 'sqlite vector connectivity ping',
          maxDocuments: 3,
          maxChunks: 10,
          maxSections: 1,
          maxTokens: 160,
          filter: { folder: { $eq: folder }, note: { $eq: note } }
        })
        if (!searched.ok) {
          setStorePingText(`searchDocuments failed: ${searched.error}`)
          return
        }
        const deleted = await emb.deleteNoteDocument({ workspacePath, note })
        if (!deleted.ok) {
          setStorePingText(`deleteNoteDocument failed: ${deleted.error}`)
          return
        }
        const hits = searched.rows.length
        const firstText = hits > 0 ? searched.rows[0].text.slice(0, 40) : '(no text)'
        setStorePingText(
          `OK · indexed ${indexed.indexed} chunk(s), search returned ${hits} row(s), sample: ${firstText} · test document deleted.`
        )
      } catch (e) {
        setStorePingText(`Error: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setStorePingBusy(false)
      }
    })()
  }

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
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
        <Row label="macOS Notelab UI" value={macDarwinUi ? 'yes' : 'no'} />
        <Row
          label="User agent"
          value={typeof navigator !== 'undefined' ? navigator.userAgent : ''}
        />
        <Row label="Workspace path" value={workspacePath ?? '(none)'} />
        <Row label="Workspaces" value={String(foldersCount)} />
        <Row label="Notes" value={String(notesCount)} />
        <Row label="Saved remote URL" value={githubRemoteUrl.trim() || '(none)'} />
        <Row label="Local Git path" value={localGitPath ?? '(none)'} />
        <Row
          label="App config file"
          value={
            localGitPath ? `${localGitPath}/notelab.config` : '(set when ~/.notelab is available)'
          }
        />
        <Row
          label="Dirty by workspace"
          value={
            Object.keys(dirtyByWorkspaceId).length === 0 ? '{}' : JSON.stringify(dirtyByWorkspaceId)
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
          <h3 className="text-foreground text-sm font-medium">
            Local embedding store (SQLite vector)
          </h3>
        </div>
        <dl className="border-border flex flex-col gap-2 rounded-lg border p-4">
          <Row
            label="IPC bridge"
            value={emb ? 'window.api.embeddings available' : 'unavailable (use Electron app)'}
          />
          {storeStatusText ? <Row label="Last status" value={storeStatusText} /> : null}
          {storePingText ? <Row label="Last connectivity test" value={storePingText} /> : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={!emb || !workspacePath || storeStatusBusy}
            onClick={checkStoreStatus}
          >
            <Database className="size-3.5" aria-hidden />
            {storeStatusBusy ? 'Checking…' : 'Check status'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={!emb || !workspacePath || storePingBusy}
            onClick={pingEmbeddingStore}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {storePingBusy ? 'Testing…' : 'Run connectivity test'}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          <strong className="text-foreground font-medium">Check status</strong> opens the
          workspace-local index and reports the on-disk path.
          <strong className="text-foreground font-medium"> Run connectivity test</strong> indexes a
          tiny document, runs one retrieval query, then deletes the test document.
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

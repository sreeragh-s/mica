import { useCallback, useState, type JSX } from 'react'

import { FolderOpen, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getApi } from '@/lib/auth/auth-bridge'
import { loadSetupState, saveSetupState } from '@/lib/workspace/setup-storage'
import type { MacTitlebarStyles } from '@/components/notes/notes-app-types'

export type GitHubSettingsViewProps = {
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  /** Current workspace root path (from setup state / useNotesApp). */
  workspaceRoot: string | null
  /** Called after workspace root changes so the app can reload. */
  onWorkspaceRootChange: (newRoot: string) => Promise<void>
}

export function GitHubSettingsView({
  isMacNotelab,
  macTitlebarStyles,
  workspaceRoot,
  onWorkspaceRootChange,
}: GitHubSettingsViewProps): JSX.Element {
  const [pickBusy, setPickBusy] = useState(false)
  const [migratePrompt, setMigratePrompt] = useState<{
    fromPath: string
    toPath: string
  } | null>(null)
  const [migrateBusy, setMigrateBusy] = useState(false)
  const [migrateError, setMigrateError] = useState<string | null>(null)

  const applyNewRoot = useCallback(async (newPath: string): Promise<void> => {
    const api = getApi()
    if (!api?.workspace?.ensureDataRoot) return
    const r = await api.workspace.ensureDataRoot({ path: newPath })
    if (!r.ok) {
      setMigrateError(r.error)
      return
    }
    saveSetupState({
      ...loadSetupState(),
      workspaceRoot: newPath,
      syncMode: r.gitInitialized ? 'git' : 'local',
    })
    setMigratePrompt(null)
    await onWorkspaceRootChange(newPath)
  }, [onWorkspaceRootChange])

  const handlePickDirectory = useCallback(async (): Promise<void> => {
    const api = getApi()
    if (!api?.workspace?.pickDirectory) return
    setPickBusy(true)
    setMigrateError(null)
    try {
      const result = await api.workspace.pickDirectory()
      if (!result.ok) return // cancelled
      const newPath = result.path
      if (workspaceRoot && newPath !== workspaceRoot) {
        setMigratePrompt({ fromPath: workspaceRoot, toPath: newPath })
      } else {
        await applyNewRoot(newPath)
      }
    } finally {
      setPickBusy(false)
    }
  }, [workspaceRoot, applyNewRoot])

  const handleMigrateAndSwitch = useCallback(async (): Promise<void> => {
    if (!migratePrompt) return
    const api = getApi()
    if (!api?.workspace?.migrateWorkspace) return
    setMigrateBusy(true)
    setMigrateError(null)
    try {
      const r = await api.workspace.migrateWorkspace({
        fromCwd: migratePrompt.fromPath,
        toCwd: migratePrompt.toPath,
      })
      if (!r.ok) {
        setMigrateError(r.error)
        return
      }
      await applyNewRoot(migratePrompt.toPath)
    } finally {
      setMigrateBusy(false)
    }
  }, [migratePrompt, applyNewRoot])

  const handleSwitchWithoutMigrate = useCallback(async (): Promise<void> => {
    if (!migratePrompt) return
    await applyNewRoot(migratePrompt.toPath)
  }, [migratePrompt, applyNewRoot])

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">Workspace</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Choose where your notes are stored. Git and remote sync are managed from the Source
          Control panel.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-foreground flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="size-4" aria-hidden />
          Workspace folder
        </h3>
        <p className="text-muted-foreground text-xs leading-snug">
          All notes and config are stored here. Defaults to{' '}
          <code className="text-xs">~/.notelab</code>.
        </p>
        <div className="flex items-center gap-2">
          <div className="border-input bg-muted/30 min-w-0 flex-1 truncate rounded-md border px-2.5 py-1.5 font-mono text-xs">
            {workspaceRoot ?? <span className="text-muted-foreground">Not configured</span>}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={pickBusy || migrateBusy}
            onClick={() => void handlePickDirectory()}
          >
            {pickBusy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <FolderOpen className="size-3.5" aria-hidden />
            )}
            Change
          </Button>
        </div>

        {migratePrompt && (
          <div className="border-border space-y-3 rounded-lg border p-4">
            <p className="text-foreground text-sm font-medium">Copy notes to new folder?</p>
            <p className="text-muted-foreground text-xs leading-snug">
              Your existing notes are in{' '}
              <code className="text-xs break-all">{migratePrompt.fromPath}</code>. Copy them to{' '}
              <code className="text-xs break-all">{migratePrompt.toPath}</code> before switching?
            </p>
            <p className="text-muted-foreground text-xs">
              The original folder will not be deleted.
            </p>
            {migrateError && (
              <p className="text-destructive text-xs whitespace-pre-wrap">{migrateError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={migrateBusy}
                onClick={() => void handleMigrateAndSwitch()}
              >
                {migrateBusy && <Loader2 className="size-3.5 animate-spin mr-1" aria-hidden />}
                Copy &amp; switch
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={migrateBusy}
                onClick={() => void handleSwitchWithoutMigrate()}
              >
                Switch without copying
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={migrateBusy}
                onClick={() => setMigratePrompt(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

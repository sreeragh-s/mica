import { useCallback, useEffect, useState, type CSSProperties, type JSX } from 'react'

import { Check, ChevronsUpDown, FolderPlus } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getApi } from '@/bridges/auth/auth-bridge'
import { loadSetupState, saveSetupState } from '@/lib/workspace/setup-storage'
import { loadWorkspaces } from '@/lib/config/notelab-app-config-read'
import { upsertWorkspace } from '@/lib/config/notelab-app-config-write'
import type { SavedWorkspace } from '@/lib/config/notelab-config-schema'

export function deriveName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

export type WorkspaceSwitcherProps = {
  /** Current workspace root path. */
  workspaceRoot: string | null
  isMacNotelab: boolean
  /** Called to switch to a different workspace root in the current window. */
  onWorkspaceRootChange: (newRoot: string) => Promise<void>
  /** CSS class forwarded to the trigger button. */
  className?: string
}

export function WorkspaceSwitcher({
  workspaceRoot,
  isMacNotelab,
  onWorkspaceRootChange,
  className
}: WorkspaceSwitcherProps): JSX.Element {
  // Load workspaces from config synchronously - config is hydrated by App.tsx before this mounts.
  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>(loadWorkspaces)
  const [pickBusy, setPickBusy] = useState(false)

  const refresh = useCallback(() => {
    setWorkspaces(loadWorkspaces())
  }, [])

  // Register current workspace into config whenever it changes.
  useEffect(() => {
    if (!workspaceRoot) return
    upsertWorkspace({ path: workspaceRoot, name: deriveName(workspaceRoot) })
    refresh()
  }, [workspaceRoot, refresh])

  const handleSelect = useCallback(
    async (ws: SavedWorkspace) => {
      if (ws.path === workspaceRoot) return
      const api = getApi()
      if (!api?.workspace?.ensureDataRoot) return
      const r = await api.workspace.ensureDataRoot({ path: ws.path })
      if (!r.ok) return
      saveSetupState({
        ...loadSetupState(),
        workspaceRoot: ws.path,
        syncMode: r.gitInitialized ? 'git' : 'local'
      })
      upsertWorkspace({ path: ws.path, name: ws.name })
      refresh()
      await onWorkspaceRootChange(ws.path)
    },
    [workspaceRoot, onWorkspaceRootChange, refresh]
  )

  const handleAddWorkspace = useCallback(async () => {
    const api = getApi()
    if (!api?.workspace?.pickDirectory || !api.workspace.ensureDataRoot) return
    setPickBusy(true)
    try {
      const result = await api.workspace.pickDirectory()
      if (!result.ok) return
      const path = result.path
      const name = deriveName(path)
      const r = await api.workspace.ensureDataRoot({ path })
      if (!r.ok) return
      upsertWorkspace({ path, name })
      refresh()
      saveSetupState({
        ...loadSetupState(),
        workspaceRoot: path,
        syncMode: r.gitInitialized ? 'git' : 'local'
      })
      await onWorkspaceRootChange(path)
    } finally {
      setPickBusy(false)
    }
  }, [onWorkspaceRootChange, refresh])

  const handleOpenInNewWindow = useCallback(async (ws: SavedWorkspace) => {
    const api = getApi()
    void api?.multiWindow?.openWorkspaceInNewWindow(ws.path)
  }, [])

  const currentName = workspaceRoot ? deriveName(workspaceRoot) : 'Workspace'

  // Don't render if no preload API (browser dev mode).
  if (!getApi()?.workspace?.pickDirectory) return <></>

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'pointer-events-auto flex h-8 w-full items-center justify-between gap-1.5 rounded-md px-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:outline-none',
          className
        )}
        style={isMacNotelab ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties) : undefined}
        data-sidebar-interactive=""
      >
        <span className="min-w-0 truncate">{currentName}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.path}
            className="flex items-center gap-2"
            onSelect={() => void handleSelect(ws)}
          >
            <Check
              className={cn(
                'size-3.5 shrink-0',
                ws.path === workspaceRoot ? 'opacity-100' : 'opacity-0'
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{ws.name}</div>
              {ws.remoteUrl && (
                <div className="text-muted-foreground truncate text-xs">{ws.remoteUrl}</div>
              )}
            </div>
            {ws.path !== workspaceRoot && (
              <button
                className="text-muted-foreground hover:text-foreground ml-auto shrink-0 text-xs"
                title="Open in new window"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleOpenInNewWindow(ws)
                }}
              >
                ↗
              </button>
            )}
          </DropdownMenuItem>
        ))}
        {workspaces.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem
          className="flex items-center gap-2"
          onSelect={() => void handleAddWorkspace()}
          disabled={pickBusy}
        >
          <FolderPlus className="size-3.5 shrink-0" aria-hidden />
          Add workspace…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

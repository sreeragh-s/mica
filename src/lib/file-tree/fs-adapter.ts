import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { exists, rename } from "@tauri-apps/plugin-fs"
import { logInstantFeel, warnInstantFeel } from "@/lib/instant-feel-logger"

export interface DirEntryLite {
  name: string
  isDirectory: boolean
}

export type UnwatchFn = () => void | Promise<void>

type WorkspaceTreeChangedPayload = {
  workspace: string
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "")
}

export async function readWorkspaceTree(rootPath: string): Promise<string[]> {
  const startedAt = performance.now()
  const entries = await invoke<string[]>("read_workspace_tree", { workspace: rootPath })
  logInstantFeel("workspace-tree-read", {
    workspace: rootPath,
    entries: entries.length,
    durationMs: Math.round(performance.now() - startedAt),
  })
  return entries
}

export async function moveEntry(sourcePath: string, destPath: string): Promise<void> {
  if (await exists(destPath)) {
    throw new Error("A file or folder with the same name already exists in destination")
  }
  await rename(sourcePath, destPath)
}

export function watchDirectory(
  path: string,
  onChange: () => void,
  delayMs = 150
): Promise<UnwatchFn> {
  return invoke("start_workspace_tree_watcher", { workspace: path }).then(async () => {
    logInstantFeel("workspace-tree-watcher-started", { workspace: path })
    let timer: ReturnType<typeof setTimeout> | null = null
    const normalizedPath = normalizePath(path)
    const unlisten = await listen<WorkspaceTreeChangedPayload>(
      "workspace-tree-changed",
      (event) => {
        if (normalizePath(event.payload.workspace) !== normalizedPath) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          logInstantFeel("workspace-tree-changed", { workspace: path })
          onChange()
        }, delayMs)
      }
    )

    return () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      unlisten()
      void invoke("stop_workspace_tree_watcher", { workspace: path }).catch((error) => {
        console.warn("[FileTreeStore] Failed to stop workspace watcher:", error)
        warnInstantFeel("workspace-tree-watcher-stop-failed", {
          workspace: path,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }
  })
}

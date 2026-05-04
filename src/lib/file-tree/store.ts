import { moveEntry, readWorkspaceTree, watchDirectory } from "./fs-adapter"
import type { UnwatchFn } from "./fs-adapter"

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "")
}

export function toRelativePath(absolute: string, workspace: string): string {
  const abs = normalize(absolute)
  const ws = normalize(workspace)
  if (abs === ws) return ""
  if (abs.startsWith(`${ws}/`)) return abs.slice(ws.length + 1)
  return abs
}

export function toAbsolutePath(relative: string, workspace: string): string {
  const rel = relative.replace(/^\/+/, "").replace(/\/+$/, "")
  if (!rel) return normalize(workspace)
  return `${normalize(workspace)}/${rel}`
}

export class WorkspacePathStore {
  private workspace: string | null = null
  private paths: string[] = []
  private listeners = new Set<() => void>()
  private unwatch: UnwatchFn | null = null
  private watchReloadQueued = false
  private loading = false
  private version = 0

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): number => this.version
  getPaths = (): string[] => this.paths
  getWorkspace = (): string | null => this.workspace
  isLoading = (): boolean => this.loading

  async setWorkspace(workspace: string | null): Promise<void> {
    this.teardownWatcher()
    this.workspace = workspace
    this.paths = []

    if (!workspace) {
      this.loading = false
      this.bump()
      return
    }

    this.loading = true
    this.bump()

    try {
      await this.reload()
    } finally {
      this.loading = false
      this.bump()
    }

    this.startWatcher(workspace)
  }

  async reload(): Promise<void> {
    if (!this.workspace) return
    try {
      const absolutePaths = await readWorkspaceTree(this.workspace)
      const relative: string[] = []
      const ws = this.workspace
      for (const p of absolutePaths) {
        const rel = toRelativePath(p.replace(/\/+$/, ""), ws)
        if (!rel) continue
        relative.push(p.endsWith("/") ? `${rel}/` : rel)
      }
      this.paths = relative
    } catch (err) {
      console.error("[WorkspacePathStore] Failed to read workspace:", err)
      this.paths = []
    }
    this.bump()
  }

  async moveEntry(sourceRel: string, destRel: string): Promise<void> {
    if (!this.workspace) throw new Error("No workspace selected")
    const sourceAbs = toAbsolutePath(sourceRel, this.workspace)
    const destAbs = toAbsolutePath(destRel, this.workspace)
    await moveEntry(sourceAbs, destAbs)
  }

  dispose(): void {
    this.teardownWatcher()
    this.listeners.clear()
  }

  private startWatcher(workspace: string): void {
    watchDirectory(workspace, () => {
      if (this.watchReloadQueued) return
      this.watchReloadQueued = true
      queueMicrotask(() => {
        this.watchReloadQueued = false
        void this.reload()
      })
    })
      .then((fn) => {
        this.unwatch = fn
      })
      .catch((err) => {
        console.error("[WorkspacePathStore] Failed to watch workspace:", err)
      })
  }

  private teardownWatcher(): void {
    this.unwatch?.()
    this.unwatch = null
  }

  private bump(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }
}

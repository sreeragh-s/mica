/**
 * Per-workspace view state stored in the global app config at `~/.notelab/notelab.json`.
 * Separate from per-workspace config under `<workspace>/.notelab/notelab.json`.
 */

import {
  loadWorkspaceViewSnapshot as loadFromConfig,
  saveWorkspaceViewSnapshot as saveToConfig
} from './notelab-app-config'
import type { NotelabWorkspaceViewSnapshotV1 } from './notelab-config-schema'

export function defaultWorkspaceViewSnapshot(): NotelabWorkspaceViewSnapshotV1 {
  return {
    selectedNotePath: null,
    openNoteTabPaths: [],
    chatSidebarOpen: false
  }
}

function filterSnapshotToExistingNotes(
  snap: NotelabWorkspaceViewSnapshotV1,
  validPaths: Set<string>
): NotelabWorkspaceViewSnapshotV1 {
  const next = { ...snap }
  if (next.selectedNotePath && !validPaths.has(next.selectedNotePath)) {
    next.selectedNotePath = null
  }
  next.openNoteTabPaths = next.openNoteTabPaths.filter((path) => validPaths.has(path))
  if (next.openNoteTabPaths.length === 0 && next.selectedNotePath) {
    next.openNoteTabPaths = [next.selectedNotePath]
  }
  if (next.openNoteTabPaths.length > 0 && !next.selectedNotePath) {
    next.selectedNotePath = next.openNoteTabPaths[0] ?? null
  }
  return next
}

function loadWorkspaceViewSnapshot(cwd: string | null): NotelabWorkspaceViewSnapshotV1 | null {
  if (!cwd) return null
  return loadFromConfig(cwd)
}

export type WindowSessionLike = {
  workspacePath?: string
  selectedNoteId?: string | null
  openNoteTabPaths?: string[]
}

export function loadWorkspaceChatSidebarOpen(cwd: string | null): boolean {
  return loadWorkspaceViewSnapshot(cwd)?.chatSidebarOpen ?? false
}

export function persistWorkspaceChatSidebarOpen(cwd: string | null, open: boolean): void {
  if (!cwd) return
  const current = loadWorkspaceViewSnapshot(cwd) ?? defaultWorkspaceViewSnapshot()
  saveToConfig(cwd, { ...current, chatSidebarOpen: open })
}

export function schedulePersistWorkspaceViewSnapshot(cwd: string | null, snap: NotelabWorkspaceViewSnapshotV1): void {
  if (!cwd) return
  saveToConfig(cwd, snap)
}

export async function restoreWorkspaceViewAfterIndex(
  cwd: string,
  validNotePaths: Set<string>,
  windowSession: WindowSessionLike | null,
  allowInMemoryFallback: boolean,
  apply: (snap: NotelabWorkspaceViewSnapshotV1) => void
): Promise<void> {
  const stored = loadWorkspaceViewSnapshot(cwd)
  if (stored) {
    apply(filterSnapshotToExistingNotes(stored, validNotePaths))
    return
  }
  if (!allowInMemoryFallback || !windowSession) return

  const snap = defaultWorkspaceViewSnapshot()
  if (windowSession.selectedNoteId && validNotePaths.has(windowSession.selectedNoteId)) {
    snap.selectedNotePath = windowSession.selectedNoteId
  }
  if (windowSession.openNoteTabPaths?.length) {
    const tabs = windowSession.openNoteTabPaths.filter((id) => validNotePaths.has(id))
    if (tabs.length > 0) snap.openNoteTabPaths = tabs
  }
  apply(filterSnapshotToExistingNotes(snap, validNotePaths))
}

/**
 * Per-workspace view state stored in localStorage for fast async access.
 * Separate from per-workspace config under `<workspace>/.notelab/notelab.json`.
 */

import {
  loadWorkspaceViewFromLocalStorage,
  saveWorkspaceViewToLocalStorageAsync
} from './workspace-view-localstorage'
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
  return loadWorkspaceViewFromLocalStorage(cwd)
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
  saveWorkspaceViewToLocalStorageAsync(cwd, { ...current, chatSidebarOpen: open })
}

let persistTimeout: ReturnType<typeof setTimeout> | null = null
const PERSIST_DEBOUNCE_MS = 300

export function schedulePersistWorkspaceViewSnapshot(
  cwd: string | null,
  snap: NotelabWorkspaceViewSnapshotV1
): void {
  if (!cwd) return

  if (persistTimeout) {
    clearTimeout(persistTimeout)
  }
  persistTimeout = setTimeout(() => {
    persistTimeout = null
    saveWorkspaceViewToLocalStorageAsync(cwd, snap)
  }, PERSIST_DEBOUNCE_MS)
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

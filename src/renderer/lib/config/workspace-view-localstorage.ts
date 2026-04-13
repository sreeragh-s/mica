import type { NotelabWorkspaceViewSnapshotV1 } from './notelab-config-schema'

const WORKSPACE_VIEW_PREFIX = 'notelab:workspace-view:'

function getKey(cwd: string): string {
  return `${WORKSPACE_VIEW_PREFIX}${cwd}`
}

export function loadWorkspaceViewFromLocalStorage(
  cwd: string
): NotelabWorkspaceViewSnapshotV1 | null {
  try {
    const raw = localStorage.getItem(getKey(cwd))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const p = parsed as Record<string, unknown>
    return {
      selectedNotePath: typeof p.selectedNotePath === 'string' ? p.selectedNotePath : null,
      openNoteTabPaths: Array.isArray(p.openNoteTabPaths)
        ? p.openNoteTabPaths.filter((s): s is string => typeof s === 'string')
        : [],
      chatSidebarOpen: typeof p.chatSidebarOpen === 'boolean' ? p.chatSidebarOpen : false
    }
  } catch {
    return null
  }
}

function saveToLocalStorage(cwd: string, snapshot: NotelabWorkspaceViewSnapshotV1): void {
  try {
    localStorage.setItem(getKey(cwd), JSON.stringify(snapshot))
  } catch (e) {
    console.warn('[workspace-view] save to localStorage failed', e)
  }
}

export function saveWorkspaceViewToLocalStorage(
  cwd: string,
  snapshot: NotelabWorkspaceViewSnapshotV1
): void {
  saveToLocalStorage(cwd, snapshot)
}

export function saveWorkspaceViewToLocalStorageAsync(
  cwd: string,
  snapshot: NotelabWorkspaceViewSnapshotV1
): void {
  queueMicrotask(() => {
    saveToLocalStorage(cwd, snapshot)
  })
}

export function deleteWorkspaceViewFromLocalStorage(cwd: string): void {
  try {
    localStorage.removeItem(getKey(cwd))
  } catch {
    // ignore
  }
}

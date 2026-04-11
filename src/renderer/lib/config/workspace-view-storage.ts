/**
 * Per-notes-workspace UI state in `<notesWorkspace>/notelab.json` under `workspaceView`.
 * Separate from global app config under ~/.notelab (see notelab-app-config).
 */

import { getApi } from '@/lib/auth/auth-bridge'
import { DEFAULT_WORKSPACE_ID } from '@/lib/notes/notes-storage'
import type { NotelabWorkspaceViewSnapshotV1 } from './notelab-config-schema'

const DEBOUNCE_MS = 400

function isChatPanel(v: string): v is NotelabWorkspaceViewSnapshotV1['chatSidebarPanel'] {
  return v === 'chat' || v === 'links'
}
function isLinkMode(v: string): v is NotelabWorkspaceViewSnapshotV1['chatSidebarLinkMode'] {
  return v === 'linked' || v === 'linking'
}
function isAppSidebar(v: string): v is NotelabWorkspaceViewSnapshotV1['appSidebarView'] {
  return v === 'explorer' || v === 'source-control' || v === 'settings'
}
function isAppMode(v: string): v is NotelabWorkspaceViewSnapshotV1['appMode'] {
  return v === 'notes' || v === 'settings'
}
function isSettingsSection(v: string): v is NotelabWorkspaceViewSnapshotV1['settingsSection'] {
  return (
    v === 'account' ||
    v === 'workspace' ||
    v === 'github' ||
    v === 'appearance' ||
    v === 'editor' ||
    v === 'shortcuts' ||
    v === 'debug' ||
    v === 'indexing'
  )
}

export function defaultWorkspaceViewSnapshot(): NotelabWorkspaceViewSnapshotV1 {
  return {
    selectedNotePath: null,
    openNoteTabPaths: [],
    chatSidebarOpen: false,
    chatSidebarPanel: 'chat',
    chatSidebarLinkMode: 'linked',
    sidebarCollapsed: false,
    zenMode: false,
    graphViewOpen: false,
    canvasViewOpen: false,
    journalViewOpen: false,
    tabOverviewOpen: false,
    appSidebarView: 'explorer',
    appMode: 'notes',
    settingsSection: 'account',
    focusedFolderId: null,
    newNoteDestinationFolderId: DEFAULT_WORKSPACE_ID,
    workspaceSettingsFolderId: null,
  }
}

let notesWorkspaceCwd: string | null = null
/** Full JSON object written back so unknown keys are preserved. */
let fileEnvelope: Record<string, unknown> = { version: 1 }
let persistTimer: ReturnType<typeof setTimeout> | null = null

function coerceSnapshot(raw: unknown): NotelabWorkspaceViewSnapshotV1 {
  const d = defaultWorkspaceViewSnapshot()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>

  if (typeof o.selectedNotePath === 'string') d.selectedNotePath = o.selectedNotePath
  else if (o.selectedNotePath === null) d.selectedNotePath = null

  if (Array.isArray(o.openNoteTabPaths)) {
    d.openNoteTabPaths = o.openNoteTabPaths.filter((x): x is string => typeof x === 'string')
  }

  if (typeof o.chatSidebarOpen === 'boolean') d.chatSidebarOpen = o.chatSidebarOpen
  if (typeof o.chatSidebarPanel === 'string' && isChatPanel(o.chatSidebarPanel)) {
    d.chatSidebarPanel = o.chatSidebarPanel
  }
  if (typeof o.chatSidebarLinkMode === 'string' && isLinkMode(o.chatSidebarLinkMode)) {
    d.chatSidebarLinkMode = o.chatSidebarLinkMode
  }

  if (typeof o.sidebarCollapsed === 'boolean') d.sidebarCollapsed = o.sidebarCollapsed
  if (typeof o.zenMode === 'boolean') d.zenMode = o.zenMode
  if (typeof o.graphViewOpen === 'boolean') d.graphViewOpen = o.graphViewOpen
  if (typeof o.canvasViewOpen === 'boolean') d.canvasViewOpen = o.canvasViewOpen
  if (typeof o.journalViewOpen === 'boolean') d.journalViewOpen = o.journalViewOpen
  if (typeof o.tabOverviewOpen === 'boolean') d.tabOverviewOpen = o.tabOverviewOpen

  if (typeof o.appSidebarView === 'string' && isAppSidebar(o.appSidebarView)) {
    d.appSidebarView = o.appSidebarView
  }
  if (typeof o.appMode === 'string' && isAppMode(o.appMode)) {
    d.appMode = o.appMode
  }
  if (typeof o.settingsSection === 'string' && isSettingsSection(o.settingsSection)) {
    d.settingsSection = o.settingsSection
  }

  if (typeof o.focusedFolderId === 'string') d.focusedFolderId = o.focusedFolderId
  else if (o.focusedFolderId === null) d.focusedFolderId = null

  if (typeof o.newNoteDestinationFolderId === 'string') {
    d.newNoteDestinationFolderId = o.newNoteDestinationFolderId
  }

  if (typeof o.workspaceSettingsFolderId === 'string') {
    d.workspaceSettingsFolderId = o.workspaceSettingsFolderId
  } else if (o.workspaceSettingsFolderId === null) {
    d.workspaceSettingsFolderId = null
  }

  return d
}

function workspaceViewHasKeys(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && Object.keys(raw as object).length > 0
}

function filterSnapshotToExistingNotes(
  snap: NotelabWorkspaceViewSnapshotV1,
  validPaths: Set<string>
): NotelabWorkspaceViewSnapshotV1 {
  const next = { ...snap }
  if (next.selectedNotePath && !validPaths.has(next.selectedNotePath)) {
    next.selectedNotePath = null
  }
  next.openNoteTabPaths = next.openNoteTabPaths.filter((p) => validPaths.has(p))
  if (next.openNoteTabPaths.length === 0 && next.selectedNotePath) {
    next.openNoteTabPaths = [next.selectedNotePath]
  }
  if (next.openNoteTabPaths.length > 0 && !next.selectedNotePath) {
    next.selectedNotePath = next.openNoteTabPaths[0] ?? null
  }
  return next
}

export type WindowSessionLike = {
  workspacePath?: string
  selectedNoteId?: string | null
  openNoteTabPaths?: string[]
  chatSidebarOpen?: boolean
}

/**
 * Load `<cwd>/notelab.json` into memory for merge-on-write.
 */
export async function hydrateWorkspaceViewFile(cwd: string): Promise<void> {
  notesWorkspaceCwd = cwd
  fileEnvelope = { version: 1 }
  const read = getApi()?.workspace?.readAppConfig
  if (!read) return
  const r = await read({ cwd })
  if (!r.ok || !r.content?.trim()) return
  try {
    const parsed = JSON.parse(r.content) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      fileEnvelope = { ...(parsed as Record<string, unknown>) }
    }
    if (typeof fileEnvelope.version !== 'number') fileEnvelope.version = 1
  } catch {
    fileEnvelope = { version: 1 }
  }
}

async function flushWorkspaceViewToDisk(): Promise<void> {
  persistTimer = null
  const cwd = notesWorkspaceCwd
  const write = getApi()?.workspace?.writeAppConfig
  if (!cwd || !write) return
  const r = await write({ cwd, config: fileEnvelope })
  if (!r.ok) {
    console.error('[notelab] workspace view writeAppConfig failed', r.error)
  }
}

function scheduleWorkspaceViewPersist(): void {
  if (persistTimer != null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => void flushWorkspaceViewToDisk(), DEBOUNCE_MS)
}

/** Persist full snapshot; merges into the on-disk envelope for this workspace. */
export function schedulePersistWorkspaceViewSnapshot(
  snap: NotelabWorkspaceViewSnapshotV1
): void {
  if (!notesWorkspaceCwd || !getApi()?.workspace?.writeAppConfig) return
  fileEnvelope = {
    ...fileEnvelope,
    version: 1,
    workspaceView: snap,
  }
  scheduleWorkspaceViewPersist()
}

/**
 * After the note index is applied: restore from `workspaceView` when present, else optionally
 * fall back to in-memory window session (legacy).
 */
export async function restoreWorkspaceViewAfterIndex(
  cwd: string,
  validNotePaths: Set<string>,
  windowSession: WindowSessionLike | null,
  allowInMemoryFallback: boolean,
  apply: (snap: NotelabWorkspaceViewSnapshotV1) => void
): Promise<void> {
  await hydrateWorkspaceViewFile(cwd)
  const wv = fileEnvelope.workspaceView
  if (workspaceViewHasKeys(wv)) {
    const snap = filterSnapshotToExistingNotes(coerceSnapshot(wv), validNotePaths)
    apply(snap)
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
  if (windowSession.chatSidebarOpen) snap.chatSidebarOpen = true
  const merged = filterSnapshotToExistingNotes(snap, validNotePaths)
  apply(merged)
}

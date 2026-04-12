import { getApi } from '@/bridges/auth/auth-bridge'
import type {
  NotelabConfigFileV1,
  NotelabThemeConfigV1,
  NotelabSetupState,
  SavedWorkspace,
  NotelabEditorSettingsV1,
  NotelabAppearanceSettingsV1
} from './notelab-config-schema'
import { normalizeNotesStateFromStorage } from '../notes/notes-state-normalize'
import { NotesState } from '../notes/notes-types'
import { SHORTCUT_DEFINITIONS, type ShortcutBindingsMap } from './shortcuts-definitions'
import { defaultPresets } from '@/features/appearance/theme-presets'
import {
  buildThemeConfigFromPresetId,
  isNonEmptyThemeConfig,
  sanitizeThemeConfig
} from '../theme/theme-config-utils'
import { CUSTOM_THEME_PRESET_ID, DEFAULT_THEME_PRESET_ID } from '../theme/theme-preset-apply'
import { UI_FONT_IDS } from '../theme/ui-font-types'
import type { UiFontId } from '../theme/ui-font-types'

let dataRootPath: string
let config: NotelabConfigFileV1 = { version: 1 }
let persistTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 300

function defaultSetup(): NotelabSetupState {
  return { complete: false }
}

function defaultConfig(): NotelabConfigFileV1 {
  return {
    version: 1,
    setup: defaultSetup()
  }
}

function parseConfigJson(raw: string): NotelabConfigFileV1 | null {
  try {
    const p = JSON.parse(raw) as unknown
    if (typeof p !== 'object' || p === null) return null
    const o = p as Record<string, unknown>
    if (o.version !== 1) return null
    return p as NotelabConfigFileV1
  } catch {
    return null
  }
}

async function flushToDisk(): Promise<void> {
  persistTimer = null
  const api = getApi()
  if (!api?.workspace?.writeAppConfig) return
  const r = await api.workspace.writeAppConfig({
    cwd: dataRootPath,
    config: config
  })
  if (!r.ok) {
    console.error('[notelab] writeAppConfig failed', r.error)
  }
}

function schedulePersist(): void {
  if (persistTimer != null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => void flushToDisk(), DEBOUNCE_MS)
}

function setConfig(next: NotelabConfigFileV1, immediatePersist = false): void {
  config = { ...next, version: 1 }
  if (immediatePersist) {
    if (persistTimer != null) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    void flushToDisk()
  } else {
    schedulePersist()
  }
}

function normalizeThemeConfigAfterLoad(): void {
  let next: NotelabConfigFileV1 = { ...config, version: 1 }
  if (next.themeConfig) {
    const s = sanitizeThemeConfig(next.themeConfig)
    if (s) {
      next = { ...next, themeConfig: s, version: 1 }
    } else {
      const { themeConfig: _removed, ...rest } = next
      next = { ...rest, version: 1 }
    }
  }

  const pid = next.themePresetId ?? DEFAULT_THEME_PRESET_ID
  let shouldFlush = false

  /** Denormalized snapshot so notelab.config lists full light/dark tokens for presets. */
  if (pid !== CUSTOM_THEME_PRESET_ID) {
    const sc = next.themeConfig ? sanitizeThemeConfig(next.themeConfig) : undefined
    if (!isNonEmptyThemeConfig(sc)) {
      const snap = buildThemeConfigFromPresetId(pid)
      if (isNonEmptyThemeConfig(snap)) {
        next = { ...next, themeConfig: snap, version: 1 }
        shouldFlush = true
      }
    }
  }

  config = next
  if (shouldFlush) {
    void flushToDisk()
  }
}

/**
 * Load persisted settings from <workspaceRoot>/.notelab.config (Notelab)
 */
export async function hydrateAppConfig(dataRoot: string): Promise<void> {
  dataRootPath = dataRoot

  const api = getApi()
  const r = await api!.workspace!.readAppConfig!({ cwd: dataRoot })
  if (r.ok) {
    if (r.content) {
      const parsed = parseConfigJson(r.content)
      if (parsed) {
        config = { ...defaultConfig(), ...parsed, version: 1 }
        normalizeThemeConfigAfterLoad()
      } else {
        config = defaultConfig()
        await flushToDisk()
        normalizeThemeConfigAfterLoad()
      }
    } else {
      config = defaultConfig()
      await flushToDisk()
      normalizeThemeConfigAfterLoad()
    }
  } else {
    config = defaultConfig()
    await flushToDisk()
    normalizeThemeConfigAfterLoad()
  }
}

/**
 * Switch the config persistence target to a new workspace root mid-session.
 */
export async function switchDataRoot(newRoot: string): Promise<void> {
  await hydrateAppConfig(newRoot)
}

export function getSetupState(): NotelabSetupState {
  return config.setup ?? defaultSetup()
}

export function setSetupState(state: NotelabSetupState): void {
  setConfig({ ...config, version: 1, setup: { ...state } })
}

export function loadNotesState(): NotesState {
  return normalizeNotesStateFromStorage(config.notes)
}

export function saveNotesState(state: NotesState): void {
  setConfig({ ...config, version: 1, notes: state as unknown })
}

function defaultShortcutMap(): ShortcutBindingsMap {
  const m = {} as ShortcutBindingsMap
  for (const d of SHORTCUT_DEFINITIONS) {
    m[d.id] = { ...d.defaultBinding }
  }
  return m
}

export function loadShortcutBindings(): ShortcutBindingsMap {
  const raw = config.shortcuts
  if (!raw) return defaultShortcutMap()
  const base = defaultShortcutMap()
  for (const d of SHORTCUT_DEFINITIONS) {
    const b = raw[d.id]
    if (b && typeof b === 'object' && typeof b.mod === 'boolean') {
      base[d.id] = {
        mod: b.mod,
        ...(typeof b.key === 'string' ? { key: b.key } : {}),
        ...(typeof b.code === 'string' ? { code: b.code } : {})
      }
    }
  }
  return base
}

export function saveShortcutBindings(map: ShortcutBindingsMap): void {
  setConfig({
    ...config,
    version: 1,
    shortcuts: map as NotelabConfigFileV1['shortcuts']
  })
}

export function loadUiFont(): UiFontId {
  const raw = config.uiFont
  if (raw && UI_FONT_IDS.has(raw)) return raw as UiFontId
  return 'system'
}

export function saveUiFont(id: UiFontId): void {
  setConfig({ ...config, version: 1, uiFont: id })
}

const VALID_THEME_PRESET_IDS = new Set<string>([
  DEFAULT_THEME_PRESET_ID,
  CUSTOM_THEME_PRESET_ID,
  ...Object.keys(defaultPresets)
])

export function loadThemePresetId(): string {
  const raw = config.themePresetId
  if (raw && VALID_THEME_PRESET_IDS.has(raw)) return raw
  return DEFAULT_THEME_PRESET_ID
}

export function loadThemeConfig(): NotelabThemeConfigV1 | null {
  if (!config.themeConfig) return null
  const s = sanitizeThemeConfig(config.themeConfig)
  return s ?? null
}

export function saveThemeConfig(config: NotelabThemeConfigV1): void {
  const sanitized = sanitizeThemeConfig(config)
  setConfig(
    {
      ...config,
      version: 1,
      themePresetId: CUSTOM_THEME_PRESET_ID,
      themeConfig: sanitized ?? { light: {}, dark: {} }
    },
    true
  )
}

export function saveThemePresetId(id: string): void {
  const next = id && VALID_THEME_PRESET_IDS.has(id) ? id : DEFAULT_THEME_PRESET_ID
  if (next === CUSTOM_THEME_PRESET_ID) {
    setConfig({ ...config, version: 1, themePresetId: next }, true)
    return
  }
  const snapshot = buildThemeConfigFromPresetId(next)
  setConfig(
    {
      ...config,
      version: 1,
      themePresetId: next,
      themeConfig: snapshot
    },
    true
  )
}

export function loadGithubContentShas(): Record<string, string> {
  const raw = config.githubContentShas
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.length > 0) out[k] = v
  }
  return out
}

function defaultEditorSettings(): Required<NotelabEditorSettingsV1> {
  return {
    enableEmojiProperty: true,
    enableCoverProperty: true,
    newNotesStartWithFrontmatter: true,
    confirmNoteDeletion: true
  }
}

function defaultAppearanceSettings(): Required<NotelabAppearanceSettingsV1> {
  return {
    animationsEnabled: true
  }
}

export function loadEditorSettings(): Required<NotelabEditorSettingsV1> {
  const defaults = defaultEditorSettings()
  const raw = config.editorSettings
  if (!raw || typeof raw !== 'object') return defaults
  return {
    enableEmojiProperty:
      typeof raw.enableEmojiProperty === 'boolean'
        ? raw.enableEmojiProperty
        : defaults.enableEmojiProperty,
    enableCoverProperty:
      typeof raw.enableCoverProperty === 'boolean'
        ? raw.enableCoverProperty
        : defaults.enableCoverProperty,
    newNotesStartWithFrontmatter:
      typeof raw.newNotesStartWithFrontmatter === 'boolean'
        ? raw.newNotesStartWithFrontmatter
        : defaults.newNotesStartWithFrontmatter,
    confirmNoteDeletion:
      typeof raw.confirmNoteDeletion === 'boolean'
        ? raw.confirmNoteDeletion
        : defaults.confirmNoteDeletion
  }
}

export function saveEditorSettings(settings: NotelabEditorSettingsV1): void {
  setConfig({
    ...config,
    version: 1,
    editorSettings: {
      ...loadEditorSettings(),
      ...settings
    }
  })
}

export function loadAppearanceSettings(): Required<NotelabAppearanceSettingsV1> {
  const defaults = defaultAppearanceSettings()
  const raw = config.appearanceSettings
  if (!raw || typeof raw !== 'object') return defaults
  return {
    animationsEnabled:
      typeof raw.animationsEnabled === 'boolean'
        ? raw.animationsEnabled
        : defaults.animationsEnabled
  }
}

export function saveAppearanceSettings(settings: NotelabAppearanceSettingsV1): void {
  setConfig({
    ...config,
    version: 1,
    appearanceSettings: {
      ...loadAppearanceSettings(),
      ...settings
    }
  })
}

export function saveGithubContentShas(map: Record<string, string>): void {
  setConfig({ ...config, version: 1, githubContentShas: { ...map } })
}

export function loadWorkspaces(): SavedWorkspace[] {
  const raw = config.workspaces
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (w): w is SavedWorkspace =>
      typeof w === 'object' &&
      w !== null &&
      typeof w.path === 'string' &&
      typeof w.name === 'string'
  )
}

export function saveWorkspaces(workspaces: SavedWorkspace[]): void {
  setConfig({ ...config, version: 1, workspaces }, true)
}

/** Upsert a workspace entry by path. Returns the updated list. */
export function upsertWorkspace(ws: SavedWorkspace): SavedWorkspace[] {
  const existing = loadWorkspaces()
  const idx = existing.findIndex((w) => w.path === ws.path)
  const next =
    idx >= 0 ? existing.map((w, i) => (i === idx ? { ...w, ...ws } : w)) : [ws, ...existing]
  saveWorkspaces(next)
  return next
}

export function mergeGithubContentShas(patch: Record<string, string | undefined>): void {
  const cur = loadGithubContentShas()
  for (const [k, v] of Object.entries(patch)) {
    if (v) cur[k] = v
    else delete cur[k]
  }
  saveGithubContentShas(cur)
}

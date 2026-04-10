import { getApi } from "../auth/auth-bridge"
import type {
  NotelabConfigFileV1,
  NotelabThemeConfigV1,
  NotelabSetupState,
  SavedWorkspace,
  NotelabEditorSettingsV1,
  NotelabAppearanceSettingsV1,
} from "./notelab-config-schema"
import { normalizeNotesStateFromStorage } from "../notes/notes-state-normalize"
import { NotesState } from "../notes/notes-types"
import {
  SHORTCUT_DEFINITIONS,
  type ShortcutBindingsMap,
} from "./shortcuts-definitions"
import { defaultPresets } from "@/components/appearance/theme-presets"
import {
  buildThemeConfigFromPresetId,
  isNonEmptyThemeConfig,
  sanitizeThemeConfig,
} from "../theme/theme-config-utils"     
import {
  CUSTOM_THEME_PRESET_ID,
  DEFAULT_THEME_PRESET_ID,
} from "../theme/theme-preset-apply"
import { UI_FONT_IDS } from "../theme/ui-font-types"
import type { UiFontId } from "../theme/ui-font-types"

const BROWSER_CONFIG_KEY = "notelab-config-v1"

let dataRootPath: string | null = null
/** True when using <workspaceRoot>/.notelab.config (Notelab). */
let persistToFile = false
let cache: NotelabConfigFileV1 = { version: 1 }
let persistTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 300

function defaultSetup(): NotelabSetupState {
  return { complete: false }
}

function defaultCache(): NotelabConfigFileV1 {
  return {
    version: 1,
    setup: defaultSetup(),
  }
}

function parseConfigJson(raw: string): NotelabConfigFileV1 | null {
  try {
    const p = JSON.parse(raw) as unknown
    if (typeof p !== "object" || p === null) return null
    const o = p as Record<string, unknown>
    if (o.version !== 1) return null
    return p as NotelabConfigFileV1
  } catch {
    return null
  }
}

function readBrowserBlob(): NotelabConfigFileV1 | null {
  try {
    const raw = localStorage.getItem(BROWSER_CONFIG_KEY)
    if (!raw) return null
    return parseConfigJson(raw)
  } catch {
    return null
  }
}

function writeBrowserBlob(c: NotelabConfigFileV1): void {
  try {
    localStorage.setItem(BROWSER_CONFIG_KEY, JSON.stringify(c))
  } catch (e) {
    console.error("[notelab] Failed to persist config blob", e)
  }
}

async function flushToDisk(): Promise<void> {
  persistTimer = null
  if (persistToFile && dataRootPath) {
    const api = getApi()
    if (!api?.workspace?.writeAppConfig) return
    const r = await api.workspace.writeAppConfig({
      cwd: dataRootPath,
      config: cache,
    })
    if (!r.ok) {
      console.error("[notelab] writeAppConfig failed", r.error)
    }
    return
  }
  writeBrowserBlob(cache)
}

function schedulePersist(): void {
  if (persistTimer != null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => void flushToDisk(), DEBOUNCE_MS)
}

function setCache(next: NotelabConfigFileV1, immediatePersist = false): void {
  cache = { ...next, version: 1 }
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

function normalizeThemeCacheAfterLoad(): void {
  let next: NotelabConfigFileV1 = { ...cache, version: 1 }
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
    const sc = next.themeConfig
      ? sanitizeThemeConfig(next.themeConfig)
      : undefined
    if (!isNonEmptyThemeConfig(sc)) {
      const snap = buildThemeConfigFromPresetId(pid)
      if (isNonEmptyThemeConfig(snap)) {
        next = { ...next, themeConfig: snap, version: 1 }
        shouldFlush = true
      }
    }
  }

  cache = next
  if (shouldFlush) {
    void flushToDisk()
  }
}

/**
 * Load persisted settings from <workspaceRoot>/.notelab.config (Notelab)
 * or from a single localStorage blob (browser).
 */
export async function hydrateAppConfig(dataRoot: string | null): Promise<void> {
  dataRootPath = dataRoot
  persistToFile = Boolean(dataRoot && getApi()?.workspace?.readAppConfig)

  if (persistToFile && dataRoot) {
    const api = getApi()
    const r = await api!.workspace!.readAppConfig!({ cwd: dataRoot })
    if (r.ok) {
      if (r.content) {
        const parsed = parseConfigJson(r.content)
        if (parsed) {
          cache = { ...defaultCache(), ...parsed, version: 1 }
          normalizeThemeCacheAfterLoad()
        } else {
          cache = defaultCache()
          await flushToDisk()
          normalizeThemeCacheAfterLoad()
        }
      } else {
        const browser = readBrowserBlob()
        cache = { ...defaultCache(), ...(browser ?? {}), version: 1 }
        await flushToDisk()
        normalizeThemeCacheAfterLoad()
      }
    } else {
      const browser = readBrowserBlob()
      cache = { ...defaultCache(), ...(browser ?? {}), version: 1 }
      await flushToDisk()
      normalizeThemeCacheAfterLoad()
    }
    return
  }

  const blob = readBrowserBlob()
  if (blob) {
    cache = { ...defaultCache(), ...blob, version: 1 }
    normalizeThemeCacheAfterLoad()
    return
  }
  cache = defaultCache()
  writeBrowserBlob(cache)
  normalizeThemeCacheAfterLoad()
}

/**
 * Switch the config persistence target to a new workspace root mid-session.
 * Loads the config from the new root (or migrates from browser blob).
 */
export async function switchDataRoot(newRoot: string): Promise<void> {
  await hydrateAppConfig(newRoot)
}

export function getSetupState(): NotelabSetupState {
  return cache.setup ?? defaultSetup()
}

export function setSetupState(state: NotelabSetupState): void {
  setCache({ ...cache, version: 1, setup: { ...state } })
}

export function loadNotesState(): NotesState {
  return normalizeNotesStateFromStorage(cache.notes)
}

export function saveNotesState(state: NotesState): void {
  setCache({ ...cache, version: 1, notes: state as unknown })
}

function defaultShortcutMap(): ShortcutBindingsMap {
  const m = {} as ShortcutBindingsMap
  for (const d of SHORTCUT_DEFINITIONS) {
    m[d.id] = { ...d.defaultBinding }
  }
  return m
}

export function loadShortcutBindings(): ShortcutBindingsMap {
  const raw = cache.shortcuts
  if (!raw) return defaultShortcutMap()
  const base = defaultShortcutMap()
  for (const d of SHORTCUT_DEFINITIONS) {
    const b = raw[d.id]
    if (b && typeof b === "object" && typeof b.mod === "boolean") {
      base[d.id] = {
        mod: b.mod,
        ...(typeof b.key === "string" ? { key: b.key } : {}),
        ...(typeof b.code === "string" ? { code: b.code } : {}),
      }
    }
  }
  return base
}

export function saveShortcutBindings(map: ShortcutBindingsMap): void {
  setCache({
    ...cache,
    version: 1,
    shortcuts: map as NotelabConfigFileV1["shortcuts"],
  })
}

export function loadUiFont(): UiFontId {
  const raw = cache.uiFont
  if (raw && UI_FONT_IDS.has(raw)) return raw as UiFontId
  return "system"
}

export function saveUiFont(id: UiFontId): void {
  setCache({ ...cache, version: 1, uiFont: id })
}

const VALID_THEME_PRESET_IDS = new Set<string>([
  DEFAULT_THEME_PRESET_ID,
  CUSTOM_THEME_PRESET_ID,
  ...Object.keys(defaultPresets),
])

export function loadThemePresetId(): string {
  const raw = cache.themePresetId
  if (raw && VALID_THEME_PRESET_IDS.has(raw)) return raw
  return DEFAULT_THEME_PRESET_ID
}

export function loadThemeConfig(): NotelabThemeConfigV1 | null {
  if (!cache.themeConfig) return null
  const s = sanitizeThemeConfig(cache.themeConfig)
  return s ?? null
}

export function saveThemeConfig(config: NotelabThemeConfigV1): void {
  const sanitized = sanitizeThemeConfig(config)
  setCache(
    {
      ...cache,
      version: 1,
      themePresetId: CUSTOM_THEME_PRESET_ID,
      themeConfig: sanitized ?? { light: {}, dark: {} },
    },
    true
  )
}

export function saveThemePresetId(id: string): void {
  const next =
    id && VALID_THEME_PRESET_IDS.has(id) ? id : DEFAULT_THEME_PRESET_ID
  if (next === CUSTOM_THEME_PRESET_ID) {
    setCache({ ...cache, version: 1, themePresetId: next }, true)
    return
  }
  const snapshot = buildThemeConfigFromPresetId(next)
  setCache(
    {
      ...cache,
      version: 1,
      themePresetId: next,
      themeConfig: snapshot,
    },
    true
  )
}

export function loadGithubContentShas(): Record<string, string> {
  const raw = cache.githubContentShas
  if (!raw || typeof raw !== "object") return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.length > 0) out[k] = v
  }
  return out
}

function defaultEditorSettings(): Required<NotelabEditorSettingsV1> {
  return {
    enableEmojiProperty: true,
    enableCoverProperty: true,
    newNotesStartWithFrontmatter: true,
    openLinksInInternalBrowser: false,
  }
}

function defaultAppearanceSettings(): Required<NotelabAppearanceSettingsV1> {
  return {
    animationsEnabled: true,
  }
}

export function loadEditorSettings(): Required<NotelabEditorSettingsV1> {
  const defaults = defaultEditorSettings()
  const raw = cache.editorSettings
  if (!raw || typeof raw !== "object") return defaults
  return {
    enableEmojiProperty:
      typeof raw.enableEmojiProperty === "boolean"
        ? raw.enableEmojiProperty
        : defaults.enableEmojiProperty,
    enableCoverProperty:
      typeof raw.enableCoverProperty === "boolean"
        ? raw.enableCoverProperty
        : defaults.enableCoverProperty,
    newNotesStartWithFrontmatter:
      typeof raw.newNotesStartWithFrontmatter === "boolean"
        ? raw.newNotesStartWithFrontmatter
        : defaults.newNotesStartWithFrontmatter,
    openLinksInInternalBrowser:
      typeof raw.openLinksInInternalBrowser === "boolean"
        ? raw.openLinksInInternalBrowser
        : defaults.openLinksInInternalBrowser,
  }
}

export function saveEditorSettings(settings: NotelabEditorSettingsV1): void {
  setCache({
    ...cache,
    version: 1,
    editorSettings: {
      ...loadEditorSettings(),
      ...settings,
    },
  })
}

export function loadAppearanceSettings(): Required<NotelabAppearanceSettingsV1> {
  const defaults = defaultAppearanceSettings()
  const raw = cache.appearanceSettings
  if (!raw || typeof raw !== "object") return defaults
  return {
    animationsEnabled:
      typeof raw.animationsEnabled === "boolean"
        ? raw.animationsEnabled
        : defaults.animationsEnabled,
  }
}

export function saveAppearanceSettings(
  settings: NotelabAppearanceSettingsV1
): void {
  setCache({
    ...cache,
    version: 1,
    appearanceSettings: {
      ...loadAppearanceSettings(),
      ...settings,
    },
  })
}

export function saveGithubContentShas(map: Record<string, string>): void {
  setCache({ ...cache, version: 1, githubContentShas: { ...map } })
}

export function loadWorkspaces(): SavedWorkspace[] {
  const raw = cache.workspaces
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (w): w is SavedWorkspace =>
      typeof w === 'object' && w !== null && typeof w.path === 'string' && typeof w.name === 'string'
  )
}

export function saveWorkspaces(workspaces: SavedWorkspace[]): void {
  setCache({ ...cache, version: 1, workspaces }, true)
}

/** Upsert a workspace entry by path. Returns the updated list. */
export function upsertWorkspace(ws: SavedWorkspace): SavedWorkspace[] {
  const existing = loadWorkspaces()
  const idx = existing.findIndex((w) => w.path === ws.path)
  const next = idx >= 0
    ? existing.map((w, i) => (i === idx ? { ...w, ...ws } : w))
    : [ws, ...existing]
  saveWorkspaces(next)
  return next
}

export function mergeGithubContentShas(
  patch: Record<string, string | undefined>
): void {
  const cur = loadGithubContentShas()
  for (const [k, v] of Object.entries(patch)) {
    if (v) cur[k] = v
    else delete cur[k]
  }
  saveGithubContentShas(cur)
}

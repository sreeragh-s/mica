import { getApi } from "./auth-bridge"
import type {
  GitnotesConfigFileV1,
  GitnotesThemeConfigV1,
  GitNotesSetupState,
} from "./gitnotes-config-schema"
import { normalizeNotesStateFromStorage } from "./notes-state-normalize"
import type { NotesState } from "./notes-types"
import {
  SHORTCUT_DEFINITIONS,
  type ShortcutBindingsMap,
} from "./shortcuts-definitions"
import { defaultPresets } from "@/components/appearance/theme-presets"
import {
  buildThemeConfigFromPresetId,
  isNonEmptyThemeConfig,
  sanitizeThemeConfig,
} from "./theme-config-utils"
import {
  CUSTOM_THEME_PRESET_ID,
  DEFAULT_THEME_PRESET_ID,
} from "./theme-preset-apply"
import { UI_FONT_IDS } from "./ui-font-types"
import type { UiFontId } from "./ui-font-types"

const BROWSER_CONFIG_KEY = "gitnotes-config-v1"

const LEGACY_KEYS = [
  "gitnotes-setup",
  "gitnotes-notes",
  "gitnotes-shortcuts-v1",
  "gitnotes-ui-font-v1",
  "gitnotes-github-content-shas",
] as const

let dataRootPath: string | null = null
/** True when using ~/.gitnotes/gitnotes.config (Electron). */
let persistToFile = false
let cache: GitnotesConfigFileV1 = { version: 1 }
let persistTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 300

function defaultSetup(): GitNotesSetupState {
  return { complete: false }
}

function defaultCache(): GitnotesConfigFileV1 {
  return {
    version: 1,
    setup: defaultSetup(),
  }
}

function parseConfigJson(raw: string): GitnotesConfigFileV1 | null {
  try {
    const p = JSON.parse(raw) as unknown
    if (typeof p !== "object" || p === null) return null
    const o = p as Record<string, unknown>
    if (o.version !== 1) return null
    return p as GitnotesConfigFileV1
  } catch {
    return null
  }
}

function readLegacyLocalStorage(): Partial<GitnotesConfigFileV1> {
  const out: Partial<GitnotesConfigFileV1> = {}
  try {
    const setupRaw = localStorage.getItem("gitnotes-setup")
    if (setupRaw) {
      const parsed = JSON.parse(setupRaw) as unknown
      if (typeof parsed === "object" && parsed !== null) {
        const o = parsed as Record<string, unknown>
        out.setup = {
          complete: o.complete === true,
          ...(typeof o.syncMode === "string" &&
          (o.syncMode === "git" ||
            o.syncMode === "github_api" ||
            o.syncMode === "local")
            ? { syncMode: o.syncMode }
            : {}),
          ...(typeof o.githubRepoFullName === "string" && o.githubRepoFullName.trim()
            ? { githubRepoFullName: o.githubRepoFullName.trim() }
            : {}),
          ...(typeof o.lastRemoteCommitSha === "string" && o.lastRemoteCommitSha.trim()
            ? { lastRemoteCommitSha: o.lastRemoteCommitSha.trim() }
            : {}),
        }
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const notesRaw = localStorage.getItem("gitnotes-notes")
    if (notesRaw) {
      out.notes = JSON.parse(notesRaw) as unknown
    }
  } catch {
    /* ignore */
  }
  try {
    const scRaw = localStorage.getItem("gitnotes-shortcuts-v1")
    if (scRaw) {
      const parsed = JSON.parse(scRaw) as Record<string, unknown>
      out.shortcuts = parsed as GitnotesConfigFileV1["shortcuts"]
    }
  } catch {
    /* ignore */
  }
  try {
    const fontRaw = localStorage.getItem("gitnotes-ui-font-v1")
    if (fontRaw && UI_FONT_IDS.has(fontRaw)) {
      out.uiFont = fontRaw
    }
  } catch {
    /* ignore */
  }
  try {
    const shasRaw = localStorage.getItem("gitnotes-github-content-shas")
    if (shasRaw) {
      const p = JSON.parse(shasRaw) as unknown
      if (typeof p === "object" && p !== null) {
        const m: Record<string, string> = {}
        for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
          if (typeof v === "string" && v.length > 0) m[k] = v
        }
        out.githubContentShas = m
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

function clearLegacyLocalStorageKeys(): void {
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
}

function readBrowserBlob(): GitnotesConfigFileV1 | null {
  try {
    const raw = localStorage.getItem(BROWSER_CONFIG_KEY)
    if (!raw) return null
    return parseConfigJson(raw)
  } catch {
    return null
  }
}

function writeBrowserBlob(c: GitnotesConfigFileV1): void {
  try {
    localStorage.setItem(BROWSER_CONFIG_KEY, JSON.stringify(c))
  } catch (e) {
    console.error("[gitnotes] Failed to persist config blob", e)
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
      console.error("[gitnotes] writeAppConfig failed", r.error)
    }
    return
  }
  writeBrowserBlob(cache)
}

function schedulePersist(): void {
  if (persistTimer != null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => void flushToDisk(), DEBOUNCE_MS)
}

function setCache(next: GitnotesConfigFileV1, immediatePersist = false): void {
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
  let next: GitnotesConfigFileV1 = { ...cache, version: 1 }
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

  /** Denormalized snapshot so gitnotes.config always lists full light/dark tokens for presets. */
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
 * Load persisted settings from ~/.gitnotes/gitnotes.config (Electron)
 * or from a single localStorage blob (browser). Migrates legacy keys once.
 * Call after ensureDataRoot in Electron; pass data root path or null in browser.
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
          cache = {
            ...defaultCache(),
            ...readLegacyLocalStorage(),
            version: 1,
          }
          await flushToDisk()
          clearLegacyLocalStorageKeys()
          normalizeThemeCacheAfterLoad()
        }
      } else {
        const legacy = readLegacyLocalStorage()
        const browser = readBrowserBlob()
        cache = {
          ...defaultCache(),
          ...legacy,
          ...(browser ?? {}),
          version: 1,
        }
        await flushToDisk()
        clearLegacyLocalStorageKeys()
        try {
          localStorage.removeItem(BROWSER_CONFIG_KEY)
        } catch {
          /* ignore */
        }
        normalizeThemeCacheAfterLoad()
      }
    } else {
      const browser = readBrowserBlob()
      cache = {
        ...defaultCache(),
        ...readLegacyLocalStorage(),
        ...(browser ?? {}),
        version: 1,
      }
      await flushToDisk()
      clearLegacyLocalStorageKeys()
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
  const legacy = readLegacyLocalStorage()
  cache = { ...defaultCache(), ...legacy, version: 1 }
  writeBrowserBlob(cache)
  clearLegacyLocalStorageKeys()
  normalizeThemeCacheAfterLoad()
}

export function getSetupState(): GitNotesSetupState {
  return cache.setup ?? defaultSetup()
}

export function setSetupState(state: GitNotesSetupState): void {
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
    shortcuts: map as GitnotesConfigFileV1["shortcuts"],
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

export function loadThemeConfig(): GitnotesThemeConfigV1 | null {
  if (!cache.themeConfig) return null
  const s = sanitizeThemeConfig(cache.themeConfig)
  return s ?? null
}

export function saveThemeConfig(config: GitnotesThemeConfigV1): void {
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
  /** Persist a full token snapshot alongside the preset id (readable in gitnotes.config). */
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

export function saveGithubContentShas(map: Record<string, string>): void {
  setCache({ ...cache, version: 1, githubContentShas: { ...map } })
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

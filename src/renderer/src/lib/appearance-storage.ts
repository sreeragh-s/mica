import type { GitnotesThemeConfigV1 } from "./gitnotes-config-schema"
import {
  loadThemeConfig as loadThemeConfigFromDisk,
  loadThemePresetId as loadThemePresetFromConfig,
  loadUiFont as loadFromConfig,
  saveThemeConfig as persistThemeConfig,
  saveThemePresetId as persistThemePresetId,
  saveUiFont as saveToConfig,
} from "./gitnotes-app-config"
import { notifyThemePresetChanged } from "./theme-preset-apply"
import type { UiFontId } from "./ui-font-types"
export type { UiFontId } from "./ui-font-types"
export { UI_FONT_OPTIONS } from "./ui-font-types"

export function loadUiFont(): UiFontId {
  return loadFromConfig()
}

export function saveUiFont(id: UiFontId): void {
  saveToConfig(id)
}

/** Call on startup and whenever the user picks a font. */
export function applyUiFontToDocument(id: UiFontId): void {
  document.documentElement.dataset.font = id
}

export function loadThemePresetId(): string {
  return loadThemePresetFromConfig()
}

export function saveThemePresetId(id: string): void {
  persistThemePresetId(id)
  notifyThemePresetChanged()
}

export function loadThemeConfig(): GitnotesThemeConfigV1 | null {
  return loadThemeConfigFromDisk()
}

export function saveThemeConfig(config: GitnotesThemeConfigV1): void {
  persistThemeConfig(config)
  notifyThemePresetChanged()
}

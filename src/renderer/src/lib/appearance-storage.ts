import {
  loadUiFont as loadFromConfig,
  saveUiFont as saveToConfig,
} from "./gitnotes-app-config"
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

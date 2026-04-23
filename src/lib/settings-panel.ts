export type SettingsPanelId = "account" | "workspace" | "wiki" | "shortcuts" | "theme" | "models"

export const DEFAULT_SETTINGS_PANEL: SettingsPanelId = "account"

export const OPEN_SETTINGS_PANEL_EVENT = "open-settings-panel"

export function openSettingsPanel(panel: SettingsPanelId) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_PANEL_EVENT, { detail: { panel } }))
}

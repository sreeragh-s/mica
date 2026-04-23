"use client"

import * as React from "react"

import {
  applyThemePreset,
  getStoredThemePresetId,
  THEME_PRESET_CHANGE_EVENT,
  THEME_PRESET_STORAGE_KEY,
} from "@/lib/theme-presets"

export function ThemePresetSync() {
  React.useEffect(() => {
    const syncThemePreset = () => {
      applyThemePreset(getStoredThemePresetId())
    }

    syncThemePreset()

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_PRESET_STORAGE_KEY) {
        syncThemePreset()
      }
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(THEME_PRESET_CHANGE_EVENT, syncThemePreset)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(THEME_PRESET_CHANGE_EVENT, syncThemePreset)
    }
  }, [])

  return null
}

import { useEffect } from "react"

import { useTheme } from "next-themes"

import {
  loadThemeConfig,
  loadThemePresetId,
} from "@/lib/theme/appearance-storage"
import {
  applyThemeToDocument,
  THEME_PRESET_CHANGED_EVENT,
} from "@/lib/theme/theme-preset-apply"

/**
 * Keeps CSS variables on `document.documentElement` in sync with the selected
 * built-in preset and the current light/dark appearance from `next-themes`.
 */
export function ThemePresetRuntime(): null {
  const { resolvedTheme } = useTheme()
  const mode = resolvedTheme === "dark" ? "dark" : "light"

  useEffect(() => {
    applyThemeToDocument(loadThemePresetId(), mode, loadThemeConfig())
  }, [mode])

  useEffect(() => {
    const onChange = (): void => {
      applyThemeToDocument(loadThemePresetId(), mode, loadThemeConfig())
    }
    window.addEventListener(THEME_PRESET_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(THEME_PRESET_CHANGED_EVENT, onChange)
  }, [mode])

  return null
}

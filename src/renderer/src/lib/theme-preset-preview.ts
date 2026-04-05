import { defaultPresets } from "@/components/appearance/theme-presets"
import type { ThemeStyleProps } from "@/components/appearance/theme-presets"
import type { NotelabThemeConfigV1 } from "@/lib/notelab-config-schema"
import {
  CUSTOM_THEME_PRESET_ID,
  DEFAULT_THEME_PRESET_ID,
} from "@/lib/theme-preset-apply"

function firstColor(
  light: Partial<ThemeStyleProps>,
  keys: (keyof ThemeStyleProps)[]
): string {
  for (const k of keys) {
    const v = light[k]
    if (typeof v === "string" && v.trim().length > 0) return v.trim()
  }
  return "#94a3b8"
}

/** Four swatch colors for UI: primary, secondary, accent, background (light palette). */
export function getThemePresetSwatchColors(
  presetId: string
): readonly [string, string, string, string] {
  if (presetId === DEFAULT_THEME_PRESET_ID) {
    return ["#ffffff", "#252525", "#f4f4f5", "#d4d4d8"]
  }
  if (presetId === CUSTOM_THEME_PRESET_ID) {
    return ["#94a3b8", "#64748b", "#475569", "#334155"]
  }
  const preset = defaultPresets[presetId]
  if (!preset) {
    return ["#94a3b8", "#64748b", "#475569", "#334155"]
  }
  const light = preset.styles.light
  return [
    firstColor(light, ["primary", "ring", "sidebar-primary"]),
    firstColor(light, ["secondary", "muted", "border", "input"]),
    firstColor(light, ["accent", "sidebar-accent"]),
    firstColor(light, ["background", "card", "popover", "sidebar"]),
  ]
}

/** Swatches for the palette row; prefers persisted `themeConfig.light` when present. */
export function getThemeSwatchColors(
  presetId: string,
  themeConfig?: NotelabThemeConfigV1 | null
): readonly [string, string, string, string] {
  /** Default palette does not apply a preset snapshot to the document (stylesheet tokens only).
   *  Config may still store a seeded snapshot for editing — ignore it so swatches match the UI. */
  if (presetId === DEFAULT_THEME_PRESET_ID) {
    return getThemePresetSwatchColors(DEFAULT_THEME_PRESET_ID)
  }
  const light = themeConfig?.light
  if (light && Object.keys(light).length > 0) {
    return [
      firstColor(light, ["primary", "ring", "sidebar-primary"]),
      firstColor(light, ["secondary", "muted", "border", "input"]),
      firstColor(light, ["accent", "sidebar-accent"]),
      firstColor(light, ["background", "card", "popover", "sidebar"]),
    ]
  }
  return getThemePresetSwatchColors(presetId)
}

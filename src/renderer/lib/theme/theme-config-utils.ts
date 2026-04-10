import { defaultPresets } from "@/features/appearance/theme-presets"
import type { ThemeStyleProps } from "@/features/appearance/theme-presets"
import type { NotelabThemeConfigV1 } from "@/lib/config/notelab-config-schema"
import {
  CUSTOM_THEME_PRESET_ID,
  DEFAULT_THEME_PRESET_ID,
  THEME_STYLE_VAR_KEYS,
} from "@/lib/theme/theme-preset-apply"

function sanitizePartial(
  raw: Record<string, unknown> | undefined
): Partial<ThemeStyleProps> {
  if (!raw || typeof raw !== "object") return {}
  const out: Partial<ThemeStyleProps> = {}
  for (const k of THEME_STYLE_VAR_KEYS) {
    const v = raw[k]
    if (typeof v === "string" && v.trim().length > 0) {
      ;(out as Record<string, string>)[k] = v.trim()
    }
  }
  return out
}

export function sanitizeThemeConfig(
  raw: unknown
): NotelabThemeConfigV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const o = raw as Record<string, unknown>
  const light = sanitizePartial(o.light as Record<string, unknown>)
  const dark = sanitizePartial(o.dark as Record<string, unknown>)
  if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) {
    return undefined
  }
  return { light, dark }
}

export function isNonEmptyThemeConfig(
  c: NotelabThemeConfigV1 | undefined | null
): boolean {
  if (!c) return false
  return (
    Object.keys(c.light).length > 0 || Object.keys(c.dark).length > 0
  )
}

export function countThemeConfigKeys(
  c: NotelabThemeConfigV1 | undefined | null
): { light: number; dark: number } {
  if (!c) return { light: 0, dark: 0 }
  return {
    light: Object.keys(c.light).length,
    dark: Object.keys(c.dark).length,
  }
}

/** Seed a full custom config from a built-in preset (or a neutral template for default). */
export function buildThemeConfigFromPresetId(presetId: string): NotelabThemeConfigV1 {
  if (
    presetId === DEFAULT_THEME_PRESET_ID ||
    presetId === CUSTOM_THEME_PRESET_ID
  ) {
    const fallback = defaultPresets["modern-minimal"]
    return {
      light: { ...fallback.styles.light },
      dark: { ...fallback.styles.dark },
    }
  }
  const p = defaultPresets[presetId]
  if (!p) {
    const fallback = defaultPresets["modern-minimal"]
    return {
      light: { ...fallback.styles.light },
      dark: { ...fallback.styles.dark },
    }
  }
  return {
    light: { ...p.styles.light },
    dark: { ...p.styles.dark },
  }
}

export function humanizeThemeTokenKey(key: string): string {
  return key
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

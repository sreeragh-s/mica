import { defaultPresets } from '@/features/appearance/theme-presets'
import type { NotelabThemeConfigV1 } from '@/lib/config/notelab-config-schema'

/** Dispatched after theme preset or theme config changes. */
export const THEME_PRESET_CHANGED_EVENT = 'notelab-theme-preset-changed'

export const DEFAULT_THEME_PRESET_ID = 'default' as const
export const CUSTOM_THEME_PRESET_ID = 'custom' as const

/** Every CSS custom property presets and custom config may set. */
export const THEME_STYLE_VAR_KEYS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'radius',
  'shadow-color',
  'shadow-opacity',
  'shadow-blur',
  'shadow-spread',
  'shadow-offset-x',
  'shadow-offset-y',
  'letter-spacing',
  'spacing'
] as const

export function clearThemePresetInlineVars(): void {
  const el = document.documentElement
  for (const key of THEME_STYLE_VAR_KEYS) {
    el.style.removeProperty(`--${key}`)
  }
}

/** Resolve light/dark before `next-themes` has finished (e.g. right after config hydrate). */
export function getResolvedAppearanceMode(): 'light' | 'dark' {
  if (document.documentElement.classList.contains('dark')) return 'dark'
  if (document.documentElement.classList.contains('light')) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyStylePartial(styles: Record<string, string | undefined> | undefined): void {
  const el = document.documentElement
  if (!styles) return
  for (const [key, value] of Object.entries(styles)) {
    if (value === undefined || value === null) continue
    el.style.setProperty(`--${key}`, String(value))
  }
}

/**
 * Applies the active palette: built-in preset, default (stylesheet), or full custom `themeConfig`.
 */
export function applyThemeToDocument(
  presetId: string,
  mode: 'light' | 'dark',
  themeConfig: NotelabThemeConfigV1 | null | undefined
): void {
  const el = document.documentElement
  clearThemePresetInlineVars()

  if (presetId === CUSTOM_THEME_PRESET_ID) {
    el.dataset.themePreset = 'custom'
    applyStylePartial(themeConfig?.[mode] as Record<string, string> | undefined)
    return
  }

  el.dataset.themePreset = presetId === DEFAULT_THEME_PRESET_ID ? '' : presetId

  if (presetId === DEFAULT_THEME_PRESET_ID || !defaultPresets[presetId]) {
    return
  }

  const styles = defaultPresets[presetId].styles[mode]
  for (const [key, value] of Object.entries(styles)) {
    if (value === undefined || value === null) continue
    el.style.setProperty(`--${key}`, String(value))
  }
}

/** @deprecated Use {@link applyThemeToDocument} with theme config. */
export function applyThemePresetToDocument(presetId: string, mode: 'light' | 'dark'): void {
  applyThemeToDocument(presetId, mode, undefined)
}

export function notifyThemePresetChanged(): void {
  window.dispatchEvent(new CustomEvent(THEME_PRESET_CHANGED_EVENT))
}

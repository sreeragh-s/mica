import { defaultPresets } from "@/lib/constants/themes"

export const DEFAULT_THEME_PRESET_ID = "app-default"
export const THEME_PRESET_STORAGE_KEY = "theme-preset"
export const THEME_PRESET_STYLE_ID = "theme-preset-overrides"
export const THEME_PRESET_CHANGE_EVENT = "theme-preset-change"

type ThemePresetStyles = Record<string, string>

type ThemePresetDefinition = {
  label?: string
  styles?: {
    light?: ThemePresetStyles
    dark?: ThemePresetStyles
  }
}

const NON_COLOR_THEME_TOKENS = new Set([
  "radius",
  "spacing",
  "letter-spacing",
  "font-sans",
  "font-serif",
  "font-mono",
  "shadow-color",
  "shadow-opacity",
  "shadow-blur",
  "shadow-spread",
  "shadow-offset-x",
  "shadow-offset-y",
])

export type ThemePresetOption = {
  id: string
  label: string
  description: string
  previewColor?: string
}

const presetEntries = Object.entries(defaultPresets as Record<string, ThemePresetDefinition>)

export const themePresetOptions: ThemePresetOption[] = [
  {
    id: DEFAULT_THEME_PRESET_ID,
    label: "Default",
    description: "Use the base colors defined in App.css.",
  },
  ...presetEntries.map(([id, preset]) => ({
    id,
    label: preset.label ?? id,
    description: `Use the ${preset.label ?? id} preset from themes.ts.`,
    previewColor: preset.styles?.light?.primary ?? preset.styles?.dark?.primary,
  })),
]

function isThemePresetOption(value: string | null): value is string {
  return !!value && themePresetOptions.some((option) => option.id === value)
}

export function getStoredThemePresetId() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_PRESET_ID
  }

  const storedValue = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)
  return isThemePresetOption(storedValue) ? storedValue : DEFAULT_THEME_PRESET_ID
}

function toCssVariables(styles: ThemePresetStyles | undefined) {
  if (!styles) {
    return ""
  }

  return Object.entries(styles)
    .filter(
      ([token, value]) =>
        !NON_COLOR_THEME_TOKENS.has(token) && value != null && value !== "",
    )
    .map(([token, value]) => `  --${token}: ${value};`)
    .join("\n")
}

function buildThemePresetCss(themePresetId: string) {
  if (themePresetId === DEFAULT_THEME_PRESET_ID) {
    return ""
  }

  const preset = (defaultPresets as Record<string, ThemePresetDefinition>)[themePresetId]

  if (!preset?.styles) {
    return ""
  }

  const lightBlock = toCssVariables(preset.styles.light)
  const darkBlock = toCssVariables(preset.styles.dark)

  return [lightBlock && `:root {\n${lightBlock}\n}`, darkBlock && `.dark {\n${darkBlock}\n}`]
    .filter(Boolean)
    .join("\n\n")
}

function getThemePresetStyleElement() {
  if (typeof document === "undefined") {
    return null
  }

  let styleElement = document.getElementById(THEME_PRESET_STYLE_ID) as HTMLStyleElement | null

  if (!styleElement) {
    styleElement = document.createElement("style")
    styleElement.id = THEME_PRESET_STYLE_ID
    document.head.appendChild(styleElement)
  }

  return styleElement
}

export function applyThemePreset(themePresetId: string) {
  if (typeof document === "undefined") {
    return
  }

  const styleElement = getThemePresetStyleElement()

  if (!styleElement) {
    return
  }

  styleElement.textContent = buildThemePresetCss(themePresetId)
}

export function persistThemePreset(themePresetId: string) {
  if (typeof window === "undefined") {
    return
  }

  const nextValue = isThemePresetOption(themePresetId)
    ? themePresetId
    : DEFAULT_THEME_PRESET_ID

  if (nextValue === DEFAULT_THEME_PRESET_ID) {
    window.localStorage.removeItem(THEME_PRESET_STORAGE_KEY)
  } else {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, nextValue)
  }

  applyThemePreset(nextValue)
  window.dispatchEvent(new CustomEvent(THEME_PRESET_CHANGE_EVENT, { detail: nextValue }))
}

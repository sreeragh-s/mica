import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react'

import { Monitor, Moon, PenLine, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { ThemeConfigEditorPanel } from '@/components/appearance/ThemeConfigEditorPanel'
import { defaultPresets } from '@/components/appearance/theme-presets'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  UI_FONT_OPTIONS,
  applyUiFontToDocument,
  loadThemeConfig,
  loadThemePresetId,
  loadUiFont,
  saveThemeConfig,
  saveThemePresetId,
  saveUiFont,
  type UiFontId
} from '@/lib/theme/appearance-storage'
import { buildThemeConfigFromPresetId } from '@/lib/theme/theme-config-utils'
import { getThemeSwatchColors } from '@/lib/theme/theme-preset-preview'
import {
  CUSTOM_THEME_PRESET_ID,
  DEFAULT_THEME_PRESET_ID,
} from '@/lib/theme/theme-preset-apply'
import type { NotelabThemeConfigV1 } from '@/lib/config/notelab-config-schema'
import type { NotelabAppearanceSettingsV1 } from '@/lib/config/notelab-config-schema'
import type { MacTitlebarStyles } from '@/components/notes/notes-app-types'

function ThemeSwatchStrip({
  colors
}: {
  colors: readonly [string, string, string, string]
}): JSX.Element {
  return (
    <span
      className="flex shrink-0 gap-1"
      aria-hidden
    >
      {colors.map((c, i) => (
        <span
          key={i}
          className="border-border/70 size-4 shrink-0 rounded-md border shadow-sm"
          style={{ backgroundColor: c }}
        />
      ))}
    </span>
  )
}

const THEME_PRESET_SELECT_OPTIONS = [
  { id: DEFAULT_THEME_PRESET_ID, label: 'Default' },
  ...Object.entries(defaultPresets).map(([id, p]) => ({
    id,
    label: p.label ?? id,
  })),
  { id: CUSTOM_THEME_PRESET_ID, label: 'Custom' },
] as const

export type AppearanceSettingsViewProps = {
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  settings: Required<NotelabAppearanceSettingsV1>
  onChange: (patch: Partial<NotelabAppearanceSettingsV1>) => void
}

type ToggleRowProps = {
  label: string
  description: string
  value: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({ label, description, value, onChange }: ToggleRowProps): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>
      </div>
      <Button
        type="button"
        variant={value ? 'default' : 'outline'}
        size="sm"
        onClick={() => onChange(!value)}
      >
        {value ? 'On' : 'Off'}
      </Button>
    </div>
  )
}

export function AppearanceSettingsView({
  isMacNotelab,
  macTitlebarStyles,
  settings,
  onChange
}: AppearanceSettingsViewProps): JSX.Element {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [font, setFont] = useState<UiFontId>(() => loadUiFont())

  const appearanceInit = useMemo(() => {
    const preset = loadThemePresetId()
    return {
      preset,
      config: loadThemeConfig(),
      lastBuiltIn:
        preset !== CUSTOM_THEME_PRESET_ID ? preset : DEFAULT_THEME_PRESET_ID,
    }
  }, [])

  const [themePresetId, setThemePresetId] = useState(appearanceInit.preset)
  const [themeConfig, setThemeConfig] = useState<NotelabThemeConfigV1 | null>(
    appearanceInit.config
  )

  const lastBuiltInPresetRef = useRef(appearanceInit.lastBuiltIn)

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [themePanelOpen, setThemePanelOpen] = useState(false)

  useEffect(() => {
    if (themePresetId !== CUSTOM_THEME_PRESET_ID) {
      lastBuiltInPresetRef.current = themePresetId
    }
  }, [themePresetId])

  useEffect(() => {
    if (themePresetId !== CUSTOM_THEME_PRESET_ID) return
    if (themeConfig) return
    const seed = buildThemeConfigFromPresetId(lastBuiltInPresetRef.current)
    setThemeConfig(seed)
    saveThemeConfig(seed)
  }, [themePresetId, themeConfig])

  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
  }, [])

  const scheduleSaveThemeConfig = useCallback((next: NotelabThemeConfigV1) => {
    setThemeConfig(next)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      saveThemeConfig(next)
      saveDebounceRef.current = null
    }, 400)
  }, [])

  const openThemePanel = useCallback(() => {
    const cfg = themeConfig ?? buildThemeConfigFromPresetId(themePresetId)
    setThemeConfig(cfg)
    setThemePanelOpen(true)
  }, [themeConfig, themePresetId])

  const onThemePresetChange = useCallback((value: string) => {
    if (value === CUSTOM_THEME_PRESET_ID) {
      const seed = buildThemeConfigFromPresetId(lastBuiltInPresetRef.current)
      setThemePresetId(CUSTOM_THEME_PRESET_ID)
      setThemeConfig(seed)
      saveThemeConfig(seed)
      return
    }
    const snapshot = buildThemeConfigFromPresetId(value)
    setThemePresetId(value)
    setThemeConfig(snapshot)
    saveThemePresetId(value)
  }, [])

  const onFontChange = useCallback((value: string) => {
    const id = value as UiFontId
    setFont(id)
    saveUiFont(id)
    applyUiFontToDocument(id)
  }, [])

  const themeLabel =
    theme === 'system'
      ? resolvedTheme
        ? `System (${resolvedTheme})`
        : 'System'
      : theme === 'dark'
        ? 'Dark'
        : theme === 'light'
          ? 'Light'
          : 'Theme'

  const swatchColors = useMemo(
    () => getThemeSwatchColors(themePresetId, themeConfig),
    [themePresetId, themeConfig]
  )

  const paletteLabel =
    THEME_PRESET_SELECT_OPTIONS.find((o) => o.id === themePresetId)?.label ??
    'Palette'

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">
          Appearance
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Choose light, dark, or system mode, pick a color palette (or edit
          custom tokens), and set the interface font.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <Label className="text-foreground text-sm font-medium">Color theme</Label>
        <p className="text-muted-foreground text-xs">Current: {themeLabel}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={theme === 'light' ? 'default' : 'outline'}
            className="gap-1.5"
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
          >
            <Sun className="size-3.5" aria-hidden />
            Light
          </Button>
          <Button
            type="button"
            size="sm"
            variant={theme === 'dark' ? 'default' : 'outline'}
            className="gap-1.5"
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
          >
            <Moon className="size-3.5" aria-hidden />
            Dark
          </Button>
          <Button
            type="button"
            size="sm"
            variant={theme === 'system' ? 'default' : 'outline'}
            className="gap-1.5"
            onClick={() => setTheme('system')}
            aria-pressed={theme === 'system'}
          >
            <Monitor className="size-3.5" aria-hidden />
            System
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Label
          htmlFor="appearance-theme-preset"
          className="text-foreground text-sm font-medium"
        >
          Color palette
        </Label>
        <p className="text-muted-foreground text-xs">
          Palette and token snapshots are saved in notelab.config. Use Edit
          theme to change colors, radius, and shadows.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 max-w-md">
            <Select value={themePresetId} onValueChange={onThemePresetChange}>
              <SelectTrigger
                id="appearance-theme-preset"
                className="h-auto min-h-9 w-full py-1.5"
                size="default"
              >
                <SelectValue placeholder="Choose a palette">
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <ThemeSwatchStrip colors={swatchColors} />
                    <span className="truncate">{paletteLabel}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-md">
                {THEME_PRESET_SELECT_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.id}
                    value={opt.id}
                    textValue={opt.label}
                    className="cursor-pointer py-2 pr-8 pl-2"
                  >
                    <span className="flex w-full min-w-0 items-center gap-2.5">
                      <ThemeSwatchStrip
                        colors={getThemeSwatchColors(
                          opt.id,
                          opt.id === themePresetId ? themeConfig : null
                        )}
                      />
                      <span className="text-foreground truncate">{opt.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="default"
            className="h-auto min-h-9 shrink-0 gap-1.5 px-3 py-1.5"
            onClick={openThemePanel}
          >
            <PenLine className="size-4" aria-hidden />
            Edit theme
          </Button>
        </div>

        <Sheet open={themePanelOpen} onOpenChange={setThemePanelOpen}>
          <SheetContent
            side="right"
            showCloseButton
            className="overflow-hidden rounded-none"
          >
            {themeConfig ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <SheetHeader className="border-border shrink-0 space-y-1 border-b px-4 py-3 text-left">
                  <SheetTitle>Edit theme</SheetTitle>
                  <SheetDescription className="text-xs">
                    Light and dark tokens, search, and reset per row. Saving
                    edits switches the palette to Custom.
                  </SheetDescription>
                </SheetHeader>
                <ThemeConfigEditorPanel
                  className="min-h-0 flex-1 overflow-hidden"
                  value={themeConfig}
                  onChange={scheduleSaveThemeConfig}
                  baseline={buildThemeConfigFromPresetId(
                    lastBuiltInPresetRef.current
                  )}
                  onAppThemeChange={(t) => {
                    setTheme(t)
                  }}
                  appResolvedMode={
                    resolvedTheme === "dark" ? "dark" : "light"
                  }
                  panelOpen={themePanelOpen}
                />
              </div>
            ) : (
              <p className="text-muted-foreground p-4 text-sm">Loading…</p>
            )}
          </SheetContent>
        </Sheet>
      </section>

      <section className="flex flex-col gap-3">
        <Label htmlFor="appearance-font" className="text-foreground text-sm font-medium">
          Interface font
        </Label>
        <Select value={font} onValueChange={onFontChange}>
          <SelectTrigger id="appearance-font" className="w-full max-w-md" size="default">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_FONT_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground max-w-md text-xs">
          {UI_FONT_OPTIONS.find((o) => o.id === font)?.sample}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <Label className="text-foreground text-sm font-medium">Motion and layout</Label>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Sidebar inset view"
            description="Use the inset-style sidebar surface. Turn this off for a standard flat sidebar."
            value={settings.sidebarInsetView}
            onChange={(next) => onChange({ sidebarInsetView: next })}
          />
          <ToggleRow
            label="Animations"
            description="Enable interface animations and transitions in the notes sidebar."
            value={settings.animationsEnabled}
            onChange={(next) => onChange({ animationsEnabled: next })}
          />
        </div>
      </section>
    </div>
  )
}

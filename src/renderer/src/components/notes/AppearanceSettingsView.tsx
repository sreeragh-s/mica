import { useCallback, useState, type JSX } from 'react'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
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
  loadUiFont,
  saveUiFont,
  type UiFontId
} from '@/lib/appearance-storage'
import type { MacTitlebarStyles } from './notes-app-types'

export type AppearanceSettingsViewProps = {
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
}

export function AppearanceSettingsView({
  macElectron,
  macTitlebarStyles
}: AppearanceSettingsViewProps): JSX.Element {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [font, setFont] = useState<UiFontId>(() => loadUiFont())

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

  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-8 p-6"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-lg font-semibold">Appearance</h2>
        <p className="text-muted-foreground text-sm">
          Theme follows your choice; font applies across the app interface.
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
    </div>
  )
}

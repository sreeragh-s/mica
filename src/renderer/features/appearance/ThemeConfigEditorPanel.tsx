import { useCallback, useEffect, useId, useMemo, useState, type JSX } from 'react'

import { RotateCcw, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleSectionTrigger
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { humanizeThemeTokenKey } from '@/lib/theme/theme-config-utils'
import type { NotelabThemeConfigV1 } from '@/lib/config/notelab-config-schema'
import { THEME_COLOR_GROUPS, THEME_OTHER_KEYS } from '@/lib/theme/theme-token-groups'
import { cn } from '@/lib/utils'

export type ThemeConfigEditorPanelProps = {
  value: NotelabThemeConfigV1
  onChange: (next: NotelabThemeConfigV1) => void
  /** Values to restore when using reset on a row (e.g. seeded preset snapshot). */
  baseline: NotelabThemeConfigV1
  /** Syncs next-themes when user picks Light/Dark in the editor. */
  onAppThemeChange: (theme: 'light' | 'dark') => void
  /** When the panel opens, align editor mode with the app’s resolved appearance. */
  appResolvedMode: 'light' | 'dark'
  /** Panel visibility — used to re-sync mode when opening. */
  panelOpen: boolean
  className?: string
}

function patchMode(
  config: NotelabThemeConfigV1,
  mode: 'light' | 'dark',
  key: string,
  raw: string
): NotelabThemeConfigV1 {
  const trimmed = raw.trim()
  const prev = config[mode] as Record<string, string | undefined>
  if (trimmed === '') {
    const { [key]: _, ...rest } = prev
    return { ...config, [mode]: rest }
  }
  return {
    ...config,
    [mode]: { ...prev, [key]: trimmed }
  }
}

function expandShortHex(hex: string): string {
  if (hex.length === 4 && hex.startsWith('#')) {
    const r = hex[1]
    const g = hex[2]
    const b = hex[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return hex
}

function groupVisible(group: (typeof THEME_COLOR_GROUPS)[number], q: string): boolean {
  if (!q.trim()) return true
  const s = q.toLowerCase()
  if (group.label.toLowerCase().includes(s)) return true
  return group.keys.some((k) => k.includes(s) || humanizeThemeTokenKey(k).toLowerCase().includes(s))
}

function keyVisible(key: string, q: string): boolean {
  if (!q.trim()) return true
  const s = q.toLowerCase()
  return key.includes(s) || humanizeThemeTokenKey(key).toLowerCase().includes(s)
}

/** Single color preview/control on the right: native picker for hex, swatch otherwise. */
function RightColorControl({
  value,
  onChange,
  label
}: {
  value: string
  onChange: (next: string) => void
  label: string
}): JSX.Element {
  const v = value.trim()
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)
  if (isHex) {
    return (
      <input
        type="color"
        aria-label={label}
        className="border-input size-9 shrink-0 cursor-pointer rounded-md border"
        value={v.length === 4 ? expandShortHex(v) : v}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <div
      className="border-border size-9 shrink-0 rounded-md border shadow-inner"
      style={v ? { background: v } : { background: 'transparent' }}
      title={v || 'No color'}
    />
  )
}

export function ThemeConfigEditorPanel({
  value,
  onChange,
  baseline,
  onAppThemeChange,
  appResolvedMode,
  panelOpen,
  className
}: ThemeConfigEditorPanelProps): JSX.Element {
  const baseId = useId()
  const [mode, setMode] = useState<'light' | 'dark'>(appResolvedMode)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (panelOpen) {
      setMode(appResolvedMode)
    }
  }, [panelOpen, appResolvedMode])

  const setModeAndAppTheme = useCallback(
    (next: 'light' | 'dark') => {
      setMode(next)
      onAppThemeChange(next)
    },
    [onAppThemeChange]
  )

  const filteredColorGroups = useMemo(
    () => THEME_COLOR_GROUPS.filter((g) => groupVisible(g, search)),
    [search]
  )

  const resetKey = useCallback(
    (key: string) => {
      const b = baseline[mode] as Record<string, string | undefined>
      const prev = value[mode] as Record<string, string | undefined>
      const raw = b[key]
      if (raw !== undefined && String(raw).trim() !== '') {
        onChange({
          ...value,
          [mode]: { ...prev, [key]: String(raw).trim() }
        })
      } else {
        const { [key]: _, ...rest } = prev
        onChange({ ...value, [mode]: rest })
      }
    },
    [baseline, mode, onChange, value]
  )

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="border-border flex shrink-0 flex-col gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">Mode</span>
          <div className="bg-muted/60 inline-flex rounded-lg p-1">
            <Button
              type="button"
              variant={mode === 'light' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setModeAndAppTheme('light')}
            >
              Light
            </Button>
            <Button
              type="button"
              variant={mode === 'dark' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setModeAndAppTheme('dark')}
            >
              Dark
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        defaultValue="colors"
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4"
      >
        <TabsList className="bg-muted/60 mt-2 grid w-full shrink-0 grid-cols-2 rounded-lg p-1">
          <TabsTrigger value="colors" className="text-xs sm:text-sm">
            Colors
          </TabsTrigger>
          <TabsTrigger value="other" className="text-xs sm:text-sm">
            Other
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="colors"
          className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 outline-none data-[state=inactive]:hidden"
        >
          <div className="relative mb-3 shrink-0 px-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Search colors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-full pl-9"
              aria-label="Search theme colors"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pl-1">
            <div className="flex flex-col gap-1 pb-6">
              {filteredColorGroups.map((group) => {
                const keysInGroup = group.keys.filter((k) => keyVisible(k, search))
                if (keysInGroup.length === 0) return null
                return (
                  <Collapsible key={group.id} defaultOpen>
                    <CollapsibleSectionTrigger>{group.label}</CollapsibleSectionTrigger>
                    <CollapsibleContent className="pb-2">
                      <div className="flex flex-col gap-2 pt-1 pl-1">
                        {keysInGroup.map((key) => {
                          const cur = value[mode] as Record<string, string | undefined>
                          const v = cur[key] ?? ''
                          const fieldId = `${baseId}-${mode}-${key}`
                          return (
                            <div key={key} className="flex items-center gap-2 sm:gap-3">
                              <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 sm:grid-cols-[minmax(0,7rem)_1fr] sm:items-center">
                                <Label
                                  htmlFor={fieldId}
                                  className="text-muted-foreground truncate text-xs font-normal"
                                >
                                  {humanizeThemeTokenKey(key)}
                                </Label>
                                <Input
                                  id={fieldId}
                                  value={v}
                                  spellCheck={false}
                                  className="font-mono text-xs"
                                  onChange={(e) => {
                                    onChange(patchMode(value, mode, key, e.target.value))
                                  }}
                                />
                              </div>
                              <RightColorControl
                                value={v}
                                label={`Pick ${humanizeThemeTokenKey(key)}`}
                                onChange={(next) => onChange(patchMode(value, mode, key, next))}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-foreground size-9 shrink-0"
                                title="Reset to baseline"
                                onClick={() => resetKey(key)}
                              >
                                <RotateCcw className="size-4" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="other"
          className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden px-0 outline-none data-[state=inactive]:hidden"
        >
          <p className="text-muted-foreground mb-3 shrink-0 px-1 text-xs">
            Radius, shadows, and spacing for{' '}
            <span className="text-foreground font-medium">{mode}</span> mode. Values below are the
            current tokens; reset matches the baseline preset.
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pl-1">
            <div className="flex flex-col gap-4 pb-6">
              {THEME_OTHER_KEYS.map((key) => {
                const cur = value[mode] as Record<string, string | undefined>
                const b = baseline[mode] as Record<string, string | undefined>
                const v = cur[key] ?? ''
                const baseVal = b[key] ?? ''
                const fieldId = `${baseId}-other-${mode}-${key}`
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex items-start gap-2 sm:items-center">
                      <Label
                        htmlFor={fieldId}
                        className="text-muted-foreground w-28 shrink-0 pt-2 text-xs sm:w-36"
                      >
                        {humanizeThemeTokenKey(key)}
                      </Label>
                      <Input
                        id={fieldId}
                        value={v}
                        spellCheck={false}
                        placeholder={baseVal ? String(baseVal) : '—'}
                        className="font-mono flex-1 text-xs"
                        onChange={(e) => {
                          onChange(patchMode(value, mode, key, e.target.value))
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground size-9 shrink-0"
                        title="Reset to baseline"
                        onClick={() => resetKey(key)}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    </div>
                    <p className="text-muted-foreground pl-0 text-[11px] sm:pl-[calc(7rem+0.5rem)] sm:pl-[calc(9rem+0.5rem)]">
                      Current: <span className="text-foreground font-mono">{v || '—'}</span>
                      {baseVal !== undefined && String(baseVal) !== '' ? (
                        <>
                          {' '}
                          · Baseline:{' '}
                          <span className="font-mono text-foreground/80">{String(baseVal)}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

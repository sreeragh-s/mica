import { useId, type JSX } from "react"

import type { NotelabThemeConfigV1 } from "@/lib/notelab-config-schema"
import { humanizeThemeTokenKey } from "@/lib/theme-config-utils"
import { THEME_STYLE_VAR_KEYS } from "@/lib/theme-preset-apply"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export type ThemeConfigEditorProps = {
  value: NotelabThemeConfigV1
  onChange: (next: NotelabThemeConfigV1) => void
  className?: string
}

function patchMode(
  config: NotelabThemeConfigV1,
  mode: "light" | "dark",
  key: string,
  raw: string
): NotelabThemeConfigV1 {
  const trimmed = raw.trim()
  const prev = config[mode] as Record<string, string | undefined>
  if (trimmed === "") {
    const { [key]: _, ...rest } = prev
    return { ...config, [mode]: rest }
  }
  return {
    ...config,
    [mode]: { ...prev, [key]: trimmed },
  }
}

export function ThemeConfigEditor({
  value,
  onChange,
  className,
}: ThemeConfigEditorProps): JSX.Element {
  const baseId = useId()

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Tabs defaultValue="light" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="light">Light tokens</TabsTrigger>
          <TabsTrigger value="dark">Dark tokens</TabsTrigger>
        </TabsList>
        {(["light", "dark"] as const).map((mode) => (
          <TabsContent key={mode} value={mode} className="mt-3">
            <ScrollArea className="h-[min(28rem,calc(100vh-16rem))] rounded-md border pr-3">
              <div className="flex flex-col gap-3 p-3">
                {THEME_STYLE_VAR_KEYS.map((key) => {
                  const cur = value[mode] as Record<string, string | undefined>
                  const v = cur[key] ?? ""
                  const fieldId = `${baseId}-${mode}-${key}`
                  return (
                    <div
                      key={`${mode}-${key}`}
                      className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-center"
                    >
                      <Label
                        htmlFor={fieldId}
                        className="text-muted-foreground text-xs leading-tight sm:text-sm"
                      >
                        {humanizeThemeTokenKey(key)}
                      </Label>
                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          id={fieldId}
                          value={v}
                          spellCheck={false}
                          className="font-mono text-xs"
                          onChange={(e) => {
                            onChange(patchMode(value, mode, key, e.target.value))
                          }}
                        />
                        {/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? (
                          <input
                            type="color"
                            aria-label={`${humanizeThemeTokenKey(key)} color picker`}
                            className="border-input size-9 shrink-0 cursor-pointer rounded-md border"
                            value={
                              v.trim().length === 4
                                ? expandShortHex(v.trim())
                                : v.trim()
                            }
                            onChange={(e) => {
                              onChange(
                                patchMode(value, mode, key, e.target.value)
                              )
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function expandShortHex(hex: string): string {
  if (hex.length === 4 && hex.startsWith("#")) {
    const r = hex[1]
    const g = hex[2]
    const b = hex[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return hex
}

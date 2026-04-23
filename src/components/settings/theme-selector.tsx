"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Palette } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  applyThemePreset,
  DEFAULT_THEME_PRESET_ID,
  themePresetOptions,
} from "@/lib/theme-presets"
import { cn } from "@/lib/utils"

export type ThemeSelectorProps = {
  value: string
  onChange: (value: string) => void
  className?: string
}

export const ThemeSelector = React.memo(function ThemeSelector({
  value,
  onChange,
  className,
}: ThemeSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [previewValue, setPreviewValue] = React.useState(value)

  const selectedTheme =
    themePresetOptions.find((option) => option.id === value) ??
    themePresetOptions.find((option) => option.id === DEFAULT_THEME_PRESET_ID) ??
    themePresetOptions[0]

  const previewTheme = React.useCallback((themeId: string) => {
    applyThemePreset(themeId)
  }, [])

  React.useEffect(() => {
    setPreviewValue(value)
    applyThemePreset(value)
  }, [value])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)

      if (nextOpen) {
        setPreviewValue(value)
        previewTheme(value)
        return
      }

      setPreviewValue(value)
      previewTheme(value)
    },
    [previewTheme, value],
  )

  const handlePreviewChange = React.useCallback(
    (nextValue: string) => {
      setPreviewValue(nextValue)
      previewTheme(nextValue)
    },
    [previewTheme],
  )

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Select Theme
      </Label>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between rounded-lg border-border/60 bg-background px-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selectedTheme.previewColor ? (
                <span
                  className="size-3 shrink-0 rounded-full border border-border/60"
                  style={{ backgroundColor: selectedTheme.previewColor }}
                  aria-hidden
                />
              ) : (
                <Palette className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="truncate text-sm text-foreground">{selectedTheme.label}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <div>
            <Command value={previewValue} onValueChange={handlePreviewChange}>
              <CommandInput placeholder="Search theme..." />
              <CommandList>
                <CommandEmpty>No theme found.</CommandEmpty>
                <CommandGroup>
                  {themePresetOptions.map((option) => (
                    <CommandItem
                      key={option.id}
                      data-theme-id={option.id}
                      value={option.id}
                      keywords={[option.description]}
                      onPointerMove={() => {
                        setPreviewValue(option.id)
                        previewTheme(option.id)
                      }}
                      onSelect={() => {
                        onChange(option.id)
                        setOpen(false)
                      }}
                      className="gap-3"
                    >
                      {option.previewColor ? (
                        <span
                          className="size-3 shrink-0 rounded-full border border-border/60"
                          style={{ backgroundColor: option.previewColor }}
                          aria-hidden
                        />
                      ) : (
                        <Palette className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{option.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          value === option.id ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
})

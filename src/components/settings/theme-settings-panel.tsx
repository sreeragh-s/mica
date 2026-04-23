import * as React from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useMounted } from "@/hooks/use-mounted"
import {
  DEFAULT_THEME_PRESET_ID,
  getStoredThemePresetId,
  persistThemePreset,
  themePresetOptions,
} from "@/lib/theme-presets"
import { cn } from "@/lib/utils"
import { ThemeSelector } from "@/components/settings/theme-selector"

type ThemeOption = "light" | "dark" | "system"

const options: { value: ThemeOption; label: string; description: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", description: "Always use light appearance.", icon: Sun },
  { value: "dark", label: "Dark", description: "Always use dark appearance.", icon: Moon },
  { value: "system", label: "System", description: "Match your OS setting.", icon: Monitor },
]

export const ThemeSettingsPanel = React.memo(function ThemeSettingsPanel() {
  const mounted = useMounted()
  const { theme, setTheme } = useTheme()
  const active = (mounted ? theme : "system") as ThemeOption
  const [selectedPreset, setSelectedPreset] = React.useState(DEFAULT_THEME_PRESET_ID)

  React.useEffect(() => {
    if (!mounted) {
      return
    }

    setSelectedPreset(getStoredThemePresetId())
  }, [mounted])

  const handlePresetChange = React.useCallback((value: string) => {
    setSelectedPreset(value)
    persistThemePreset(value)
  }, [])

  const activePreset =
    themePresetOptions.find((option) => option.id === selectedPreset) ??
    themePresetOptions[0]

  return (
    <section className="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/85">Theme</h2>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Choose your appearance mode and switch between the app default palette or a preset theme.
      </p>
      <div className="mt-3">
        <Label className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Theme</Label>
        <RadioGroup
          value={active}
          onValueChange={(v) => setTheme(v)}
          className="mt-2 gap-2"
        >
          {options.map(({ value, label, description, icon: Icon }) => (
            <label
              key={value}
              htmlFor={`theme-${value}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 px-3 py-3 transition-colors hover:bg-muted/40",
                active === value && "border-primary/50 bg-primary/5",
              )}
            >
              <RadioGroupItem value={value} id={`theme-${value}`} className="mt-0.5" />
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">{label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>
      <div className="mt-4">
        <ThemeSelector value={selectedPreset} onChange={handlePresetChange} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {activePreset.description}
        </p>
      </div>
    </section>
  )
})

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  defaultShortcutConfig,
  getShortcutDisplayLabel,
  shortcutDefinitions,
  keyboardEventToShortcutBinding,
  type ShortcutAction,
  type ShortcutConfig,
} from "@/lib/shortcuts"

type ShortcutsSettingsPanelProps = {
  shortcuts: ShortcutConfig
  onShortcutChange: (action: ShortcutAction, binding: string) => void
}

export const ShortcutsSettingsPanel = React.memo(function ShortcutsSettingsPanel({
  shortcuts,
  onShortcutChange,
}: ShortcutsSettingsPanelProps) {
  const [capturingAction, setCapturingAction] = React.useState<ShortcutAction | null>(null)
  const inputRefs = React.useRef<Partial<Record<ShortcutAction, HTMLInputElement | null>>>({})

  React.useEffect(() => {
    if (!capturingAction) {
      return
    }

    inputRefs.current[capturingAction]?.focus()
    inputRefs.current[capturingAction]?.select()
  }, [capturingAction])

  return (
    <div className="space-y-3">
      {shortcutDefinitions.map((item) => {
        const isCapturing = capturingAction === item.action
        const currentBinding = shortcuts[item.action]
        const isDefaultBinding =
          currentBinding === defaultShortcutConfig[item.action]

        return (
          <div
            key={item.action}
            className="rounded-lg border border-border/60 bg-card p-3.5"
          >
            <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-foreground">{item.label}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.description}</p>
              </div>

              <div className="flex w-full max-w-sm flex-col gap-2" data-shortcut-capture="true">
                <Input
                  ref={(node) => {
                    inputRefs.current[item.action] = node
                  }}
                  readOnly
                  value={
                    isCapturing
                      ? "Press a shortcut..."
                      : getShortcutDisplayLabel(currentBinding)
                  }
                  aria-label={`${item.label} shortcut`}
                  className="h-8 text-xs font-medium"
                  onBlur={() => {
                    if (isCapturing) {
                      setCapturingAction(null)
                    }
                  }}
                  onFocus={() => {
                    setCapturingAction(item.action)
                  }}
                  onKeyDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()

                    if (event.key === "Escape") {
                      setCapturingAction(null)
                      return
                    }

                    const nextBinding = keyboardEventToShortcutBinding(event)
                    if (!nextBinding) {
                      return
                    }

                    onShortcutChange(item.action, nextBinding)
                    setCapturingAction(null)
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {isCapturing
                      ? "Use Command/Ctrl, Shift, or Alt with a key."
                      : `Current: ${getShortcutDisplayLabel(currentBinding)}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {!isDefaultBinding && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onShortcutChange(item.action, defaultShortcutConfig[item.action])
                        }
                      >
                        Reset
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={isCapturing ? "secondary" : "outline"}
                      size="sm"
                      onClick={() =>
                        setCapturingAction((current) =>
                          current === item.action ? null : item.action
                        )
                      }
                    >
                      {isCapturing ? "Cancel" : "Record"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})

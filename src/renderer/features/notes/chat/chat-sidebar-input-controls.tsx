import { AlertCircleIcon } from 'lucide-react'
import { useState } from 'react'

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { InputGroupButton } from '@/components/ui/input-group'
import { classifyQueryComplexity, type Mode } from '@/lib/ai/chat-retrieval-pipeline'

export function formatModeLabel(mode: Mode): string {
  return mode === 'efficiency' ? 'Efficiency' : mode === 'medium' ? 'Medium' : 'High'
}

export function ModePicker({
  activeMode,
  suggestedMode,
  disabled,
  onModeChange
}: {
  activeMode: Mode
  suggestedMode: Mode
  disabled: boolean
  onModeChange: (mode: Mode | null) => void
}) {
  const [open, setOpen] = useState(false)
  const modeDescriptions: Record<Mode, string> = {
    efficiency: 'Fastest path with the smallest seed and context set.',
    medium: 'Balanced retrieval depth for most note questions.',
    high: 'Broadest graph expansion and reranked context set.'
  }
  const options: Mode[] = ['efficiency', 'medium', 'high']

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          aria-label="Select retrieval mode"
          className="pointer-events-auto min-w-0 max-w-[120px] shrink-0 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          disabled={disabled}
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="truncate">{formatModeLabel(activeMode)}</span>
        </InputGroupButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[250px] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
        side="top"
        sideOffset={6}
      >
        <Command>
          <CommandList className="max-h-[260px]">
            <CommandGroup heading={`Suggested: ${formatModeLabel(suggestedMode)}`}>
              {options.map((mode) => {
                const isSelected = activeMode === mode
                const isSuggested = suggestedMode === mode
                return (
                  <CommandItem
                    key={mode}
                    onSelect={() => {
                      onModeChange(mode === suggestedMode ? null : mode)
                      setOpen(false)
                    }}
                    value={mode}
                    className="gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{formatModeLabel(mode)}</span>
                        {isSuggested && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            auto
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                        {modeDescriptions[mode]}
                      </p>
                    </div>
                    {isSelected && <span className="size-3 shrink-0" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PaywallBanner({
  billing,
  creditsLow,
  isLocalModelSelected,
  ollamaRunning,
  onOpenLocalSetup
}: {
  billing: { status: string; overageEnabled?: boolean } | null
  creditsLow: boolean
  isLocalModelSelected: boolean
  ollamaRunning: boolean
  onOpenLocalSetup: () => void
}) {
  if (isLocalModelSelected && ollamaRunning) return null

  if (!billing || billing.status === 'active') {
    if (creditsLow && billing) {
      return (
        <div className="border-border border-t bg-yellow-50 px-3 py-2 dark:bg-yellow-950/20">
          <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5">
            <AlertCircleIcon className="size-3 shrink-0" />
            {billing.overageEnabled
              ? 'Credits low — overage billing active.'
              : 'Credits running low. Enable overage in account settings to avoid interruption.'}
          </p>
        </div>
      )
    }
    return null
  }

  const messages: Record<string, string> = {
    on_hold: 'Payment issue — please update your payment method at notelab.io.',
    cancelled: 'Your subscription has been cancelled.',
    expired: 'Your subscription has expired.',
    none: 'A Notelab subscription is required to use AI chat.'
  }

  return (
    <div className="border-border border-t bg-destructive/5 px-3 py-2.5">
      <p className="text-destructive flex items-center gap-1.5 text-xs">
        <AlertCircleIcon className="size-3 shrink-0" />
        {messages[billing.status] ?? 'Subscription required.'}
      </p>
      <div className="mt-1 flex items-center gap-3">
        <a
          className="text-primary block text-xs underline underline-offset-2"
          href={`${import.meta.env.VITE_AUTH_BASE}`}
          rel="noreferrer"
          target="_blank"
        >
          Subscribe at notelab.io →
        </a>
        <span className="text-muted-foreground text-xs">or</span>
        <button
          className="text-primary text-xs underline underline-offset-2"
          onClick={onOpenLocalSetup}
          type="button"
        >
          Use local models →
        </button>
      </div>
    </div>
  )
}

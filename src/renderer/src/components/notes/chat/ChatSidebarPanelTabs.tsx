import type { JSX, ReactNode } from 'react'

import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { NOTES_APP_PILL_ROUNDED, NOTES_APP_PILL_SURFACE } from '@/components/notes/notes-app-utils'

export type ChatSidebarPanelTabItem = {
  value: string
  /** Visible in tooltip and `aria-label`. */
  label: string
  icon: LucideIcon
}

export type ChatSidebarPanelTabsProps = {
  /** Rendered before the tab icons (e.g. new chat). */
  leading?: ReactNode
  value: string
  onValueChange: (next: string) => void
  items: ChatSidebarPanelTabItem[]
}

/**
 * Compact icon-only panel switcher for the chat sidebar (Chat / History, Linked / Linking).
 * Parent should wrap in macOS `no-drag` + `pointer-events-auto` when inside a titlebar row.
 */
export function ChatSidebarPanelTabs({
  leading,
  value,
  onValueChange,
  items
}: ChatSidebarPanelTabsProps): JSX.Element {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          'flex h-8 shrink-0 items-center gap-0.5 p-0.5',
          NOTES_APP_PILL_ROUNDED,
          NOTES_APP_PILL_SURFACE
        )}
        role="tablist"
      >
        {leading != null ? <span className="flex shrink-0 items-center">{leading}</span> : null}
        {items.map((t) => {
          const active = t.value === value
          const Icon = t.icon
          return (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  role="tab"
                  aria-label={t.label}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  className={cn(
                    'size-7 shrink-0 rounded-md',
                    active
                      ? 'bg-background/92 text-foreground shadow-sm dark:bg-white/[0.14]'
                      : 'text-muted-foreground'
                  )}
                  onClick={() => onValueChange(t.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onValueChange(t.value)
                    }
                  }}
                >
                  <Icon className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

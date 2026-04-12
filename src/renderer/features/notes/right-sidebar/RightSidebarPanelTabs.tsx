import type { JSX, ReactNode } from 'react'

import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toolbarShellClass } from '@/lib/platform/toolbar-chrome'
import { cn } from '@/lib/utils'

export type RightSidebarPanelTabItem = {
  value: string
  /** Visible in tooltip and `aria-label`. */
  label: string
  icon: LucideIcon
}

export type RightSidebarPanelTabsProps = {
  /** Rendered before the tab icons (e.g. new chat). */
  leading?: ReactNode
  value: string
  onValueChange: (next: string) => void
  items: RightSidebarPanelTabItem[]
  /**
   * `icon` — compact icon buttons (Chat / History).
   * `segmented` — equal-width pills with icon + label (Linked / Linking); parent should allow flex grow.
   */
  variant?: 'icon' | 'segmented'
}

/**
 * Panel switcher for the right sidebar: icon tabs (Chat / History) or segmented labeled tabs (Linked / Linking).
 * Parent should wrap in macOS `no-drag` + `pointer-events-auto` when inside a titlebar row.
 */
export function RightSidebarPanelTabs({
  leading,
  value,
  onValueChange,
  items,
  variant = 'icon'
}: RightSidebarPanelTabsProps): JSX.Element {
  const segmented = variant === 'segmented'

  const tabButtons = items.map((t) => {
    const active = t.value === value
    const Icon = t.icon
    if (segmented) {
      return (
        <Button
          key={t.value}
          type="button"
          variant="ghost"
          size="sm"
          role="tab"
          aria-label={t.label}
          aria-selected={active}
          tabIndex={active ? 0 : -1}
          className={cn(
            'h-7 min-h-7 flex-1 gap-1.5 rounded-md px-2 text-xs font-medium',
            active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
          )}
          onClick={() => onValueChange(t.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onValueChange(t.value)
            }
          }}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t.label}</span>
        </Button>
      )
    }

    const button = (
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
          active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
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
    )

    return (
      <Tooltip key={t.value}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">{t.label}</TooltipContent>
      </Tooltip>
    )
  })

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          toolbarShellClass,
          segmented ? 'h-8 min-h-8 w-full min-w-0 flex-1 shrink gap-0.5' : 'h-8 shrink-0'
        )}
        role="tablist"
      >
        {leading != null ? <span className="flex shrink-0 items-center">{leading}</span> : null}
        {leading != null ? <span aria-hidden className="bg-border/80 h-3.5 w-px shrink-0" /> : null}
        {tabButtons}
      </div>
    </TooltipProvider>
  )
}

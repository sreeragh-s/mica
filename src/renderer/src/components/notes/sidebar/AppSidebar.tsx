import { Folder, GitBranch, Settings } from 'lucide-react'
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AppSidebarView } from '@/lib/notes/notes-types'

import type { NotesAppViewModel } from '@/components/notes/app-state/useNotesApp'

export type AppSidebarRailProps = {
  vm: NotesAppViewModel
}

/**
 * Narrow activity bar: switch between notes explorer, Git source control, and app settings.
 * Pairs with the main sidebar column (tree, Git panel, or settings list).
 */
export function AppSidebarRail({ vm }: AppSidebarRailProps): JSX.Element {
  const {
    appSidebarView,
    selectAppSidebarView,
    isMacNotelab,
    macTitlebarStyles,
    gitDirtyGlobal,
    gitSourceControlHasConflicts,
  } = vm

  const railBtn = (
    view: AppSidebarView,
    label: string,
    icon: JSX.Element,
    dot?: boolean,
    dotConflict?: boolean
  ): JSX.Element => {
    const active = appSidebarView === view
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={active ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={label}
            aria-pressed={active}
            className={cn(
              'relative size-9 shrink-0 rounded-lg',
              active ? 'text-foreground' : 'text-muted-foreground'
            )}
            style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
            data-sidebar-interactive=""
            onClick={() => selectAppSidebarView(view)}
          >
            {icon}
            {dot ? (
              <span
                className={cn(
                  'absolute right-1 top-1 size-1.5 rounded-full',
                  dotConflict ? 'bg-orange-500' : 'bg-primary'
                )}
                aria-hidden
              />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          'border-sidebar-border bg-sidebar/90 flex w-11 shrink-0 flex-col border-r',
          isMacNotelab && 'pointer-events-auto'
        )}
        role="toolbar"
        aria-label="Sidebar views"
      >
        <div className="flex flex-1 flex-col items-center gap-0.5 py-2">
          {railBtn(
            'explorer',
            'Notes',
            <Folder className="size-[18px]" aria-hidden />,
            false
          )}
          {railBtn(
            'source-control',
            'Source control',
            <GitBranch className="size-[18px]" aria-hidden />,
            gitDirtyGlobal || gitSourceControlHasConflicts,
            gitSourceControlHasConflicts
          )}
          {railBtn('settings', 'Settings', <Settings className="size-[18px]" aria-hidden />)}
        </div>
      </div>
    </TooltipProvider>
  )
}

import type { JSX } from 'react'

import { cn } from '@/lib/utils'
import { SidebarEdgeToolbarPill } from '@/features/notes/editor-area/NotesToolbarPill'
import { WorkspaceSwitcher } from '@/features/notes/sidebar/WorkspaceSwitcher'
import type { NotesAppViewModel } from '@/features/notes/app-state/useNotesApp'

type SidebarHeaderProps = {
  isMacNotelab: boolean
  macTitlebarStyles: NotesAppViewModel['macTitlebarStyles']
  workspaceRoot: NotesAppViewModel['workspaceRoot']
  handleWorkspaceRootChange: NotesAppViewModel['handleWorkspaceRootChange']
  toggleSidebar: NotesAppViewModel['toggleSidebar']
}

export function SidebarHeader({
  isMacNotelab,
  macTitlebarStyles,
  workspaceRoot,
  handleWorkspaceRootChange,
  toggleSidebar
}: SidebarHeaderProps): JSX.Element {
  return (
    <div
      className={cn(
        'border-border relative z-10 flex h-12 w-full shrink-0 flex-row items-stretch border-b',
        isMacNotelab && 'pointer-events-none'
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1',
          isMacNotelab ? 'pointer-events-none pl-[92px] pr-2' : 'px-2'
        )}
      >
        <WorkspaceSwitcher
          workspaceRoot={workspaceRoot}
          isMacNotelab={isMacNotelab}
          onWorkspaceRootChange={handleWorkspaceRootChange}
          className="w-full"
        />
      </div>
      <div
        className={cn(
          'flex shrink-0 items-center justify-end gap-1',
          isMacNotelab ? 'pointer-events-none pr-2' : 'px-2'
        )}
      >
        <div className="pointer-events-auto">
          <SidebarEdgeToolbarPill
            macTitlebarStyles={macTitlebarStyles}
            expanded
            onClick={toggleSidebar}
            markSidebarInteractive
          />
        </div>
      </div>
    </div>
  )
}

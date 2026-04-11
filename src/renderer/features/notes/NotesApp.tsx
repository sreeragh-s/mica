import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import {
  MAC_NOTELAB_TITLEBAR_ROW_PX,
  MAC_WINDOW_OUTER_CORNER_RADIUS_PX
} from '@shared/windowing/mac-window-chrome'

import type { NotesAppProps } from '@/features/notes/notes-app-types'
import { macTitlebarStyles } from '@/features/notes/notes-app-utils'
import { GitRemoteDialog } from '@/features/notes/git/GitRemoteDialog'
import { GitUserConfigDialog } from '@/features/notes/git/GitUserConfigDialog'
import { NotesMainArea } from '@/features/notes/editor-area/NotesMainArea'
import { LeftSidebar } from '@/features/notes/sidebar/LeftSidebar'
import { useNotesApp } from '@/features/notes/app-state/useNotesApp'

export type { NotesAppProps } from '@/features/notes/notes-app-types'

export function NotesApp(props: NotesAppProps): JSX.Element {
  const vm = useNotesApp(props)
  const { sidebarCollapsed, zenMode, isMacNotelab } = vm
  const sidebarHidden = sidebarCollapsed || zenMode
  const cwd = vm.gitToolbarFolder?.localGitPath ?? ''
  const dirName = cwd.split('/').pop() ?? 'notes'

  return (
    <div
      style={isMacNotelab ? { borderRadius: `${MAC_WINDOW_OUTER_CORNER_RADIUS_PX}px` } : undefined}
      className={cn(
        'bg-background text-foreground relative flex h-screen w-full flex-row overflow-hidden'
      )}
    >
      {/*
        Single macOS drag band: full width, flush to window top. Interactive controls use
        pointer-events-auto + no-drag in each column; rows use pointer-events-none so gaps hit this layer.
      */}
      {isMacNotelab && (
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-[1]"
          style={{ ...macTitlebarStyles.drag, height: MAC_NOTELAB_TITLEBAR_ROW_PX }}
        />
      )}
      {/*
        Single sidebar column (always mounted) so width/opacity transitions run on every platform.
        min-w-0 avoids flex min-content blocking the width animation.
      */}
      <div
        className={cn(
          'relative z-[2] flex min-h-0 min-w-0 shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]',
          sidebarHidden ? 'w-0 border-r-0' : 'w-[min(100%,360px)]',
          !sidebarHidden && isMacNotelab && 'pointer-events-none'
        )}
        aria-hidden={sidebarHidden}
      >
        <div
          className={cn(
            'h-full min-h-0 min-w-0 w-full transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,transform]',
            sidebarHidden
              ? 'pointer-events-none -translate-x-2 opacity-0'
              : 'translate-x-0 opacity-100'
          )}
        >
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col',
                isMacNotelab && !sidebarHidden && 'pointer-events-auto h-full'
              )}
            >
              <LeftSidebar vm={vm} />
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col">
        <NotesMainArea vm={vm} />
      </div>

      <GitRemoteDialog
        open={vm.gitRemoteDialogOpen}
        onOpenChange={vm.setGitRemoteDialogOpen}
        cwd={cwd}
        defaultRepoName={dirName}
        githubUsername={vm.user?.name ?? null}
        onRemoteSet={async (url) => {
          await vm.handleGitRemoteConnected(url)
        }}
      />

      <GitUserConfigDialog
        open={vm.gitUserConfigDialogOpen}
        onOpenChange={vm.setGitUserConfigDialogOpen}
        cwd={cwd}
        onConfigured={async () => {
          const retry = vm.gitPendingRetry
          if (retry) {
            vm.setGitPendingRetry(null)
            await retry()
          }
        }}
      />
    </div>
  )
}

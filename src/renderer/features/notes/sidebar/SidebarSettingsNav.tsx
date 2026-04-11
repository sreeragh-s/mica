import { Bug, FolderOpen, Keyboard, Palette, PencilRuler, Sparkles, User } from 'lucide-react'
import type { JSX } from 'react'

import { cn } from '@/lib/utils'
import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'

type SidebarSettingsNavProps = {
  settingsSection: NotesAppViewModel['settingsSection']
  setSettingsSection: NotesAppViewModel['setSettingsSection']
}

export function SidebarSettingsNav({
  settingsSection,
  setSettingsSection
}: SidebarSettingsNavProps): JSX.Element {
  return (
    <ul className="flex flex-col gap-0">
      <li>
        <button
          type="button"
          data-sidebar-interactive=""
          onClick={() => setSettingsSection('account')}
          className={cn(
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
            settingsSection === 'account' && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <User className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          Account
        </button>
      </li>
      <li>
        <button
          type="button"
          data-sidebar-interactive=""
          onClick={() => setSettingsSection('workspace')}
          className={cn(
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
            settingsSection === 'workspace' && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <FolderOpen className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          Workspace
        </button>
      </li>

      <li>
        <button
          type="button"
          data-sidebar-interactive=""
          onClick={() => setSettingsSection('appearance')}
          className={cn(
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
            settingsSection === 'appearance' && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <Palette className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          Appearance
        </button>
      </li>
      <li>
        <button
          type="button"
          data-sidebar-interactive=""
          onClick={() => setSettingsSection('editor')}
          className={cn(
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
            settingsSection === 'editor' && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <PencilRuler className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          Editor
        </button>
      </li>
      <li>
        <button
          type="button"
          data-sidebar-interactive=""
          onClick={() => setSettingsSection('shortcuts')}
          className={cn(
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
            settingsSection === 'shortcuts' && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <Keyboard className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          Shortcuts
        </button>
      </li>
      <li>
        <button
          type="button"
          data-sidebar-interactive=""
          onClick={() => setSettingsSection('debug')}
          className={cn(
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
            settingsSection === 'debug' && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <Bug className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          Debug
        </button>
      </li>
      <li>
        <button
          type="button"
          data-sidebar-interactive=""
          onClick={() => setSettingsSection('indexing')}
          className={cn(
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
            settingsSection === 'indexing' && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <Sparkles className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          Indexing
        </button>
      </li>
    </ul>
  )
}

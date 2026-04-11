import { ArrowLeft } from 'lucide-react'
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'

type SidebarSettingsBackBarProps = {
  isMacNotelab: boolean
  macTitlebarStyles: NotesAppViewModel['macTitlebarStyles']
  backToNotes: NotesAppViewModel['backToNotes']
}

export function SidebarSettingsBackBar({
  isMacNotelab,
  macTitlebarStyles,
  backToNotes
}: SidebarSettingsBackBarProps): JSX.Element {
  return (
    <div
      className={cn(
        'relative z-10 flex w-full shrink-0 items-stretch py-1.5',
        isMacNotelab ? 'pointer-events-none px-2' : 'px-2'
      )}
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          'text-muted-foreground h-8 w-full min-w-0 gap-1.5 px-2.5 items-center justify-start',
          isMacNotelab && 'pointer-events-auto'
        )}
        onClick={backToNotes}
        data-sidebar-interactive=""
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        <span className="text-muted-foreground text-left text-[13px] font-medium leading-tight">
          Back to notes
        </span>
      </Button>
    </div>
  )
}

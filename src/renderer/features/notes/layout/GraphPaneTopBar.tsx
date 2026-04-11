import { memo, type JSX } from 'react'

import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MacTitlebarStyles } from '@/features/notes/notes-app-types'

export type GraphPaneTopBarProps = {
  title: string
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  onClose: () => void
}

function GraphPaneTopBarInner({
  title,
  isMacNotelab,
  macTitlebarStyles,
  onClose
}: GraphPaneTopBarProps): JSX.Element {
  return (
    <div
      className="border-border grid h-10 shrink-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center px-3"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        aria-label="Close graph panel"
        onClick={onClose}
      >
        <X className="size-4" aria-hidden />
      </Button>
      <span
        className="text-foreground min-w-0 truncate px-1 text-center text-sm font-medium"
        title={title}
      >
        {title}
      </span>
      <span className="block w-full shrink-0" aria-hidden />
    </div>
  )
}

export const GraphPaneTopBar = memo(GraphPaneTopBarInner)

import { FileText, PenLine } from 'lucide-react'
import type { JSX } from 'react'

import type { SavedNote } from '@/lib/notes/notes-storage'
import { cn } from '@/lib/utils'

import { isDrawingNote } from '@/components/notes/notes-app-utils'

export type NoteLeadingIconProps = {
  note: SavedNote
  className?: string
  /** Smaller icon for the sidebar tree (default matches search / mentions). */
  variant?: 'sidebar' | 'default'
}

/** File / drawing / title emoji shown at the start of note rows in sidebar, search, and @-mentions. */
export function NoteLeadingIcon({
  note,
  className,
  variant = 'default',
}: NoteLeadingIconProps): JSX.Element {
  const emoji = note.titleEmoji?.trim()
  if (emoji) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center leading-none',
          variant === 'sidebar' ? 'size-3.5 text-[15px]' : 'size-4 text-base',
          className
        )}
        aria-hidden
      >
        {emoji}
      </span>
    )
  }
  if (isDrawingNote(note)) {
    return (
      <PenLine
        className={cn(
          'text-muted-foreground shrink-0 opacity-90',
          variant === 'sidebar' ? 'h-3.5 w-3.5' : 'size-4',
          className
        )}
        aria-hidden
      />
    )
  }
  return (
    <FileText
      className={cn(
        'text-muted-foreground shrink-0 opacity-90',
        variant === 'sidebar' ? 'h-3.5 w-3.5' : 'size-4',
        className
      )}
      aria-hidden
    />
  )
}

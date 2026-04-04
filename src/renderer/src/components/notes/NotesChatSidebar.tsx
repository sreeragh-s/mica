import type { JSX } from 'react'

export type NotesChatSidebarProps = {
  open: boolean
}

export function NotesChatSidebar({ open }: NotesChatSidebarProps): JSX.Element | null {
  if (!open) return null

  return (
    <aside
      className="border-border bg-background flex min-h-0 w-[min(100%,440px)] shrink-0 flex-col border-l"
      aria-label="Chat"
    />
  )
}

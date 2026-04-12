import { BookOpenIcon, Link2Icon } from 'lucide-react'
import type { JSX } from 'react'

import { formatNoteTime, type SavedNote } from '@/lib/notes/notes-storage'
import type { RightSidebarLinkMode } from '@/features/notes/right-sidebar/right-sidebar-panel-types'
import type { NoteLinksData } from '@/features/notes/right-sidebar/right-sidebar-types'

export type BidirectionalLinksPanelProps = {
  selectedNote: SavedNote | null
  foldersById: Map<string, string>
  noteLinkData: NoteLinksData
  mode: RightSidebarLinkMode
  onOpenNote: (notePath: string) => void
}

/**
 * Backlinks and outgoing wiki-style links for the selected note (Linked / Linking modes).
 * Rendered in the right column when the app is on the links tab, separate from chat UI.
 */
export function BidirectionalLinksPanel({
  selectedNote,
  foldersById,
  noteLinkData,
  mode,
  onOpenNote
}: BidirectionalLinksPanelProps): JSX.Element {
  if (!selectedNote || selectedNote.kind !== 'note') {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
        <div className="max-w-xs space-y-2">
          <div className="bg-muted mx-auto flex size-10 items-center justify-center rounded-2xl">
            <Link2Icon className="text-muted-foreground size-5" />
          </div>
          <p className="text-sm font-medium">Select a note to browse links</p>
          <p className="text-muted-foreground text-xs">
            Link relationships are available for markdown notes.
          </p>
        </div>
      </div>
    )
  }

  const emptyLabel =
    mode === 'linked'
      ? 'No notes link back to this note yet.'
      : 'This note is not linking to any other notes yet.'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-3">
        {(mode === 'linked' ? noteLinkData.backlinks.length : noteLinkData.outgoing.length) ===
        0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-2xl border border-dashed px-6 text-center text-sm">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-3">
            {mode === 'linked'
              ? noteLinkData.backlinks.map((item) => (
                  <button
                    key={item.note.path}
                    className="bg-card hover:bg-accent/35 border-border/70 w-full rounded-2xl border p-3 text-left transition-colors"
                    onClick={() => onOpenNote(item.note.path)}
                    type="button"
                  >
                    <div className="flex items-start gap-3">
                      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <BookOpenIcon className="text-muted-foreground size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">
                            {item.note.title.trim() || 'Untitled'}
                          </p>
                          <span className="text-muted-foreground shrink-0 text-[11px]">
                            {formatNoteTime(item.note.updatedAt)}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {foldersById.get(item.note.folder) ?? 'Workspace'}
                        </p>
                        <div className="mt-3 space-y-2">
                          {item.contexts.slice(0, 3).map((context, index) => (
                            <div
                              key={`${item.note.path}-${index}`}
                              className="bg-muted/45 rounded-xl border border-border/50 px-3 py-2"
                            >
                              <p className="text-foreground/90 text-xs leading-relaxed">
                                {context}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              : noteLinkData.outgoing.map((item) => (
                  <button
                    key={item.note.path}
                    className="bg-card hover:bg-accent/35 border-border/70 w-full rounded-2xl border p-3 text-left transition-colors"
                    onClick={() => onOpenNote(item.note.path)}
                    type="button"
                  >
                    <div className="flex items-start gap-3">
                      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <BookOpenIcon className="text-muted-foreground size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">
                            {item.note.title.trim() || 'Untitled'}
                          </p>
                          <span className="text-muted-foreground shrink-0 text-[11px]">
                            {formatNoteTime(item.note.updatedAt)}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {foldersById.get(item.note.folder) ?? 'Workspace'}
                        </p>
                        {item.linkText.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.linkText.slice(0, 2).map((label) => (
                              <span
                                key={`${item.note.path}-${label}`}
                                className="bg-primary/10 text-primary inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          {item.contexts.slice(0, 3).map((context, index) => (
                            <div
                              key={`${item.note.path}-${index}`}
                              className="bg-muted/45 rounded-xl border border-border/50 px-3 py-2"
                            >
                              <p className="text-foreground/90 text-xs leading-relaxed">
                                {context}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
          </div>
        )}
      </div>
    </div>
  )
}

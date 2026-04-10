import { BookOpenIcon, X } from 'lucide-react'
import { type JSX, type MouseEvent } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SearchMatchSegment } from '@/lib/notes/notes-search'
import { NOTES_APP_PILL_ROUNDED, NOTES_APP_PILL_SURFACE } from '@/features/notes/notes-app-utils'
import type { ChatHistoryMeta } from '@/hooks/useNotesChat'
import { ChatSidebarMacHitLayer } from '@/features/notes/chat/chat-sidebar-chrome'

export function SearchHighlight({ segments }: { segments: SearchMatchSegment[] }): JSX.Element {
  return (
    <>
      {segments.map((s, i) =>
        s.highlight ? (
          <mark
            key={i}
            className="bg-primary/35 text-foreground rounded-[3px] px-0.5 font-medium dark:bg-primary/25"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  )
}

export function ChatSidebarOpenSessionTabs({
  tabs,
  activeSessionId,
  onSelect,
  onClose,
  isMacNotelab
}: {
  tabs: Array<{ sessionId: string; title: string }>
  activeSessionId: string
  onSelect: (sessionId: string) => void
  onClose: (e: MouseEvent, sessionId: string) => void
  isMacNotelab?: boolean
}): JSX.Element {
  return (
    <ChatSidebarMacHitLayer className="shrink-0 px-2 py-1.5" isMacNotelab={isMacNotelab}>
      <div
        className="flex items-center gap-2 overflow-x-auto px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {tabs.map((t) => {
          const active = t.sessionId === activeSessionId
          const label = (t.title || 'Chat').trim() || 'Chat'
          return (
            <div
              key={t.sessionId}
              className={cn(
                'group flex max-w-[168px] shrink-0 items-center gap-0.5',
                active &&
                  cn(
                    NOTES_APP_PILL_ROUNDED,
                    NOTES_APP_PILL_SURFACE,
                    'border-border/60 border px-1 py-0.5 shadow-sm'
                  )
              )}
            >
              <button
                aria-selected={active}
                className={cn(
                  'min-w-0 flex-1 truncate text-left text-[11px] font-medium transition-colors',
                  active
                    ? 'text-foreground px-1.5 py-0.5'
                    : 'text-muted-foreground hover:text-foreground/85 px-2 py-1'
                )}
                onClick={() => void onSelect(t.sessionId)}
                role="tab"
                type="button"
              >
                {label}
              </button>
              {tabs.length > 1 ? (
                <Button
                  aria-label={`Close ${label}`}
                  className={cn(
                    'text-muted-foreground hover:text-foreground size-6 min-h-0 shrink-0 rounded-md transition-opacity duration-150',
                    'pointer-events-none opacity-0',
                    'group-hover:pointer-events-auto group-hover:opacity-100',
                    'focus-visible:pointer-events-auto focus-visible:opacity-100'
                  )}
                  onClick={(e) => void onClose(e, t.sessionId)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
    </ChatSidebarMacHitLayer>
  )
}

export function HistoryItem({
  meta,
  onLoad,
  titleSegments
}: {
  meta: ChatHistoryMeta
  onLoad: (meta: ChatHistoryMeta) => Promise<void>
  titleSegments?: SearchMatchSegment[]
}): JSX.Element {
  return (
    <li>
      <button
        className="hover:bg-accent w-full rounded-md px-2 py-1.5 text-left transition-colors"
        onClick={() => void onLoad(meta)}
        type="button"
      >
        <div className="flex items-start gap-2">
          <BookOpenIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {titleSegments ? <SearchHighlight segments={titleSegments} /> : meta.title}
            </p>
            <p className="text-muted-foreground text-xs">
              {new Date(meta.createdAt).toLocaleDateString()} · {meta.messageCount} messages
            </p>
          </div>
        </div>
      </button>
    </li>
  )
}

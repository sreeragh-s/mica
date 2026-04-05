import {
  BookOpenIcon,
  BotIcon,
  CopyIcon,
  HistoryIcon,
  Loader2Icon,
  PlusIcon,
  ScanTextIcon,
  Search,
  SendIcon,
  XIcon,
} from 'lucide-react'
import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Action, Actions } from '@/components/ai/actions'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai/conversation'
import {
  Message,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai/message'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai/sources'
import {
  Suggestion,
  Suggestions,
} from '@/components/ai/suggestion'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { copyPlainTextToClipboard } from '@/lib/copy-to-clipboard'
import {
  searchChatHistorySessions,
  type SearchMatchSegment,
} from '@/lib/notes-search'
import { cn } from '@/lib/utils'
import type { SavedNote, WorkspaceFolder } from '@/lib/notes-storage'
import { macTitlebarStyles } from './notes-app-utils'
import type { ChatHistoryMeta } from '@/hooks/useNotesChat'
import { useNotesChat } from '@/hooks/useNotesChat'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type NotesChatSidebarProps = {
  open: boolean
  notes: SavedNote[]
  folders: WorkspaceFolder[]
  selectedNote: SavedNote | null
  selectNote: (noteId: string) => void
  /** Adds extra top offset to clear the macOS titlebar + pill area. */
  macElectron?: boolean
  sidebarOverlayActive?: boolean
}

function SearchHighlight({ segments }: { segments: SearchMatchSegment[] }): JSX.Element {
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

// ---------------------------------------------------------------------------
// Starter suggestions shown in empty state
// ---------------------------------------------------------------------------

const STARTER_SUGGESTIONS = [
  'Summarize my recent notes',
  'What did I write about last week?',
  'Find todos across my notes',
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotesChatSidebar({
  open,
  notes,
  folders,
  selectedNote,
  selectNote,
  macElectron,
  sidebarOverlayActive,
}: NotesChatSidebarProps): JSX.Element {
  return (
    <div
      aria-hidden={!open}
      className={cn(
        'flex min-h-0 shrink-0 self-stretch overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]',
        open ? 'w-[min(100%,440px)]' : 'w-0'
      )}
    >
      <div
        className={cn(
          'flex h-full min-h-0 w-[min(100%,440px)] flex-col border-l transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,transform]',
          'border-border bg-background',
          open
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none translate-x-2 opacity-0'
        )}
      >
        <NotesChatSidebarInner
          folders={folders}
          macElectron={macElectron}
          notes={notes}
          selectNote={selectNote}
          selectedNote={selectedNote}
          sidebarOverlayActive={sidebarOverlayActive}
        />
      </div>
    </div>
  )
}

/** Chat UI; parent animates width/opacity when `open` toggles. */
function NotesChatSidebarInner({
  notes,
  folders,
  selectedNote,
  selectNote,
  macElectron,
  sidebarOverlayActive,
}: Omit<NotesChatSidebarProps, 'open'>): JSX.Element {
  const {
    session,
    historyMeta,
    isLoading,
    filterWorkspaceId,
    setFilterWorkspaceId,
    includeCurrentNote,
    setIncludeCurrentNote,
    showHistory,
    setShowHistory,
    sendMessage,
    newChat,
    loadHistorySession,
  } = useNotesChat({ notes, folders, selectedNote })

  const [input, setInput] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!showHistory) setHistorySearch('')
  }, [showHistory])

  const historySearchResults = useMemo(
    () => searchChatHistorySessions(historyMeta, historySearch, { limit: 100 }),
    [historyMeta, historySearch]
  )

  const handleSubmit = useCallback(
    async (e?: { preventDefault(): void }) => {
      e?.preventDefault()
      const q = input.trim()
      if (!q || isLoading) return
      setInput('')
      await sendMessage(q)
    },
    [input, isLoading, sendMessage]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleSuggestion = useCallback(
    (s: string) => {
      setInput(s)
      setTimeout(() => textareaRef.current?.focus(), 0)
    },
    []
  )

  const handleCopy = useCallback((content: string) => {
    void copyPlainTextToClipboard(content).catch((err) => {
      console.error('[NotesChat] copy failed', err)
    })
  }, [])

  // ---------------------------------------------------------------------------
  // History view
  // ---------------------------------------------------------------------------

  // Spacer that clears the floating toolbar pill (absolute, top-2 h-12 on mac/overlay, top-0 h-12 otherwise)
  const pillSpacer = (
    <div
      aria-hidden
      className={cn('shrink-0', macElectron || sidebarOverlayActive ? 'h-14' : 'h-12')}
      style={macElectron ? macTitlebarStyles.drag : undefined}
    />
  )

  if (showHistory) {
    return (
      <aside
        aria-label="Chat history"
        className="border-border bg-background flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {pillSpacer}
        <ChatToolbarRow
          folders={folders}
          filterWorkspaceId={filterWorkspaceId}
          historySearch={historySearch}
          macElectron={macElectron}
          newChat={() => void newChat()}
          setFilterWorkspaceId={setFilterWorkspaceId}
          setHistorySearch={setHistorySearch}
          setShowHistory={setShowHistory}
          showHistory
        />
        <div className="flex-1 overflow-y-auto p-3">
          {historyMeta.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-xs">No saved sessions yet.</p>
          ) : historySearchResults.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-xs">No matching sessions.</p>
          ) : (
            <ul className="space-y-1">
              {historySearchResults.map(({ meta, titleSegments }) => (
                <HistoryItem
                  key={meta.sessionId}
                  meta={meta}
                  onLoad={loadHistorySession}
                  titleSegments={titleSegments}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    )
  }

  // ---------------------------------------------------------------------------
  // Chat view
  // ---------------------------------------------------------------------------

  return (
    <aside
      aria-label="Chat"
      className="border-border bg-background flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {pillSpacer}
      <ChatToolbarRow
        folders={folders}
        filterWorkspaceId={filterWorkspaceId}
        historySearch={historySearch}
        macElectron={macElectron}
        newChat={() => void newChat()}
        setFilterWorkspaceId={setFilterWorkspaceId}
        setHistorySearch={setHistorySearch}
        setShowHistory={setShowHistory}
        showHistory={false}
      />

      {/* Message list */}
      <Conversation className="flex-1">
        <ConversationContent>
          {session.messages.length === 0 ? (
            <ConversationEmptyState
              description="Ask anything about your notes"
              icon={<BotIcon className="size-8" />}
              title="Chat with your notes"
            />
          ) : (
            session.messages.map((msg) => (
              <div key={msg.id}>
                <Message from={msg.role}>
                  <MessageContent>
                    {msg.role === 'assistant' ? (
                      <MessageResponse>{msg.content || ' '}</MessageResponse>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </MessageContent>

                  {/* Sources for assistant messages */}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <Sources className="mt-1">
                      <SourcesTrigger count={msg.sources.length} />
                      <SourcesContent>
                        {msg.sources.map((src, i) => (
                          <Source
                            key={`${src.noteId}-${i}`}
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              selectNote(src.noteId)
                            }}
                            title={src.noteTitle}
                          />
                        ))}
                      </SourcesContent>
                    </Sources>
                  )}

                  {/* Actions for assistant messages */}
                  {msg.role === 'assistant' && msg.content && (
                    <MessageActions>
                      <Actions>
                        <Action
                          onClick={() => handleCopy(msg.content)}
                          tooltip="Copy response"
                        >
                          <CopyIcon className="size-4" />
                        </Action>
                      </Actions>
                    </MessageActions>
                  )}
                </Message>

                {/* Loading indicator after the last user message */}
                {isLoading &&
                  msg.role === 'user' &&
                  msg.id === session.messages.at(-2)?.id && (
                    <Message from="assistant">
                      <MessageContent>
                        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                      </MessageContent>
                    </Message>
                  )}
              </div>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Starter suggestions when empty */}
      {session.messages.length === 0 && (
        <div className="px-3 pb-2">
          <Suggestions>
            {STARTER_SUGGESTIONS.map((s) => (
              <Suggestion key={s} onClick={handleSuggestion} suggestion={s} />
            ))}
          </Suggestions>
        </div>
      )}

      {/* Input area */}
      <form
        className="border-border border-t p-3"
        onSubmit={(e) => void handleSubmit(e)}
      >
        {/* Current note toggle */}
        {selectedNote && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'mb-2 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    includeCurrentNote
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setIncludeCurrentNote(!includeCurrentNote)}
                  type="button"
                >
                  <ScanTextIcon className="size-3" />
                  <span className="max-w-[180px] truncate">{selectedNote.title}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {includeCurrentNote ? 'Remove current note from context' : 'Add current note to context'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            className="max-h-36 min-h-[2.5rem] resize-none text-sm"
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your notes…"
            rows={1}
            value={input}
          />
          <Button
            className="shrink-0"
            disabled={!input.trim() || isLoading}
            size="icon"
            type="submit"
          >
            {isLoading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </form>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------



function ChatToolbarRow({
  folders,
  filterWorkspaceId,
  setFilterWorkspaceId,
  showHistory,
  setShowHistory,
  historySearch,
  setHistorySearch,
  newChat,
  macElectron,
}: {
  folders: WorkspaceFolder[]
  filterWorkspaceId: string | null
  setFilterWorkspaceId: (id: string | null) => void
  showHistory: boolean
  setShowHistory: (v: boolean) => void
  historySearch: string
  setHistorySearch: (v: string) => void
  newChat: () => void
  macElectron?: boolean
}): JSX.Element {
  return (
    <div
      className="border-border flex min-h-9 shrink-0 items-center gap-2 border-b px-3 py-2"
      style={macElectron ? macTitlebarStyles.drag : undefined}
    >
      {showHistory ? (
        <div
          className="relative min-w-0 flex-1"
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
        >
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 opacity-70"
          />
          <Input
            aria-label="Search chat history"
            className="border-border bg-background h-7 pl-8 text-xs"
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Search history…"
            type="search"
            value={historySearch}
          />
        </div>
      ) : folders.length > 0 ? (
        <div
          className="min-w-0 flex-1"
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
        >
          <Select
            onValueChange={(v) => setFilterWorkspaceId(v === '__all__' ? null : v)}
            value={filterWorkspaceId ?? '__all__'}
          >
            <SelectTrigger className="h-7 w-full text-xs">
              <SelectValue placeholder="All workspaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All workspaces</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      <div
        className="flex shrink-0 items-center gap-0.5"
        style={macElectron ? macTitlebarStyles.noDrag : undefined}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="size-7"
                onClick={newChat}
                size="icon"
                type="button"
                variant="ghost"
              >
                <PlusIcon className="size-3.5" />
                <span className="sr-only">New chat</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="size-7"
                onClick={() => setShowHistory(!showHistory)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {showHistory ? (
                  <XIcon className="size-3.5" />
                ) : (
                  <HistoryIcon className="size-3.5" />
                )}
                <span className="sr-only">{showHistory ? 'Back to chat' : 'View history'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{showHistory ? 'Back to chat' : 'View history'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

function HistoryItem({
  meta,
  onLoad,
  titleSegments,
}: {
  meta: ChatHistoryMeta
  onLoad: (meta: ChatHistoryMeta) => Promise<void>
  titleSegments?: SearchMatchSegment[]
}): JSX.Element {
  return (
    <li>
      <button
        className="hover:bg-accent w-full rounded-md px-3 py-2 text-left transition-colors"
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

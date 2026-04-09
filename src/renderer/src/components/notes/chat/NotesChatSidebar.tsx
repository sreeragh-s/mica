import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  BotIcon,
  CopyIcon,
  Link2Icon,
  Loader2Icon,
  ArrowUpIcon,
  PaperclipIcon,
  PlusIcon,
  ScanTextIcon,
  Search,
  SparklesIcon
} from 'lucide-react'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  PromptInputChatMentionTextarea,
  type PromptInputChatMentionTextareaHandle,
  PromptInputChatReferenceChips,
  type PromptInputChatReference
} from '@/components/ai/prompt-input'
import {
  NoteLabModelPicker,
  DEFAULT_NOTELAB_MODEL_ID,
  LOCAL_MODEL_PREFIX
} from '@/components/ai/model-selector'
import {
  LocalModelSetupPanel,
  hasLocalEmbeddingModel,
  isLocalEmbeddingOnlyModel,
  LOCAL_EMBEDDING_MODEL
} from '@/components/ai/LocalModelSetupDialog'
import { Action, Actions } from '@/components/ai/actions'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/components/ai/conversation'
import { Message, MessageActions, MessageContent, MessageResponse } from '@/components/ai/message'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai/sources'
import { Suggestion, Suggestions } from '@/components/ai/suggestion'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { copyPlainTextToClipboard } from '@/lib/core/copy-to-clipboard'
import { searchChatHistorySessions, type SearchMatchSegment } from '@/lib/notes/notes-search'
import { cn } from '@/lib/utils'
import {
  DEFAULT_WORKSPACE_ID,
  formatNoteTime,
  type SavedNote,
  type Folder
} from '@/lib/notes/notes-storage'
import { macTitlebarStyles, NOTES_APP_PILL_SURFACE } from '@/components/notes/notes-app-utils'
import { collectInternalNoteLinkMentions } from '@/lib/notes/note-link-graph'
import type { ChatHistoryMeta } from '@/hooks/useNotesChat'
import { useNotesChat } from '@/hooks/useNotesChat'
import { useBillingStatus } from '@/hooks/useBillingStatus'
import { useOllama } from '@/hooks/useOllama'
import type { NotesAppViewModel } from '@/components/notes/app-state/useNotesApp'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type NotesChatSidebarPanel = 'chat' | 'links'
export type NotesChatSidebarLinkMode = 'linked' | 'linking'

type NoteLinksData = {
  backlinks: Array<{ note: SavedNote; contexts: string[] }>
  outgoing: Array<{ note: SavedNote; contexts: string[]; linkText: string[] }>
}

export type NotesChatSidebarProps = {
  open: boolean
  notes: SavedNote[]
  folders: Folder[]
  workspacePath: string | null
  canAutoIndex: boolean
  indexingStatus: NotesAppViewModel['indexingStatus']
  runIndexPending: NotesAppViewModel['runIndexPending']
  selectedNote: SavedNote | null
  selectNote: (notePath: string) => void
  panel: NotesChatSidebarPanel
  linkMode: NotesChatSidebarLinkMode
  onLinkModeChange: (mode: NotesChatSidebarLinkMode) => void
  /** Adds extra top offset to clear the macOS titlebar + pill area. */
  isMacNotelab?: boolean
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
  'Find todos across my notes'
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotesChatSidebar({
  open,
  notes,
  folders,
  workspacePath,
  canAutoIndex,
  indexingStatus,
  runIndexPending,
  selectedNote,
  selectNote,
  panel,
  linkMode,
  onLinkModeChange,
  isMacNotelab,
  sidebarOverlayActive
}: NotesChatSidebarProps): JSX.Element {
  return (
    <div
      aria-hidden={!open}
      className={cn(
        'flex min-h-0 shrink-0 self-stretch overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]',
        open && 'pointer-events-auto',
        open ? 'w-[min(100%,440px)]' : 'w-0'
      )}
    >
      <div
        className={cn(
          'flex h-full min-h-0 w-[min(100%,440px)] flex-col border-l transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,transform]',
          'border-border bg-background',
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-2 opacity-0'
        )}
      >
        <NotesChatSidebarInner
          open={open}
          folders={folders}
          canAutoIndex={canAutoIndex}
          indexingStatus={indexingStatus}
          isMacNotelab={isMacNotelab}
          notes={notes}
          runIndexPending={runIndexPending}
          workspacePath={workspacePath}
          selectNote={selectNote}
          selectedNote={selectedNote}
          panel={panel}
          linkMode={linkMode}
          onLinkModeChange={onLinkModeChange}
          sidebarOverlayActive={sidebarOverlayActive}
        />
      </div>
    </div>
  )
}

/** Chat UI; parent animates width/opacity when `open` toggles. */
function NotesChatSidebarInner({
  open,
  notes,
  folders,
  workspacePath,
  canAutoIndex,
  indexingStatus,
  runIndexPending,
  selectedNote,
  selectNote,
  panel,
  linkMode,
  onLinkModeChange,
  isMacNotelab,
  sidebarOverlayActive
}: NotesChatSidebarProps): JSX.Element {
  // Selected model: a NoteLabModelId or "local:<ollamaModelName>"
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_NOTELAB_MODEL_ID)
  const [localSetupOpen, setLocalSetupOpen] = useState(false)

  const ollama = useOllama()

  // Embedding-only tags (e.g. bge-m3) are not chat models — avoid stale selection
  useEffect(() => {
    if (!selectedModelId.startsWith(LOCAL_MODEL_PREFIX)) return
    const name = selectedModelId.slice(LOCAL_MODEL_PREFIX.length)
    if (!isLocalEmbeddingOnlyModel(name)) return
    const firstChat = ollama.localModels.find((m) => !isLocalEmbeddingOnlyModel(m.name))
    setSelectedModelId(
      firstChat ? `${LOCAL_MODEL_PREFIX}${firstChat.name}` : DEFAULT_NOTELAB_MODEL_ID
    )
  }, [selectedModelId, ollama.localModels])

  const {
    session,
    historyMeta,
    isLoading,
    filterWorkspaceId,
    setFilterWorkspaceId,
    showHistory,
    setShowHistory,
    sendMessage,
    newChat,
    loadHistorySession
  } = useNotesChat({ notes, folders, workspacePath, selectedNote, modelId: selectedModelId })

  const { billing, canChat, creditsLow } = useBillingStatus()

  // A user without an active paid plan can use local models
  const isUnpaidUser = !billing || billing.status !== 'active'
  // For local model selection, we allow it regardless of billing
  const isLocalModelSelected = selectedModelId.startsWith(LOCAL_MODEL_PREFIX)
  // Can actually chat: paid OR using a local model with Ollama running
  const canChatEffective = canChat || (isLocalModelSelected && (ollama.status?.running ?? false))

  // When billing status becomes known and user isn't paid, auto-suggest local models
  // (but don't force-switch — let them choose)

  const [input, setInput] = useState('')
  const [chatReferences, setChatReferences] = useState<PromptInputChatReference[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [chatTab, setChatTab] = useState<'chat' | 'history'>('chat')
  const textareaRef = useRef<PromptInputChatMentionTextareaHandle>(null)
  const hasTriggeredAutoIndexRef = useRef(false)

  const workspacesForMentions = useMemo(() => {
    const map = new Map(folders.map((f) => [f.folder, { folder: f.folder, name: f.name }]))
    if (!map.has(DEFAULT_WORKSPACE_ID)) {
      map.set(DEFAULT_WORKSPACE_ID, { folder: DEFAULT_WORKSPACE_ID, name: 'Root' })
    }
    return Array.from(map.values())
  }, [folders])

  useEffect(() => {
    if (chatTab !== 'history') setHistorySearch('')
  }, [chatTab])

  useEffect(() => {
    if (panel !== 'links') return
    setChatTab('chat')
    setShowHistory(false)
    setLocalSetupOpen(false)
  }, [panel, setShowHistory])

  useEffect(() => {
    setShowHistory(chatTab === 'history')
  }, [chatTab, setShowHistory])

  useEffect(() => {
    if (!open) {
      hasTriggeredAutoIndexRef.current = false
      return
    }
    if (
      hasTriggeredAutoIndexRef.current ||
      !workspacePath ||
      !canAutoIndex ||
      indexingStatus.running
    ) {
      return
    }
    hasTriggeredAutoIndexRef.current = true
    void runIndexPending()
  }, [open, workspacePath, canAutoIndex, indexingStatus.running, runIndexPending])

  const historySearchResults = useMemo(
    () => searchChatHistorySessions(historyMeta, historySearch, { limit: 100 }),
    [historyMeta, historySearch]
  )

  const validNoteIds = useMemo(() => new Set(notes.map((n) => n.path)), [notes])
  const workspacesById = useMemo(
    () => new Map(folders.map((folder) => [folder.folder, folder.name ?? 'Workspace'])),
    [folders]
  )

  const noteLinkData = useMemo<NoteLinksData>(() => {
    if (!selectedNote || selectedNote.kind !== 'note') {
      return { backlinks: [], outgoing: [] }
    }

    const noteById = new Map(notes.map((note) => [note.path, note]))
    const outgoingMentions = collectInternalNoteLinkMentions(selectedNote.content)
      .filter((mention) => mention.target !== selectedNote.path)
      .reduce<Map<string, { note: SavedNote; contexts: string[]; linkText: string[] }>>(
        (acc, mention) => {
          const targetNote = noteById.get(mention.target)
          if (!targetNote) return acc
          const existing = acc.get(targetNote.path)
          if (existing) {
            if (mention.contextText && !existing.contexts.includes(mention.contextText)) {
              existing.contexts.push(mention.contextText)
            }
            if (mention.linkText && !existing.linkText.includes(mention.linkText)) {
              existing.linkText.push(mention.linkText)
            }
            return acc
          }
          acc.set(targetNote.path, {
            note: targetNote,
            contexts: mention.contextText ? [mention.contextText] : [],
            linkText: mention.linkText ? [mention.linkText] : []
          })
          return acc
        },
        new Map()
      )

    const backlinks = notes
      .filter((note) => note.path !== selectedNote.path && note.kind === 'note')
      .flatMap((note) =>
        collectInternalNoteLinkMentions(note.content)
          .filter((mention) => mention.target === selectedNote.path)
          .slice(0, 6)
          .map((mention) => ({ note, mention }))
      )
      .reduce<Map<string, { note: SavedNote; contexts: string[] }>>((acc, entry) => {
        const existing = acc.get(entry.note.path)
        if (existing) {
          if (entry.mention.contextText && !existing.contexts.includes(entry.mention.contextText)) {
            existing.contexts.push(entry.mention.contextText)
          }
          return acc
        }
        acc.set(entry.note.path, {
          note: entry.note,
          contexts: entry.mention.contextText ? [entry.mention.contextText] : []
        })
        return acc
      }, new Map())

    return {
      backlinks: Array.from(backlinks.values()).sort((a, b) => b.note.updatedAt - a.note.updatedAt),
      outgoing: Array.from(outgoingMentions.values()).sort(
        (a, b) => b.note.updatedAt - a.note.updatedAt
      )
    }
  }, [notes, selectedNote])

  const handleSubmit = useCallback(
    async (e?: { preventDefault(): void }) => {
      e?.preventDefault()
      const q = input.trim()
      const explicitNoteIds = chatReferences.filter((r) => r.kind === 'note').map((r) => r.refId)
      const explicitWorkspaceIds = chatReferences
        .filter((r) => r.kind === 'workspace')
        .map((r) => r.refId)
      if (
        (!q && explicitNoteIds.length === 0 && explicitWorkspaceIds.length === 0) ||
        isLoading ||
        !canChatEffective
      ) {
        return
      }
      setInput('')
      setChatReferences([])
      await sendMessage(q, { explicitNoteIds, explicitWorkspaceIds })
    },
    [input, chatReferences, isLoading, canChatEffective, sendMessage]
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

  const handleSuggestion = useCallback((s: string) => {
    setInput(s)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  const handleCopy = useCallback((content: string) => {
    void copyPlainTextToClipboard(content).catch((err) => {
      console.error('[NotesChat] copy failed', err)
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Paywall banner
  // ---------------------------------------------------------------------------

  const paywallBanner = (() => {
    // If using a local model that's running — no paywall
    if (isLocalModelSelected && ollama.status?.running) return null

    if (!billing || billing.status === 'active') {
      if (creditsLow && billing) {
        return (
          <div className="border-border border-t bg-yellow-50 px-3 py-2 dark:bg-yellow-950/20">
            <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5">
              <AlertCircleIcon className="size-3 shrink-0" />
              {billing.overageEnabled
                ? 'Credits low — overage billing active.'
                : 'Credits running low. Enable overage in account settings to avoid interruption.'}
            </p>
          </div>
        )
      }
      return null
    }

    const messages: Record<string, string> = {
      on_hold: 'Payment issue — please update your payment method at notelab.io.',
      cancelled: 'Your subscription has been cancelled.',
      expired: 'Your subscription has expired.',
      none: 'A Notelab subscription is required to use AI chat.'
    }

    return (
      <div className="border-border border-t bg-destructive/5 px-3 py-2.5">
        <p className="text-destructive flex items-center gap-1.5 text-xs">
          <AlertCircleIcon className="size-3 shrink-0" />
          {messages[billing.status] ?? 'Subscription required.'}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <a
            className="text-primary block text-xs underline underline-offset-2"
            href={`${import.meta.env.VITE_AUTH_BASE}`}
            rel="noreferrer"
            target="_blank"
          >
            Subscribe at notelab.io →
          </a>
          <span className="text-muted-foreground text-xs">or</span>
          <button
            className="text-primary text-xs underline underline-offset-2"
            onClick={() => setLocalSetupOpen(true)}
            type="button"
          >
            Use local models →
          </button>
        </div>
      </div>
    )
  })()

  // ---------------------------------------------------------------------------
  // History view
  // ---------------------------------------------------------------------------

  // Spacer that clears the floating toolbar pill
  const pillSpacer = (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none shrink-0',
        isMacNotelab || sidebarOverlayActive ? 'h-14' : 'h-14'
      )}
    />
  )

  const chatTabs = (
    <div className="px-3 pb-2">
      <Tabs onValueChange={(value) => setChatTab(value as 'chat' | 'history')} value={chatTab}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
          <TabsTrigger className="text-xs" value="chat">
            Chat
          </TabsTrigger>
          <TabsTrigger className="text-xs" value="history">
            History
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )

  const linkTabs = (
    <div className="px-3 pb-2">
      <Tabs
        onValueChange={(value) => onLinkModeChange(value as NotesChatSidebarLinkMode)}
        value={linkMode}
      >
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
          <TabsTrigger className="text-xs" value="linked">
            Linked
          </TabsTrigger>
          <TabsTrigger className="text-xs" value="linking">
            Linking
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )

  if (panel === 'chat' && showHistory) {
    return (
      <aside
        aria-label="Chat history"
        className="border-border bg-background flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {pillSpacer}
        {chatTabs}
        <ChatToolbarRow
          folders={folders}
          filterWorkspaceId={filterWorkspaceId}
          historySearch={historySearch}
          isMacNotelab={isMacNotelab}
          newChat={() => void newChat()}
          setFilterWorkspaceId={setFilterWorkspaceId}
          setHistorySearch={setHistorySearch}
          showHistory={chatTab === 'history'}
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
  // Local model setup view — replaces the entire sidebar content
  // ---------------------------------------------------------------------------

  if (panel === 'chat' && localSetupOpen) {
    return (
      <aside
        aria-label="Local model setup"
        className="border-border bg-background flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {pillSpacer}
        {chatTabs}
        <LocalModelSetupPanel
          onClose={() => setLocalSetupOpen(false)}
          ollama={ollama}
          selectedModelId={selectedModelId}
          onSelectModel={(id: string) => {
            setSelectedModelId(id)
            setLocalSetupOpen(false)
          }}
        />
      </aside>
    )
  }

  // ---------------------------------------------------------------------------
  // Chat view
  // ---------------------------------------------------------------------------

  const inputPlaceholder = (() => {
    if (!canChatEffective) {
      if (isLocalModelSelected) return 'Start Ollama server to chat…'
      return 'Subscription required…'
    }
    return 'Ask about your notes…'
  })()

  return (
    <aside
      aria-label="Chat"
      className="border-border bg-background relative flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {pillSpacer}
      {panel === 'chat' ? chatTabs : linkTabs}
      {panel === 'links' ? (
        <NoteLinksPanel
          foldersById={workspacesById}
          mode={linkMode}
          noteLinkData={noteLinkData}
          onOpenNote={selectNote}
          selectedNote={selectedNote}
        />
      ) : (
        <>
          <ChatToolbarRow
            folders={folders}
            filterWorkspaceId={filterWorkspaceId}
            historySearch={historySearch}
            isMacNotelab={isMacNotelab}
            newChat={() => void newChat()}
            setFilterWorkspaceId={setFilterWorkspaceId}
            setHistorySearch={setHistorySearch}
            showHistory={false}
          />

          {isLocalModelSelected &&
            ollama.status?.running &&
            !ollama.modelsLoading &&
            !hasLocalEmbeddingModel(ollama.localModels) && (
              <div className="border-border shrink-0 border-b bg-muted/30 px-3 py-2">
                <p className="text-muted-foreground flex items-start gap-2 text-xs leading-snug">
                  <ScanTextIcon className="size-3.5 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    Pull <span className="font-mono text-foreground">{LOCAL_EMBEDDING_MODEL}</span>{' '}
                    in{' '}
                    <button
                      className="text-primary underline underline-offset-2"
                      onClick={() => setLocalSetupOpen(true)}
                      type="button"
                    >
                      local setup
                    </button>{' '}
                    for offline semantic search over your notes.
                  </span>
                </p>
              </div>
            )}

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
                session.messages.map((msg) => {
                  const visibleSources =
                    msg.role === 'assistant' && msg.sources
                      ? msg.sources.filter((s) => validNoteIds.has(s.note))
                      : []
                  return (
                    <div key={msg.id}>
                      <Message from={msg.role}>
                        <MessageContent>
                          {msg.role === 'assistant' ? (
                            <MessageResponse>{msg.content || ' '}</MessageResponse>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </MessageContent>

                        {/* Sources for assistant messages (hide entries for deleted notes) */}
                        {msg.role === 'assistant' && visibleSources.length > 0 && (
                          <Sources className="mt-1">
                            <SourcesTrigger count={visibleSources.length} />
                            <SourcesContent>
                              {visibleSources.map((src, i) => (
                                <Source
                                  key={`${src.note}-${i}`}
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    selectNote(src.note)
                                  }}
                                  title={src.title}
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
                  )
                })
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {/* Starter suggestions when empty */}
          {session.messages.length === 0 && canChatEffective && (
            <div className="px-3 pb-2">
              <Suggestions>
                {STARTER_SUGGESTIONS.map((s) => (
                  <Suggestion key={s} onClick={handleSuggestion} suggestion={s} />
                ))}
              </Suggestions>
            </div>
          )}

          {/* Paywall / low-credits banner */}
          {paywallBanner}

          <form className="border-border border-t p-3" onSubmit={(e) => void handleSubmit(e)}>
            <PromptInputChatReferenceChips
              className="mb-2"
              editorNote={
                selectedNote && canChatEffective
                  ? {
                      path: selectedNote.path,
                      title: selectedNote.title,
                      titleEmoji: selectedNote.titleEmoji
                    }
                  : null
              }
              onReferencesChange={setChatReferences}
              onRemove={(r) =>
                setChatReferences((prev) =>
                  prev.filter((x) => !(x.kind === r.kind && x.refId === r.refId))
                )
              }
              references={chatReferences}
            />
            <InputGroup className="bg-background overflow-hidden">
              <PromptInputChatMentionTextarea
                ref={textareaRef}
                className="max-h-48 min-h-20 resize-none text-sm"
                disabled={isLoading || !canChatEffective}
                notes={notes}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                onReferencesChange={setChatReferences}
                placeholder={`${inputPlaceholder} Type @ to reference notes or workspaces.`}
                rows={1}
                value={input}
                workspaces={workspacesForMentions}
              />
              <InputGroupAddon align="block-end" className="flex flex-wrap items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InputGroupButton
                        aria-label="Reference notes or workspaces"
                        disabled={isLoading || !canChatEffective}
                        onClick={() => textareaRef.current?.openReferencePicker()}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <PaperclipIcon className="size-4" />
                      </InputGroupButton>
                    </TooltipTrigger>
                    <TooltipContent side="top">Add references (same as typing @)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="ml-auto flex min-w-0 items-center gap-2">
                  <NoteLabModelPicker
                    selectedModelId={selectedModelId}
                    onModelChange={setSelectedModelId}
                    localModels={ollama.localModels}
                    ollamaRunning={ollama.status?.running ?? false}
                    onOpenLocalSetup={() => setLocalSetupOpen(true)}
                    localOnly={isUnpaidUser && !canChat}
                  />
                  <Separator className="!h-4" orientation="vertical" />
                  <InputGroupButton
                    className="rounded-full"
                    disabled={
                      (!input.trim() && chatReferences.length === 0) ||
                      isLoading ||
                      !canChatEffective
                    }
                    size="icon-xs"
                    type="submit"
                    variant="default"
                  >
                    {isLoading ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <ArrowUpIcon className="size-4" />
                    )}
                    <span className="sr-only">Send</span>
                  </InputGroupButton>
                </div>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </>
      )}
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
  historySearch,
  setHistorySearch,
  newChat,
  isMacNotelab
}: {
  folders: Folder[]
  filterWorkspaceId: string | null
  setFilterWorkspaceId: (id: string | null) => void
  showHistory: boolean
  historySearch: string
  setHistorySearch: (v: string) => void
  newChat: () => void
  isMacNotelab?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'relative z-10 border-border flex min-h-9 shrink-0 items-center gap-2 px-3 ',
        isMacNotelab && 'pointer-events-none'
      )}
    >
      {showHistory ? (
        <div
          className="pointer-events-auto relative min-w-0 flex-1"
          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
        >
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 opacity-70"
          />
          <Input
            aria-label="Search chat history"
            className="border-border bg-background h-8 pl-8 text-xs"
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Search history…"
            type="search"
            value={historySearch}
          />
        </div>
      ) : folders.length > 0 ? (
        <div
          className="pointer-events-auto min-w-0 flex-1"
          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
        >
          <Select
            onValueChange={(v) => setFilterWorkspaceId(v === '__all__' ? null : v)}
            value={filterWorkspaceId ?? '__all__'}
          >
            <SelectTrigger
              size="sm"
              className={cn(
                NOTES_APP_PILL_SURFACE,
                'h-8 w-full min-w-0 rounded-full border px-3 py-0 text-xs shadow-none',
                'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0',
                '[&_svg]:size-3 [&_svg]:opacity-70'
              )}
            >
              <SelectValue placeholder="All workspaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className="text-xs" value="__all__">
                All workspaces
              </SelectItem>
              {folders.map((f) => (
                <SelectItem className="text-xs" key={f.folder} value={f.folder}>
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
        className="pointer-events-auto flex shrink-0 items-center gap-0.5"
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={newChat} size="icon-sm" type="button" variant="ghost">
                <PlusIcon className="size-3.5" />
                <span className="sr-only">New chat</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

function HistoryItem({
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

function NoteLinksPanel({
  selectedNote,
  foldersById,
  noteLinkData,
  mode,
  onOpenNote
}: {
  selectedNote: SavedNote | null
  foldersById: Map<string, string>
  noteLinkData: NoteLinksData
  mode: NotesChatSidebarLinkMode
  onOpenNote: (notePath: string) => void
}): JSX.Element {
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
      <div className="border-border border-b px-3 pb-3">
        <div className="bg-muted/35 rounded-2xl border border-border/60 px-3 py-3">
          <div className="flex items-center gap-2">
            {mode === 'linked' ? (
              <ArrowLeftIcon className="text-muted-foreground size-4" />
            ) : (
              <SparklesIcon className="text-muted-foreground size-4" />
            )}
            <p className="min-w-0 truncate text-sm font-medium">
              {selectedNote.title.trim() || 'Untitled'}
            </p>
          </div>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {mode === 'linked'
              ? 'Notes that reference the current note.'
              : 'Notes referenced from the current note, with the exact linked section preview.'}
          </p>
        </div>
      </div>
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

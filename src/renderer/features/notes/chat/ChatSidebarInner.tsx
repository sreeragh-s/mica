import {
  AlertCircleIcon,
  BotIcon,
  CopyIcon,
  History,
  Link2Icon,
  Loader2Icon,
  ArrowUpIcon,
  PaperclipIcon,
  PlusIcon,
  ScanTextIcon
} from 'lucide-react'
import {
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { classifyQueryComplexity, type Mode } from '@/lib/ai/chat-retrieval-pipeline'
import { cn } from '@/lib/utils'
import {
  PromptInputChatMentionTextarea,
  type PromptInputChatMentionTextareaHandle,
  PromptInputChatReferenceChips,
  type PromptInputChatReference
} from '@/features/ai/prompt-input'
import {
  NoteLabModelPicker,
  DEFAULT_NOTELAB_MODEL_ID,
  LOCAL_MODEL_PREFIX
} from '@/features/ai/model-selector'
import {
  LocalModelSetupPanel,
  hasLocalEmbeddingModel,
  isLocalEmbeddingOnlyModel,
  LOCAL_EMBEDDING_MODEL
} from '@/features/ai/LocalModelSetupDialog'
import { Action, Actions } from '@/features/ai/actions'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/features/ai/conversation'
import { Message, MessageActions, MessageContent, MessageResponse } from '@/features/ai/message'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/features/ai/sources'
import { Suggestion, Suggestions } from '@/features/ai/suggestion'
import { InputGroup, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { copyPlainTextToClipboard } from '@/lib/core/copy-to-clipboard'
import { searchChatHistorySessions } from '@/lib/notes/notes-search'
import { DEFAULT_WORKSPACE_ID, type SavedNote } from '@/lib/notes/notes-storage'
import { ChatSidebarPanelTabs } from '@/features/notes/chat/ChatSidebarPanelTabs'
import {
  ChatSidebarNewChatButton,
  ChatSidebarToolbarLeading,
  ChatSidebarTopBar
} from '@/features/notes/chat/chat-sidebar-chrome'
import { STARTER_SUGGESTIONS } from '@/features/notes/chat/chat-sidebar-constants'
import { BidirectionalLinksPanel } from '@/features/notes/chat/BidirectionalLinksPanel'
import { ChatSidebarOpenSessionTabs, HistoryItem } from '@/features/notes/chat/chat-sidebar-panels'
import type {
  ChatSidebarLinkMode,
  ChatSidebarProps,
  NoteLinksData
} from '@/features/notes/chat/chat-sidebar-types'
import type { ChatHistoryMeta, ChatPipelineStatus } from '@/hooks/useNotesChat'
import { useNotesChat } from '@/hooks/useNotesChat'
import { useBillingStatus } from '@/hooks/useBillingStatus'
import { useOllama } from '@/hooks/useOllama'

function formatModeLabel(mode: Mode): string {
  return mode === 'efficiency' ? 'Efficiency' : mode === 'medium' ? 'Medium' : 'High'
}

function pipelineHeadline(status: ChatPipelineStatus): string {
  switch (status.stage) {
    case 'analyzing':
      return 'Analyzing query...'
    case 'searching':
      return 'Searching all notes...'
    case 'seed-results':
      return `Found ${status.seedNotes.length} seed notes`
    case 'expanding':
      return 'Expanding connections...'
    case 'connected-results':
      return `${status.connectedNotes.length} connected notes found`
    case 'reranking':
      return 'Re-ranking results...'
    case 'context-ready':
      return `Context ready (${status.finalNotes.length} notes)`
  }
}

function PipelineNoteChips({
  notes,
  onOpenNote
}: {
  notes: ChatPipelineStatus['seedNotes']
  onOpenNote: (notePath: string) => void
}): JSX.Element | null {
  if (notes.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {notes.map((note) => (
        <button
          key={`${note.source}-${note.note}`}
          className="bg-background hover:bg-accent/60 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium transition-colors"
          onClick={() => onOpenNote(note.note)}
          type="button"
        >
          <span className="truncate max-w-[10rem]">{note.title}</span>
          {note.source === 'global_fallback' ? (
            <span className="bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold dark:bg-amber-500/15 dark:text-amber-300">
              global
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

/** Chat UI; parent animates width/opacity when `open` toggles. */
export function ChatSidebarInner({
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
  linkMentionIndex
}: ChatSidebarProps): JSX.Element {
  const MODE_OPTIONS: Mode[] = ['efficiency', 'medium', 'high']
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_NOTELAB_MODEL_ID)
  const [localSetupOpen, setLocalSetupOpen] = useState(false)
  const [modeOverride, setModeOverride] = useState<Mode | null>(null)

  const ollama = useOllama()

  /* eslint-disable react-hooks/set-state-in-effect -- correct invalid local model pick when Ollama model list updates */
  useEffect(() => {
    if (!selectedModelId.startsWith(LOCAL_MODEL_PREFIX)) return
    const name = selectedModelId.slice(LOCAL_MODEL_PREFIX.length)
    if (!isLocalEmbeddingOnlyModel(name)) return
    const firstChat = ollama.localModels.find((m) => !isLocalEmbeddingOnlyModel(m.name))
    setSelectedModelId(
      firstChat ? `${LOCAL_MODEL_PREFIX}${firstChat.name}` : DEFAULT_NOTELAB_MODEL_ID
    )
  }, [selectedModelId, ollama.localModels])
  /* eslint-enable react-hooks/set-state-in-effect */

  const {
    session,
    historyMeta,
    isLoading,
    pipelineStatus,
    filterWorkspaceId,
    setFilterWorkspaceId,
    setShowHistory,
    sendMessage,
    persistCurrentSessionIfNeeded,
    newChat,
    loadHistorySession
  } = useNotesChat({
    notes,
    folders,
    workspacePath,
    selectedNote,
    linkMentionIndex,
    modelId: selectedModelId
  })

  const { billing, canChat, creditsLow } = useBillingStatus()

  const isUnpaidUser = !billing || billing.status !== 'active'
  const isLocalModelSelected = selectedModelId.startsWith(LOCAL_MODEL_PREFIX)
  const canChatEffective = canChat || (isLocalModelSelected && (ollama.status?.running ?? false))

  const [input, setInput] = useState('')
  const [chatReferences, setChatReferences] = useState<PromptInputChatReference[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [chatTab, setChatTab] = useState<'chat' | 'history'>('chat')
  const [openSessionTabs, setOpenSessionTabs] = useState<
    Array<{ sessionId: string; title: string }>
  >([])
  const textareaRef = useRef<PromptInputChatMentionTextareaHandle>(null)
  const hasTriggeredAutoIndexRef = useRef(false)

  const workspacesForMentions = useMemo(() => {
    const map = new Map(folders.map((f) => [f.folder, { folder: f.folder, name: f.name }]))
    if (!map.has(DEFAULT_WORKSPACE_ID)) {
      map.set(DEFAULT_WORKSPACE_ID, { folder: DEFAULT_WORKSPACE_ID, name: 'Root' })
    }
    return Array.from(map.values())
  }, [folders])

  const suggestedMode = useMemo(() => classifyQueryComplexity(input), [input])
  const activeMode = modeOverride ?? suggestedMode

  const visibleSessionTabs = useMemo(() => {
    if (openSessionTabs.length === 0) {
      return [{ sessionId: session.id, title: session.title }]
    }
    return openSessionTabs.map((t) =>
      t.sessionId === session.id ? { ...t, title: session.title } : t
    )
  }, [openSessionTabs, session.id, session.title])

  /* eslint-disable react-hooks/set-state-in-effect -- reset chat chrome when parent switches to links panel */
  useEffect(() => {
    if (panel !== 'links') return
    setChatTab('chat')
    setShowHistory(false)
    setLocalSetupOpen(false)
  }, [panel, setShowHistory])
  /* eslint-enable react-hooks/set-state-in-effect */

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

    if (linkMentionIndex) {
      const valid = linkMentionIndex.validPaths
      const outgoingMap = new Map<
        string,
        { note: SavedNote; contexts: string[]; linkText: string[] }
      >()
      for (const m of linkMentionIndex.outgoingBySource.get(selectedNote.path) ?? []) {
        if (!valid.has(m.target) || m.target === selectedNote.path) continue
        const targetNote = noteById.get(m.target)
        if (!targetNote) continue
        const existing = outgoingMap.get(targetNote.path)
        if (existing) {
          if (m.contextText && !existing.contexts.includes(m.contextText)) {
            existing.contexts.push(m.contextText)
          }
          if (m.linkText && !existing.linkText.includes(m.linkText)) {
            existing.linkText.push(m.linkText)
          }
          continue
        }
        outgoingMap.set(targetNote.path, {
          note: targetNote,
          contexts: m.contextText ? [m.contextText] : [],
          linkText: m.linkText ? [m.linkText] : []
        })
      }

      const rawBack = linkMentionIndex.backlinksByTarget.get(selectedNote.path) ?? []
      const limitedBySource = new Map<string, typeof rawBack>()
      for (const m of rawBack) {
        if (m.source === selectedNote.path) continue
        const arr = limitedBySource.get(m.source) ?? []
        if (arr.length < 6) arr.push(m)
        limitedBySource.set(m.source, arr)
      }
      const backlinks = new Map<string, { note: SavedNote; contexts: string[] }>()
      for (const [sourcePath, mentions] of limitedBySource) {
        const srcNote = noteById.get(sourcePath)
        if (!srcNote || srcNote.kind !== 'note') continue
        const contexts: string[] = []
        for (const m of mentions) {
          if (m.contextText && !contexts.includes(m.contextText)) contexts.push(m.contextText)
        }
        backlinks.set(srcNote.path, { note: srcNote, contexts })
      }

      return {
        backlinks: Array.from(backlinks.values()).sort(
          (a, b) => b.note.updatedAt - a.note.updatedAt
        ),
        outgoing: Array.from(outgoingMap.values()).sort(
          (a, b) => b.note.updatedAt - a.note.updatedAt
        )
      }
    }

    return { backlinks: [], outgoing: [] }
  }, [notes, selectedNote, linkMentionIndex])

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
      const modeForRequest = activeMode
      setModeOverride(null)
      await sendMessage(q, { explicitNoteIds, explicitWorkspaceIds, mode: modeForRequest })
    },
    [input, chatReferences, isLoading, canChatEffective, sendMessage, activeMode]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      console.error('[ChatSidebar] copy failed', err)
    })
  }, [])

  const onNewChat = useCallback(async () => {
    if (session.messages.length === 0) return
    const priorId = session.id
    const priorTitle = session.title
    const fresh = await newChat()
    setOpenSessionTabs((prev) => {
      const base = prev.length > 0 ? prev : [{ sessionId: priorId, title: priorTitle }]
      if (base.some((t) => t.sessionId === fresh.id)) return base
      return [...base, { sessionId: fresh.id, title: fresh.title }]
    })
  }, [session.id, session.title, session.messages.length, newChat])

  const handleOpenHistoryItem = useCallback(
    async (meta: ChatHistoryMeta) => {
      const priorId = session.id
      const priorTitle = session.title
      await persistCurrentSessionIfNeeded()
      await loadHistorySession(meta)
      setChatTab('chat')
      setOpenSessionTabs((prev) => {
        const base = prev.length > 0 ? prev : [{ sessionId: priorId, title: priorTitle }]
        if (base.some((t) => t.sessionId === meta.sessionId)) {
          return base.map((t) => (t.sessionId === meta.sessionId ? { ...t, title: meta.title } : t))
        }
        return [...base, { sessionId: meta.sessionId, title: meta.title }]
      })
    },
    [session.id, session.title, persistCurrentSessionIfNeeded, loadHistorySession]
  )

  const selectOpenSessionTab = useCallback(
    async (sessionId: string) => {
      if (sessionId === session.id) return
      await persistCurrentSessionIfNeeded()
      const fromTabs = visibleSessionTabs.find((t) => t.sessionId === sessionId)
      const meta: ChatHistoryMeta = historyMeta.find((m) => m.sessionId === sessionId) ?? {
        sessionId,
        title: fromTabs?.title ?? 'Chat',
        createdAt: Date.now(),
        messageCount: 0
      }
      await loadHistorySession(meta)
    },
    [session.id, persistCurrentSessionIfNeeded, visibleSessionTabs, historyMeta, loadHistorySession]
  )

  const closeOpenSessionTab = useCallback(
    async (e: MouseEvent, sessionId: string) => {
      e.stopPropagation()
      const sourceTabs = openSessionTabs.length > 0 ? openSessionTabs : visibleSessionTabs
      if (sourceTabs.length <= 1) return
      if (sessionId === session.id && session.messages.length > 0) {
        await persistCurrentSessionIfNeeded()
      }
      const idx = sourceTabs.findIndex((t) => t.sessionId === sessionId)
      const nextTabs = sourceTabs.filter((t) => t.sessionId !== sessionId)
      setOpenSessionTabs(nextTabs)
      if (sessionId !== session.id) return
      const pick = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0]
      const meta: ChatHistoryMeta = historyMeta.find((m) => m.sessionId === pick.sessionId) ?? {
        sessionId: pick.sessionId,
        title: pick.title,
        createdAt: Date.now(),
        messageCount: 0
      }
      await loadHistorySession(meta)
    },
    [
      openSessionTabs,
      visibleSessionTabs,
      session.id,
      session.messages.length,
      persistCurrentSessionIfNeeded,
      historyMeta,
      loadHistorySession
    ]
  )

  const paywallBanner = (() => {
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

  const chatTabStrip = (
    <ChatSidebarPanelTabs
      leading={
        panel === 'chat' ? <ChatSidebarNewChatButton onClick={() => void onNewChat()} /> : undefined
      }
      items={[
        { value: 'chat', label: 'Chat', icon: BotIcon },
        { value: 'history', label: 'History', icon: History }
      ]}
      onValueChange={(v) => {
        const next = v as 'chat' | 'history'
        setChatTab(next)
        if (next !== 'history') setHistorySearch('')
      }}
      value={chatTab}
    />
  )

  const linkTabStrip = (
    <ChatSidebarPanelTabs
      items={[
        { value: 'linked', label: 'Linked', icon: Link2Icon },
        { value: 'linking', label: 'Linking', icon: PlusIcon }
      ]}
      onValueChange={(v) => onLinkModeChange(v as ChatSidebarLinkMode)}
      value={linkMode}
      variant="segmented"
    />
  )

  if (panel === 'chat' && localSetupOpen) {
    return (
      <aside
        aria-label="Local model setup"
        className="border-border bg-background flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <ChatSidebarTopBar isMacNotelab={isMacNotelab} tabs={chatTabStrip} />
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

  const inputPlaceholder = (() => {
    if (!canChatEffective) {
      if (isLocalModelSelected) return 'Start Ollama server to chat…'
      return 'Subscription required…'
    }
    return 'Ask about your notes…'
  })()

  const showSeedNotes =
    pipelineStatus &&
    (pipelineStatus.stage === 'seed-results' ||
      pipelineStatus.stage === 'expanding' ||
      pipelineStatus.stage === 'connected-results' ||
      pipelineStatus.stage === 'reranking' ||
      pipelineStatus.stage === 'context-ready')

  const showConnectedNotes =
    pipelineStatus &&
    (pipelineStatus.stage === 'connected-results' ||
      pipelineStatus.stage === 'reranking' ||
      pipelineStatus.stage === 'context-ready')

  const showFinalNotes = pipelineStatus?.stage === 'context-ready'

  return (
    <aside
      aria-label="Chat"
      className="border-border bg-background relative flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <ChatSidebarTopBar
        isMacNotelab={isMacNotelab}
        leading={
          panel === 'chat' && (folders.length > 0 || chatTab === 'history') ? (
            <ChatSidebarToolbarLeading
              filterWorkspaceId={filterWorkspaceId}
              folders={folders}
              historySearch={historySearch}
              setFilterWorkspaceId={setFilterWorkspaceId}
              setHistorySearch={setHistorySearch}
              showHistory={chatTab === 'history'}
            />
          ) : null
        }
        tabs={panel === 'chat' ? chatTabStrip : linkTabStrip}
        tabsFill={panel === 'links'}
        trailing={null}
      />
      {panel === 'chat' ? (
        <ChatSidebarOpenSessionTabs
          activeSessionId={session.id}
          isMacNotelab={isMacNotelab}
          onClose={closeOpenSessionTab}
          onSelect={selectOpenSessionTab}
          tabs={visibleSessionTabs}
        />
      ) : null}
      {panel === 'links' ? (
        <BidirectionalLinksPanel
          foldersById={workspacesById}
          mode={linkMode}
          noteLinkData={noteLinkData}
          onOpenNote={selectNote}
          selectedNote={selectedNote}
        />
      ) : chatTab === 'history' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-2">
            {historyMeta.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-xs">
                No saved sessions yet.
              </p>
            ) : historySearchResults.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-xs">
                No matching sessions.
              </p>
            ) : (
              <ul className="space-y-1">
                {historySearchResults.map(({ meta, titleSegments }) => (
                  <HistoryItem
                    key={meta.sessionId}
                    meta={meta}
                    onLoad={handleOpenHistoryItem}
                    titleSegments={titleSegments}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <>
          {isLocalModelSelected &&
            ollama.status?.running &&
            !ollama.modelsLoading &&
            !hasLocalEmbeddingModel(ollama.localModels) && (
              <div className="border-border shrink-0 border-b bg-muted/30 px-2 py-1.5">
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

          {session.messages.length === 0 && canChatEffective && (
            <div className="px-2 pb-1">
              <Suggestions>
                {STARTER_SUGGESTIONS.map((s) => (
                  <Suggestion key={s} onClick={handleSuggestion} suggestion={s} />
                ))}
              </Suggestions>
            </div>
          )}

          {paywallBanner}

          <form className="border-border border-t p-2" onSubmit={(e) => void handleSubmit(e)}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Retrieval
                </span>
                <span className="text-muted-foreground text-xs">
                  Suggested: <span className="text-foreground">{formatModeLabel(suggestedMode)}</span>
                </span>
              </div>
              <div className="bg-muted/50 inline-flex rounded-lg border border-border p-0.5">
                {MODE_OPTIONS.map((mode) => {
                  const isSelected = activeMode === mode
                  const isSuggested = suggestedMode === mode
                  return (
                    <button
                      key={mode}
                      className={cn(
                        'relative rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                        isSelected
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                        isSuggested && !isSelected && 'ring-1 ring-primary/30'
                      )}
                      disabled={isLoading || !canChatEffective}
                      onClick={() => setModeOverride(mode === suggestedMode ? null : mode)}
                      type="button"
                    >
                      {formatModeLabel(mode)}
                      {isSuggested ? (
                        <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          auto
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>

            {pipelineStatus ? (
              <div className="bg-muted/35 mb-2 rounded-2xl border border-border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Loader2Icon className="text-muted-foreground size-3.5 animate-spin" />
                  <p className="text-sm font-medium">{pipelineHeadline(pipelineStatus)}</p>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {formatModeLabel(pipelineStatus.mode)} mode
                  {pipelineStatus.mode !== pipelineStatus.suggestedMode
                    ? ` (override from ${formatModeLabel(pipelineStatus.suggestedMode)})`
                    : ''}
                </p>
                {showSeedNotes ? (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                      Seed notes
                    </p>
                    <PipelineNoteChips notes={pipelineStatus.seedNotes} onOpenNote={selectNote} />
                  </div>
                ) : null}
                {showConnectedNotes ? (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                      Connected notes
                    </p>
                    <PipelineNoteChips notes={pipelineStatus.connectedNotes} onOpenNote={selectNote} />
                  </div>
                ) : null}
                {showFinalNotes ? (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                      Final context
                    </p>
                    <PipelineNoteChips notes={pipelineStatus.finalNotes} onOpenNote={selectNote} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <PromptInputChatReferenceChips
              className="mb-1.5"
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
                className="max-h-40 min-h-14 resize-none text-sm"
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
              <InputGroupAddon align="block-end" className="flex flex-wrap items-center gap-1.5">
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
                <div className="ml-auto flex min-w-0 items-center gap-1.5">
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
                    className="rounded-md"
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

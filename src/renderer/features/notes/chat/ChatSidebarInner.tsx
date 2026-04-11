import {
  AlertCircleIcon,
  ArrowUpIcon,
  BotIcon,
  CopyIcon,
  FileTextIcon,
  History,
  Link2Icon,
  Loader2Icon,
  PaperclipIcon,
  PlusIcon,
  ScanTextIcon
} from 'lucide-react'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  PromptInputChatMentionTextarea,
  type PromptInputChatMentionTextareaHandle,
  PromptInputChatReferenceChips,
  type PromptInputChatReference
} from '@/features/ai/prompt-input'
import {
  NoteLabModelPicker,
  DEFAULT_NOTELAB_MODEL_ID,
  NOTELAB_MODELS,
  LOCAL_MODEL_PREFIX
} from '@/features/ai/model-selector'
import {
  LocalModelSetupPanel,
  hasLocalEmbeddingModel,
  isLocalEmbeddingOnlyModel,
  LOCAL_EMBEDDING_MODEL
} from '@/features/ai/LocalModelSetupDialog'
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTrigger
} from '@/features/ai/context'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/features/ai/conversation'
import { Message, MessageActions, MessageContent, MessageResponse } from '@/features/ai/message'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/features/ai/sources'
import { Suggestion, Suggestions } from '@/features/ai/suggestion'
import { Action, Actions } from '@/features/ai/actions'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
import { classifyQueryComplexity, type Mode } from '@/lib/ai/chat-retrieval-pipeline'

const DEV_UI_PREVIEW = import.meta.env.VITE_ENV === 'development'

function formatModeLabel(mode: Mode): string {
  return mode === 'efficiency' ? 'Efficiency' : mode === 'medium' ? 'Medium' : 'High'
}

const seedNoteDescriptions = [
  'Finding relevant notes from your workspace',
  'Locating notes with matching keywords',
  'Searching your note collection',
  'Discovering related notes',
  'Fetching potential matches'
]

const connectedNoteDescriptions = [
  'Expanding through bidirectional links',
  'Following connections between notes',
  'Mapping linked references',
  'Finding connected properties',
  'Traversing note relationships'
]

const finalContextDescriptions = [
  'Curating final context for response',
  'Preparing notes for the model',
  'Compiling context window',
  'Building response context',
  'Assembling relevant notes'
]

function getRandomDescription(descriptions: string[]): string {
  return descriptions[Math.floor(Math.random() * descriptions.length)]
}

function estimateTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.ceil(trimmed.length / 4)
}

function estimateContextUsage(args: {
  input: string
  references: PromptInputChatReference[]
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}): number {
  const messageBudget = args.messages
    .slice(-10)
    .reduce((total, message) => total + estimateTokenCount(message.content), 0)
  const inputBudget = estimateTokenCount(args.input)
  const referenceBudget = args.references.reduce((total, reference) => {
    const label = `${reference.label ?? ''} ${reference.refId ?? ''}`.trim()
    return total + estimateTokenCount(label)
  }, 0)
  return messageBudget + inputBudget + referenceBudget + 256
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

function PipelineProgressSources({
  status,
  onOpenNote
}: {
  status: ChatPipelineStatus
  onOpenNote: (notePath: string) => void
}): JSX.Element {
  const showSeedNotes =
    status.stage === 'seed-results' ||
    status.stage === 'expanding' ||
    status.stage === 'connected-results' ||
    status.stage === 'reranking' ||
    status.stage === 'context-ready'

  const showConnectedNotes =
    status.stage === 'connected-results' ||
    status.stage === 'reranking' ||
    status.stage === 'context-ready'

  const showFinalNotes = status.stage === 'context-ready'

  const seedDescription = useMemo(() => getRandomDescription(seedNoteDescriptions), [])
  const connectedDescription = useMemo(() => getRandomDescription(connectedNoteDescriptions), [])
  const finalDescription = useMemo(() => getRandomDescription(finalContextDescriptions), [])

  return (
    <div className="mb-0 mt-2">
      <div className="flex items-center gap-2 text-xs text-foreground/90">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-medium">{pipelineHeadline(status)}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatModeLabel(status.mode)} mode
            {status.mode !== status.suggestedMode
              ? `, overriding ${formatModeLabel(status.suggestedMode)}`
              : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {showSeedNotes && status.seedNotes.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground">{seedDescription}</p>
            <p className="text-xs font-medium">Found {status.seedNotes.length} seed notes</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {status.seedNotes.map((note) => (
                <button
                  key={`seed-${note.note}`}
                  className="flex items-center gap-2 text-left text-xs hover:text-foreground"
                  onClick={() => onOpenNote(note.note)}
                  type="button"
                >
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{note.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {showConnectedNotes && status.connectedNotes.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground">{connectedDescription}</p>
            <p className="text-xs font-medium">{status.connectedNotes.length} connected notes</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {status.connectedNotes.map((note) => (
                <button
                  key={`connected-${note.note}`}
                  className="flex items-center gap-2 text-left text-xs hover:text-foreground"
                  onClick={() => onOpenNote(note.note)}
                  type="button"
                >
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{note.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {showFinalNotes && status.finalNotes.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground">{finalDescription}</p>
            <p className="text-xs font-medium">{status.finalNotes.length} notes in context</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {status.finalNotes.map((note) => (
                <button
                  key={`final-${note.note}`}
                  className="flex items-center gap-2 text-left text-xs hover:text-foreground"
                  onClick={() => onOpenNote(note.note)}
                  type="button"
                >
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{note.title}</span>
                  {note.source === 'global_fallback' && (
                    <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      global
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const DEV_PREVIEW_STATUS: ChatPipelineStatus = {
  stage: 'context-ready',
  mode: 'high',
  suggestedMode: 'high',
  seedNotes: [
    { note: 'preview-roadmap', title: '2026 Product Roadmap', source: 'seed' },
    { note: 'preview-architecture', title: 'RAG Architecture Notes', source: 'seed' }
  ],
  connectedNotes: [
    { note: 'preview-links', title: 'Bidirectional Linking Experiments', source: 'connected' },
    { note: 'preview-context', title: 'Context Packing Ideas', source: 'connected' }
  ],
  finalNotes: [
    { note: 'preview-roadmap', title: '2026 Product Roadmap', source: 'connected' },
    { note: 'preview-context', title: 'Context Packing Ideas', source: 'connected' },
    { note: 'preview-global', title: 'Cross-workspace Synthesis', source: 'global_fallback' }
  ]
}

const DEV_PREVIEW_PROCESSING_STATUS: ChatPipelineStatus = {
  stage: 'reranking',
  mode: 'medium',
  suggestedMode: 'medium',
  seedNotes: [{ note: 'preview-seed', title: 'Meeting Notes - Search Tuning', source: 'seed' }],
  connectedNotes: [
    { note: 'preview-neighbor', title: 'Connected Notes UI Sketches', source: 'connected' }
  ],
  finalNotes: []
}

const DEV_PREVIEW_MARKDOWN = `### Retrieval Preview

- Compare roadmap themes across linked notes
- Blend graph neighbors with global fallback
- Keep the pipeline state visible after completion

> This mock response only appears in development so the chat UI can be styled quickly.`

function ModePicker({
  activeMode,
  suggestedMode,
  disabled,
  onModeChange
}: {
  activeMode: Mode
  suggestedMode: Mode
  disabled: boolean
  onModeChange: (mode: Mode | null) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const modeDescriptions: Record<Mode, string> = {
    efficiency: 'Fastest path with the smallest seed and context set.',
    medium: 'Balanced retrieval depth for most note questions.',
    high: 'Broadest graph expansion and reranked context set.'
  }
  const options: Mode[] = ['efficiency', 'medium', 'high']

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          aria-label="Select retrieval mode"
          className="pointer-events-auto min-w-0 max-w-[120px] shrink-0 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          disabled={disabled}
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="truncate">{formatModeLabel(activeMode)}</span>
        </InputGroupButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[250px] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
        side="top"
        sideOffset={6}
      >
        <Command>
          <CommandList className="max-h-[260px]">
            <CommandGroup heading={`Suggested: ${formatModeLabel(suggestedMode)}`}>
              {options.map((mode) => {
                const isSelected = activeMode === mode
                const isSuggested = suggestedMode === mode
                return (
                  <CommandItem
                    key={mode}
                    onSelect={() => {
                      onModeChange(mode === suggestedMode ? null : mode)
                      setOpen(false)
                    }}
                    value={mode}
                    className="gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{formatModeLabel(mode)}</span>
                        {isSuggested && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            auto
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                        {modeDescriptions[mode]}
                      </p>
                    </div>
                    {isSelected && <span className="size-3 shrink-0" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PaywallBanner({
  billing,
  creditsLow,
  isLocalModelSelected,
  ollamaRunning,
  onOpenLocalSetup
}: {
  billing: { status: string; overageEnabled?: boolean } | null
  creditsLow: boolean
  isLocalModelSelected: boolean
  ollamaRunning: boolean
  onOpenLocalSetup: () => void
}): JSX.Element | null {
  if (isLocalModelSelected && ollamaRunning) return null

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
          onClick={onOpenLocalSetup}
          type="button"
        >
          Use local models →
        </button>
      </div>
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
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_NOTELAB_MODEL_ID)
  const [localSetupOpen, setLocalSetupOpen] = useState(false)
  const [modeOverride, setModeOverride] = useState<Mode | null>(null)

  const ollama = useOllama()

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
  const [currentRequestRefs, setCurrentRequestRefs] = useState<PromptInputChatReference[]>([])
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
  const selectedCloudModel = useMemo(
    () =>
      selectedModelId.startsWith(LOCAL_MODEL_PREFIX)
        ? null
        : (NOTELAB_MODELS.find((model) => model.id === selectedModelId) ?? null),
    [selectedModelId]
  )
  const contextLimitTokens = selectedCloudModel?.contextWindowTokens ?? 128_000

  const visibleSessionTabs = useMemo(() => {
    if (openSessionTabs.length === 0) {
      return [{ sessionId: session.id, title: session.title }]
    }
    return openSessionTabs.map((t) =>
      t.sessionId === session.id ? { ...t, title: session.title } : t
    )
  }, [openSessionTabs, session.id, session.title])

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
      setCurrentRequestRefs(chatReferences)
      setInput('')
      setChatReferences([])
      const modeForRequest = activeMode
      setModeOverride(null)
      await sendMessage(q, { explicitNoteIds, explicitWorkspaceIds, mode: modeForRequest })
    },
    [input, chatReferences, isLoading, canChatEffective, sendMessage, activeMode]
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
    async (e: React.MouseEvent, sessionId: string) => {
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
      {panel === 'chat' && (
        <ChatSidebarOpenSessionTabs
          activeSessionId={session.id}
          isMacNotelab={isMacNotelab}
          onClose={closeOpenSessionTab}
          onSelect={selectOpenSessionTab}
          tabs={visibleSessionTabs}
        />
      )}
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
                DEV_UI_PREVIEW ? (
                  <>
                    <Message from="user">
                      <MessageContent>
                        <p>How do the roadmap notes connect to the search architecture docs?</p>
                      </MessageContent>
                      <PipelineProgressSources
                        onOpenNote={selectNote}
                        status={DEV_PREVIEW_PROCESSING_STATUS}
                      />
                    </Message>
                    <Message from="assistant">
                      <MessageContent>
                        <MessageResponse>{DEV_PREVIEW_MARKDOWN}</MessageResponse>
                      </MessageContent>
                      <PipelineProgressSources
                        onOpenNote={selectNote}
                        status={DEV_PREVIEW_STATUS}
                      />
                      <Sources className="mt-1">
                        <SourcesTrigger count={3} />
                        <SourcesContent>
                          {DEV_PREVIEW_STATUS.finalNotes.map((src) => (
                            <Source
                              key={src.note}
                              href="#"
                              onClick={(e) => {
                                e.preventDefault()
                              }}
                              title={src.title}
                            />
                          ))}
                        </SourcesContent>
                      </Sources>
                    </Message>
                  </>
                ) : (
                  <ConversationEmptyState
                    description="Ask anything about your notes"
                    icon={<BotIcon className="size-8" />}
                    title="Chat with your notes"
                  />
                )
              ) : (
                session.messages.map((msg, index) => {
                  const visibleSources =
                    msg.role === 'assistant' && msg.sources
                      ? msg.sources.filter((s) => validNoteIds.has(s.note))
                      : []
                  const prevMsg = session.messages[index - 1]
                  const isFirstAssistantMsg =
                    isLoading && msg.role === 'assistant' && index === session.messages.length - 1

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

                      {prevMsg?.role === 'user' &&
                        (isFirstAssistantMsg && pipelineStatus ? (
                          <PipelineProgressSources
                            onOpenNote={selectNote}
                            status={pipelineStatus}
                          />
                        ) : msg.pipelineStatus ? (
                          <PipelineProgressSources
                            onOpenNote={selectNote}
                            status={msg.pipelineStatus}
                          />
                        ) : currentRequestRefs.length > 0 && msg.content ? (
                          <div className="mb-0 mt-2">
                            <div className="flex items-center gap-2 text-xs text-foreground/90">
                              <div className="flex min-w-0 flex-1 flex-col">
                                <p className="font-medium">References ready</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {currentRequestRefs.filter((r) => r.kind === 'note').length} note
                                  {currentRequestRefs.filter((r) => r.kind === 'note').length !== 1
                                    ? 's'
                                    : ''}{' '}
                                  in context
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null)}
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

          <PaywallBanner
            billing={billing}
            creditsLow={creditsLow}
            isLocalModelSelected={isLocalModelSelected}
            ollamaRunning={ollama.status?.running ?? false}
            onOpenLocalSetup={() => setLocalSetupOpen(true)}
          />

          <form className="border-border border-t p-2" onSubmit={(e) => void handleSubmit(e)}>
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
                  <ModePicker
                    activeMode={activeMode}
                    disabled={isLoading || !canChatEffective}
                    onModeChange={setModeOverride}
                    suggestedMode={suggestedMode}
                  />
                  <NoteLabModelPicker
                    selectedModelId={selectedModelId}
                    onModelChange={setSelectedModelId}
                    localModels={ollama.localModels}
                    ollamaRunning={ollama.status?.running ?? false}
                    onOpenLocalSetup={() => setLocalSetupOpen(true)}
                    localOnly={isUnpaidUser && !canChat}
                  />
                  <Separator className="!h-4" orientation="vertical" />
                  <Context
                    maxTokens={contextLimitTokens}
                    modelId={
                      selectedCloudModel
                        ? `${selectedCloudModel.providerSlug}/${selectedCloudModel.id}`
                        : undefined
                    }
                    usedTokens={Math.min(
                      estimateContextUsage({
                        input,
                        references: chatReferences,
                        messages: session.messages.map((message) => ({
                          role: message.role,
                          content: message.content
                        }))
                      }),
                      contextLimitTokens
                    )}
                  >
                    <ContextTrigger
                      className="h-7 gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      size="sm"
                    />
                    <ContextContent align="end" className="w-[240px]" side="top" sideOffset={8}>
                      <ContextContentHeader />
                      <ContextContentBody className="space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Model</span>
                          <span className="text-right">
                            {selectedCloudModel?.name ??
                              (selectedModelId.startsWith(LOCAL_MODEL_PREFIX)
                                ? 'Local model'
                                : 'Unknown')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Window</span>
                          <span>{selectedCloudModel?.contextWindow ?? '128K'}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Estimated from the current draft, recent chat turns, and referenced notes.
                        </p>
                      </ContextContentBody>
                    </ContextContent>
                  </Context>
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

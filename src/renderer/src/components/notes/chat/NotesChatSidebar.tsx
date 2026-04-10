import {
  AlertCircleIcon,
  BookOpenIcon,
  BotIcon,
  CopyIcon,
  History,
  Link2Icon,
  Loader2Icon,
  ArrowUpIcon,
  PaperclipIcon,
  PlusIcon,
  ScanTextIcon,
  Search,
  X
} from 'lucide-react'
import {
  type JSX,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

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
import { ChatSidebarPanelTabs } from '@/components/notes/chat/ChatSidebarPanelTabs'
import {
  macTitlebarStyles,
  NOTES_APP_PILL_ROUNDED,
  NOTES_APP_PILL_SURFACE
} from '@/components/notes/notes-app-utils'
import { toolbarChromeFieldClass } from '@/lib/platform/toolbar-chrome'
import type { ChatHistoryMeta } from '@/hooks/useNotesChat'
import { useNotesChat } from '@/hooks/useNotesChat'
import { useBillingStatus } from '@/hooks/useBillingStatus'
import { useOllama } from '@/hooks/useOllama'
import type { NotesAppViewModel } from '@/components/notes/app-state/useNotesApp'
import type { WorkspaceLinkMentionIndex } from '@/lib/notes/cache/notes-cache-types'

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
  /** macOS: pointer-events / no-drag on chat chrome controls. */
  isMacNotelab?: boolean
  /** Precomputed internal links (Dexie cache); omit to scan Lexical in-memory. */
  linkMentionIndex?: WorkspaceLinkMentionIndex | null
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

const CHAT_SIDEBAR_WIDTH_LS_KEY = 'notelab:chat-sidebar-width-px'
const CHAT_SIDEBAR_DEFAULT_WIDTH_PX = 440
const CHAT_SIDEBAR_MIN_WIDTH_PX = 300
const CHAT_SIDEBAR_MAX_WIDTH_PX = 900

function clampChatSidebarWidth(w: number): number {
  return Math.round(Math.min(CHAT_SIDEBAR_MAX_WIDTH_PX, Math.max(CHAT_SIDEBAR_MIN_WIDTH_PX, w)))
}

/** macOS: row uses `pointer-events-none` so the window drag band receives hits; interactive chrome opts back in. */
function ChatSidebarMacHitLayer({
  isMacNotelab,
  className,
  children
}: {
  isMacNotelab?: boolean
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div
      className={cn(className, isMacNotelab && 'pointer-events-auto')}
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      {children}
    </div>
  )
}

/** Full-height title strip (h-12): workspace / history search → icon tabs → actions. */
function ChatSidebarTopBar({
  isMacNotelab,
  leading,
  tabs,
  trailing,
  tabsFill
}: {
  isMacNotelab?: boolean
  /** Workspace filter or history search; omit when empty (e.g. links panel). */
  leading?: ReactNode
  tabs: ReactNode
  trailing?: ReactNode | null
  /** When true, tab strip grows to full row width (links Linked / Linking). */
  tabsFill?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'border-border relative z-10 flex h-12 min-h-12 w-full shrink-0 items-center gap-2 border-b px-2',
        isMacNotelab && 'pointer-events-none'
      )}
    >
      {leading != null ? (
        <div className="min-w-0 flex-1">
          <ChatSidebarMacHitLayer isMacNotelab={isMacNotelab} className="min-w-0 w-full">
            {leading}
          </ChatSidebarMacHitLayer>
        </div>
      ) : null}
      <ChatSidebarMacHitLayer
        isMacNotelab={isMacNotelab}
        className={tabsFill ? 'min-w-0 flex-1' : 'shrink-0'}
      >
        {tabs}
      </ChatSidebarMacHitLayer>
      {trailing != null ? (
        <ChatSidebarMacHitLayer isMacNotelab={isMacNotelab} className="shrink-0">
          {trailing}
        </ChatSidebarMacHitLayer>
      ) : null}
    </div>
  )
}

function ChatSidebarNewChatButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="text-muted-foreground size-7 shrink-0 rounded-md"
            onClick={onClick}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-3.5" aria-hidden />
            <span className="sr-only">New chat</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>New chat</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Workspace filter or history search only (no tab strip / new chat). */
function ChatSidebarToolbarLeading({
  folders,
  filterWorkspaceId,
  setFilterWorkspaceId,
  showHistory,
  historySearch,
  setHistorySearch
}: {
  folders: Folder[]
  filterWorkspaceId: string | null
  setFilterWorkspaceId: (id: string | null) => void
  showHistory: boolean
  historySearch: string
  setHistorySearch: (v: string) => void
}): JSX.Element | null {
  if (showHistory) {
    return (
      <div className={cn(toolbarChromeFieldClass, 'min-w-0 max-w-full')}>
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 opacity-70"
        />
        <Input
          aria-label="Search chat history"
          className="h-7 w-full min-w-0 flex-1 border-0 bg-transparent pl-8 pr-2 text-xs shadow-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0"
          onChange={(e) => setHistorySearch(e.target.value)}
          placeholder="Search history…"
          type="search"
          value={historySearch}
        />
      </div>
    )
  }
  if (folders.length > 0) {
    return (
      <div className={cn(toolbarChromeFieldClass, 'min-w-0 max-w-full')}>
        <Select
          onValueChange={(v) => setFilterWorkspaceId(v === '__all__' ? null : v)}
          value={filterWorkspaceId ?? '__all__'}
        >
          <SelectTrigger
            className={cn(
              'h-7 min-h-0 w-full min-w-0 flex-1 border-0 bg-transparent px-2 py-0 text-[11px] shadow-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0',
              '[&_svg]:size-3 [&_svg]:opacity-70'
            )}
            size="sm"
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
    )
  }
  return null
}

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
  linkMentionIndex
}: NotesChatSidebarProps): JSX.Element {
  const [sidebarWidthPx, setSidebarWidthPx] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_SIDEBAR_WIDTH_LS_KEY)
      if (raw == null) return CHAT_SIDEBAR_DEFAULT_WIDTH_PX
      const n = Number(raw)
      if (Number.isFinite(n)) return clampChatSidebarWidth(n)
    } catch {
      /* ignore */
    }
    return CHAT_SIDEBAR_DEFAULT_WIDTH_PX
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const sidebarWidthRef = useRef(CHAT_SIDEBAR_DEFAULT_WIDTH_PX)

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidthPx
  }, [sidebarWidthPx])

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !open) return
      e.preventDefault()
      resizeDragRef.current = { startX: e.clientX, startW: sidebarWidthRef.current }
      setIsResizing(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [open]
  )

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = resizeDragRef.current
    if (!d) return
    const dx = d.startX - e.clientX
    setSidebarWidthPx(clampChatSidebarWidth(d.startW + dx))
  }, [])

  const onResizePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeDragRef.current == null) return
    resizeDragRef.current = null
    setIsResizing(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setSidebarWidthPx((w) => {
      try {
        localStorage.setItem(CHAT_SIDEBAR_WIDTH_LS_KEY, String(w))
      } catch {
        /* ignore */
      }
      return w
    })
  }, [])

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'flex min-h-0 shrink-0 self-stretch overflow-hidden',
        !isResizing &&
          'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]',
        open && 'pointer-events-auto',
        open ? '' : 'w-0'
      )}
      style={open ? { width: `min(100%, ${sidebarWidthPx}px)` } : { width: 0 }}
    >
      <div
        className={cn(
          'relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-l transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,transform]',
          'border-border bg-background',
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-2 opacity-0'
        )}
      >
        {open ? (
          <div
            aria-label="Resize chat panel"
            aria-orientation="vertical"
            className={cn(
              'absolute left-0 top-0 z-20 h-full w-2 shrink-0 cursor-col-resize touch-none',
              'hover:bg-primary/10 active:bg-primary/15',
              isMacNotelab && 'pointer-events-auto'
            )}
            data-sidebar-interactive=""
            onPointerCancel={onResizePointerUp}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            role="separator"
            style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
          />
        ) : null}
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
          linkMentionIndex={linkMentionIndex}
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
  linkMentionIndex
}: NotesChatSidebarProps): JSX.Element {
  // Selected model: a NoteLabModelId or "local:<ollamaModelName>"
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_NOTELAB_MODEL_ID)
  const [localSetupOpen, setLocalSetupOpen] = useState(false)

  const ollama = useOllama()

  // Embedding-only tags (e.g. bge-m3) are not chat models — avoid stale selection
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
    filterWorkspaceId,
    setFilterWorkspaceId,
    setShowHistory,
    sendMessage,
    persistCurrentSessionIfNeeded,
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

    // linkMentionIndex not yet ready — return empty until cache builds
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
      onValueChange={(v) => onLinkModeChange(v as NotesChatSidebarLinkMode)}
      value={linkMode}
      variant="segmented"
    />
  )

  // ---------------------------------------------------------------------------
  // Local model setup view — replaces the entire sidebar content
  // ---------------------------------------------------------------------------

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
        <NoteLinksPanel
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
            <div className="px-2 pb-1">
              <Suggestions>
                {STARTER_SUGGESTIONS.map((s) => (
                  <Suggestion key={s} onClick={handleSuggestion} suggestion={s} />
                ))}
              </Suggestions>
            </div>
          )}

          {/* Paywall / low-credits banner */}
          {paywallBanner}

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChatSidebarOpenSessionTabs({
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

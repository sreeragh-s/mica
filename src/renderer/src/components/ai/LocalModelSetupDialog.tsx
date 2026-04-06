/**
 * LocalModelSetupPanel — inline expanded panel that replaces the chat input
 * when the user opens local model setup.
 *
 * Steps:
 *   1. Download Ollama binary
 *   2. Start / stop server
 *   3. Pull embedding model (bge-m3) for offline semantic search / RAG
 *   4. Pull & manage chat models
 */

import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CheckIcon,
  ChevronDownIcon,
  CpuIcon,
  DownloadIcon,
  Loader2Icon,
  PlayIcon,
  SquareIcon,
  ScanTextIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { UseOllamaResult, OllamaLocalModel } from '@/hooks/useOllama'

// ---------------------------------------------------------------------------
// Suggested models to pull
// ---------------------------------------------------------------------------

/** Same model as indexed note embeddings (1024-dim); required for local RAG query embedding. */
export const LOCAL_EMBEDDING_MODEL = 'bge-m3' as const

const SUGGESTED_MODELS = [
  { name: 'llama3.2:3b', label: 'Llama 3.2 3B', size: '~2 GB' },
  { name: 'llama3.2:1b', label: 'Llama 3.2 1B', size: '~770 MB' },
  { name: 'qwen2.5:7b', label: 'Qwen 2.5 7B', size: '~4.7 GB' },
  { name: 'mistral:7b', label: 'Mistral 7B', size: '~4.1 GB' },
  { name: 'phi4-mini:3.8b', label: 'Phi-4 Mini 3.8B', size: '~2.5 GB' },
  { name: 'gemma3:4b', label: 'Gemma 3 4B', size: '~3.3 GB' },
  { name: LOCAL_EMBEDDING_MODEL, label: 'BGE-M3 (embeddings)', size: '~1.2 GB' },
]

export function hasLocalEmbeddingModel(models: OllamaLocalModel[]): boolean {
  return models.some((m) => {
    const n = m.name.toLowerCase()
    return n === LOCAL_EMBEDDING_MODEL || n.startsWith(`${LOCAL_EMBEDDING_MODEL}:`)
  })
}

/** Ollama tags used for embeddings only — not valid for /api/chat. */
export function isLocalEmbeddingOnlyModel(modelName: string): boolean {
  const n = modelName.toLowerCase()
  return n === LOCAL_EMBEDDING_MODEL || n.startsWith(`${LOCAL_EMBEDDING_MODEL}:`)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type LocalModelSetupPanelProps = {
  onClose: () => void
  ollama: UseOllamaResult
  onSelectModel?: (modelId: string) => void
  selectedModelId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LocalModelSetupPanel({
  onClose,
  ollama,
  onSelectModel,
  selectedModelId,
}: LocalModelSetupPanelProps): JSX.Element {
  const {
    status,
    statusLoading,
    localModels,
    modelsLoading,
    downloadProgress,
    downloadMessage,
    downloadOllama,
    startOllama,
    stopOllama,
    refreshModels,
    pullModel,
    deleteModel,
  } = ollama

  const [startingServer, setStartingServer] = useState(false)
  const [stoppingServer, setStoppingServer] = useState(false)
  const [serverError, setServerError] = useState('')

  const [pullInput, setPullInput] = useState('')
  const [pullingModel, setPullingModel] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed: number; total: number } | null>(null)
  const [pullError, setPullError] = useState('')
  const [pullErrorForModel, setPullErrorForModel] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const pullCleanupRef = useRef<(() => void) | null>(null)

  const embeddingInstalled = useMemo(() => hasLocalEmbeddingModel(localModels), [localModels])

  useEffect(() => {
    if (status?.running) void refreshModels()
  }, [status?.running, refreshModels])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (): void => setShowSuggestions(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const handleDownload = useCallback(() => {
    setServerError('')
    downloadOllama()
  }, [downloadOllama])

  const handleStart = useCallback(async () => {
    setStartingServer(true)
    setServerError('')
    const res = await startOllama()
    if (!res.ok) setServerError(res.error ?? 'Failed to start Ollama')
    setStartingServer(false)
  }, [startOllama])

  const handleStop = useCallback(async () => {
    setStoppingServer(true)
    setServerError('')
    const res = await stopOllama()
    if (!res.ok) setServerError(res.error ?? 'Failed to stop Ollama')
    setStoppingServer(false)
  }, [stopOllama])

  const handlePull = useCallback((modelName: string) => {
    const name = modelName.trim()
    if (!name || pullingModel) return
    setPullError('')
    setPullErrorForModel(null)
    setPullingModel(name)
    setPullProgress(null)
    setShowSuggestions(false)
    if (pullCleanupRef.current) pullCleanupRef.current()
    pullCleanupRef.current = pullModel(name, {
      onProgress: (s, c, t) => setPullProgress({ status: s, completed: c, total: t }),
      onEnd: () => {
        setPullingModel(null)
        setPullProgress(null)
        setPullInput('')
        setPullError('')
        setPullErrorForModel(null)
      },
      onError: (msg) => {
        setPullingModel(null)
        setPullProgress(null)
        setPullError(msg)
        setPullErrorForModel(name)
      },
    })
  }, [pullingModel, pullModel])

  const handleDelete = useCallback(async (modelName: string) => {
    await deleteModel(modelName)
  }, [deleteModel])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* Panel header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-muted">
          <CpuIcon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">Local models</h2>
          <p className="text-[11px] text-muted-foreground">Ollama on this device</p>
        </div>
        <button
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={onClose}
          type="button"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">

        {/* ── Step 1: Download ── */}
        <Step title="Download Ollama" done={status?.downloaded ?? false}>
          {status?.downloaded ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {formatOllamaVersionLabel(status.version)} is installed and ready.
            </p>
          ) : downloadProgress !== null ? (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {downloadProgress}% — {downloadMessage}
              </p>
            </div>
          ) : statusLoading ? (
            <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Download Ollama to run AI models locally — no subscription needed.
              </p>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownload}>
                <DownloadIcon className="size-3.5" />
                Download
              </Button>
            </div>
          )}
        </Step>

        {/* ── Step 2: Server ── */}
        <Step title="Server" done={status?.running ?? false} disabled={!status?.downloaded}>
          {serverError && (
            <p className="text-xs text-destructive mb-1">{serverError}</p>
          )}
          {status?.running ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
                Running
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={stoppingServer}
                onClick={handleStop}
              >
                {stoppingServer
                  ? <Loader2Icon className="size-3.5 animate-spin" />
                  : <SquareIcon className="size-3.5" />}
                Stop
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={!status?.downloaded || startingServer}
              onClick={handleStart}
            >
              {startingServer
                ? <Loader2Icon className="size-3.5 animate-spin" />
                : <PlayIcon className="size-3.5" />}
              Start server
            </Button>
          )}
        </Step>

        {/* ── Embedding model (offline RAG) ── */}
        <Step
          title="Embedding model"
          done={embeddingInstalled}
          disabled={!status?.running}
        >
          <div className="space-y-2">
            <div className="flex gap-2">
              <ScanTextIcon className="size-3.5 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Chat models answer prompts; semantic search over your notes needs a separate
                embedding model. Pull <span className="font-mono text-foreground">{LOCAL_EMBEDDING_MODEL}</span>{' '}
                (~1.2 GB) so lookups match your indexed notes and work fully offline.
              </p>
            </div>
            {embeddingInstalled ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {LOCAL_EMBEDDING_MODEL} is installed — note search can use local embeddings.
              </p>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={!status?.running || !!pullingModel}
                onClick={() => handlePull(LOCAL_EMBEDDING_MODEL)}
                type="button"
              >
                {pullingModel === LOCAL_EMBEDDING_MODEL ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <DownloadIcon className="size-3.5" />
                )}
                Pull {LOCAL_EMBEDDING_MODEL}
              </Button>
            )}
            <PullProgressBlock
              active={pullingModel === LOCAL_EMBEDDING_MODEL}
              labelModel={LOCAL_EMBEDDING_MODEL}
              pullProgress={pullProgress}
            />
            {pullError && pullErrorForModel && isLocalEmbeddingOnlyModel(pullErrorForModel) && (
              <p className="text-xs text-destructive">{pullError}</p>
            )}
          </div>
        </Step>

        {/* ── Step: Pull a chat model ── */}
        <Step title="Pull a chat model" disabled={!status?.running}>
          <div className="space-y-3">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    className="h-9 pr-8 text-xs"
                    placeholder="e.g. llama3.2:3b"
                    value={pullInput}
                    onChange={(e) => { setPullInput(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePull(pullInput) }}
                    disabled={!status?.running || !!pullingModel}
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); setShowSuggestions(!showSuggestions) }}
                  >
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
                <Button
                  size="sm"
                  className="h-9 shrink-0 px-4 text-xs"
                  disabled={!pullInput.trim() || !status?.running || !!pullingModel}
                  onClick={() => handlePull(pullInput)}
                >
                  Pull
                </Button>
              </div>

              {showSuggestions && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover shadow-md">
                  {SUGGESTED_MODELS.map((m) => (
                    <button
                      key={m.name}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPullInput(m.name); setShowSuggestions(false) }}
                    >
                      <span className="min-w-0 flex-1 font-medium">{m.label}</span>
                      <span className="shrink-0 text-muted-foreground">{m.size}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <PullProgressBlock
              active={!!pullingModel && pullingModel !== LOCAL_EMBEDDING_MODEL}
              labelModel={pullingModel ?? ''}
              pullProgress={pullProgress}
            />
            {pullError && pullErrorForModel && !isLocalEmbeddingOnlyModel(pullErrorForModel) && (
              <p className="text-xs text-destructive">{pullError}</p>
            )}
          </div>
        </Step>

        {/* ── Installed models ── */}
        {status?.running && (
          <Step title="Installed models">
            {modelsLoading ? (
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            ) : localModels.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/80 bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                No models yet. Pull one above to use it in chat.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/80">
                {localModels.map((m) => (
                  <ModelRow
                    key={m.name}
                    embeddingOnly={isLocalEmbeddingOnlyModel(m.name)}
                    model={m}
                    selected={selectedModelId === `local:${m.name}`}
                    onSelect={
                      onSelectModel && !isLocalEmbeddingOnlyModel(m.name)
                        ? () => onSelectModel(`local:${m.name}`)
                        : undefined
                    }
                    onDelete={() => void handleDelete(m.name)}
                  />
                ))}
              </ul>
            )}
          </Step>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PullProgressBlock({
  active,
  labelModel,
  pullProgress,
}: {
  active: boolean
  labelModel: string
  pullProgress: { status: string; completed: number; total: number } | null
}): JSX.Element | null {
  if (!active || !labelModel) return null
  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 truncate font-medium text-foreground">
          Pulling {labelModel}
        </span>
      </div>
      {pullProgress && pullProgress.total > 0 ? (
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round((pullProgress.completed / pullProgress.total) * 100)}%` }}
            />
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{pullProgress.status}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full animate-pulse rounded-full bg-primary/35" />
          </div>
          {pullProgress?.status && (
            <p className="truncate font-mono text-[11px] text-muted-foreground">{pullProgress.status}</p>
          )}
        </div>
      )}
    </div>
  )
}

function formatOllamaVersionLabel(version: string | null | undefined): string {
  if (!version?.trim()) return 'Ollama'
  const v = version.trim()
  const withV = v.startsWith('v') ? v : `v${v}`
  return `Ollama ${withV}`
}

function Step({
  title,
  done,
  disabled,
  children,
}: {
  title: string
  done?: boolean
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <section
      className={cn(
        'rounded-xl border border-border/70 bg-card/40 p-3.5 shadow-sm',
        disabled && 'pointer-events-none select-none opacity-45'
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {done && (
          <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function ModelRow({
  model,
  embeddingOnly,
  selected,
  onSelect,
  onDelete,
}: {
  model: OllamaLocalModel
  embeddingOnly?: boolean
  selected: boolean
  onSelect?: () => void
  onDelete: () => void
}): JSX.Element {
  const sizeGb = (model.size / 1e9).toFixed(1)
  return (
    <li
      className={cn(
        'flex items-center gap-2 px-2.5 py-2 transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-muted/60'
      )}
    >
      <CpuIcon className="size-3 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-xs">{model.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">{sizeGb} GB</span>
      {embeddingOnly && (
        <span className="shrink-0 text-[10px] text-muted-foreground">Embeddings</span>
      )}
      {onSelect && (
        <button
          className={cn(
            'shrink-0 text-xs transition-colors rounded px-1',
            selected ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={onSelect}
          type="button"
        >
          {selected ? 'Selected' : 'Use'}
        </button>
      )}
      <button
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
        onClick={onDelete}
        type="button"
        aria-label={`Delete ${model.name}`}
      >
        <TrashIcon className="size-3" />
      </button>
    </li>
  )
}

// Keep old name as alias for back-compat
export { LocalModelSetupPanel as LocalModelSetupDialog }

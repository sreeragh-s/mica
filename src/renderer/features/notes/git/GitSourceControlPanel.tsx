import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getApi } from '@/lib/auth/auth-bridge'
import { cn } from '@/lib/utils'
import type { NotesAppViewModel } from '@/features/notes/app-state/useNotesApp'

export type GitFileEntry = {
  path: string
  x: string
  y: string
  staged: boolean
  conflicted: boolean
}

export type GitSourceControlPanelProps = {
  vm: NotesAppViewModel
}

function statusLabel(x: string, y: string): string {
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return 'C'
  if (x === 'A') return 'A'
  if (x === 'D') return 'D'
  if (x === 'M') return 'M'
  if (x === 'R') return 'R'
  if (y === 'M') return 'M'
  if (y === 'D') return 'D'
  if (y === '?') return 'U'
  return '?'
}

function statusColor(label: string): string {
  switch (label) {
    case 'A': return 'text-green-500 dark:text-green-400'
    case 'M': return 'text-yellow-500 dark:text-yellow-400'
    case 'D': return 'text-red-500 dark:text-red-400'
    case 'C': return 'text-orange-500 dark:text-orange-400'
    case 'R': return 'text-blue-500 dark:text-blue-400'
    case 'U': return 'text-muted-foreground'
    default: return 'text-muted-foreground'
  }
}

function FileRow({
  file,
  cwd,
  onStage,
  onUnstage,
  onDiscard,
  onOpenConflict,
  onViewDiff,
  isSelected,
  onClick
}: {
  file: GitFileEntry
  cwd: string
  onStage: (path: string) => Promise<void>
  onUnstage: (path: string) => Promise<void>
  onDiscard: (path: string) => Promise<void>
  onOpenConflict: (path: string) => void
  onViewDiff: (path: string, staged: boolean) => void
  isSelected: boolean
  onClick: () => void
}): JSX.Element {
  const label = file.conflicted ? 'C' : statusLabel(file.x, file.y)
  const colorClass = statusColor(label)
  const filename = file.path.split('/').pop() ?? file.path
  const dirPart = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cn(
        'group flex h-7 w-full cursor-pointer items-center gap-1 rounded px-2 text-xs select-none',
        isSelected
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/50'
      )}
    >
      {file.conflicted ? (
        <AlertTriangle className="size-3 shrink-0 text-orange-500" aria-hidden />
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{filename}</span>
        {dirPart && (
          <span className="text-muted-foreground ml-1.5 text-[10px]">{dirPart}</span>
        )}
      </span>
      <span
        className={cn('ml-auto shrink-0 w-3.5 text-right text-[10px] font-semibold', colorClass)}
        aria-label={label}
      >
        {label}
      </span>
      <span className="ml-0.5 hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {file.conflicted ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5 text-muted-foreground"
            title="Resolve conflict"
            onClick={(e) => { e.stopPropagation(); onOpenConflict(file.path) }}
          >
            <AlertTriangle className="size-3" />
          </Button>
        ) : file.staged ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground"
              title="Unstage"
              onClick={(e) => { e.stopPropagation(); void onUnstage(file.path) }}
            >
              <Minus className="size-3" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground"
              title="Stage file"
              onClick={(e) => { e.stopPropagation(); void onStage(file.path) }}
            >
              <Plus className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground hover:text-destructive"
              title="Discard changes"
              onClick={(e) => { e.stopPropagation(); void onDiscard(file.path) }}
            >
              <RotateCcw className="size-3" />
            </Button>
          </>
        )}
        {!file.conflicted && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5 text-muted-foreground"
            title="View diff"
            onClick={(e) => { e.stopPropagation(); onViewDiff(file.path, file.staged); void cwd }}
          >
            <ChevronRight className="size-3" />
          </Button>
        )}
      </span>
    </div>
  )
}

function DiffPane({ diff }: { diff: string }): JSX.Element {
  const lines = diff.split('\n')
  return (
    <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-[1.6]">
      {lines.map((line, i) => {
        let cls = 'text-muted-foreground px-3 whitespace-pre'
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'bg-green-500/10 text-green-700 dark:text-green-400 px-3 whitespace-pre'
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'bg-red-500/10 text-red-700 dark:text-red-400 px-3 whitespace-pre'
        else if (line.startsWith('@@')) cls = 'text-blue-500 dark:text-blue-400 px-3 whitespace-pre'
        else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) cls = 'text-foreground font-semibold px-3 whitespace-pre'
        return (
          <div key={i} className={cls}>
            {line || '\u00a0'}
          </div>
        )
      })}
    </div>
  )
}

export function GitSourceControlPanel({ vm }: GitSourceControlPanelProps): JSX.Element {
  const {
    gitSourceControlFiles,
    gitSourceControlLoading,
    gitSourceControlHasConflicts,
    gitSourceControlIsRebasing,
    gitSourceControlError,
    gitCommitMessage,
    setGitCommitMessage,
    gitSyncBusy,
    gitSyncError,
    gitToolbarFolder,
    gitRepoReady,
    gitHasOriginRemote,
    gitInitBusy,
    gitInitError,
    refreshGitSourceControl,
    refreshWorkspaceGitStatuses,
    handleGitStageFile,
    handleGitUnstageFile,
    handleGitDiscardFile,
    handleGitCommit,
    handleGitPullThenPush,
    handleInitGit,
    handleGitAbortRebase,
    handleGitContinueRebase,
    openConflictView,
    isMacNotelab,
    macTitlebarStyles,
    setGitRemoteDialogOpen,
    gitSynced,
  } = vm


  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [changesExpanded, setChangesExpanded] = useState(true)
  const [conflictsExpanded, setConflictsExpanded] = useState(true)
  const [bulkActionBusy, setBulkActionBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const cwd = gitToolbarFolder?.localGitPath ?? ''

  const stagedFiles = gitSourceControlFiles.filter((f) => f.staged && !f.conflicted)
  const unstagedFiles = gitSourceControlFiles.filter((f) => !f.staged && !f.conflicted)
  const conflictedFiles = gitSourceControlFiles.filter((f) => f.conflicted)

  const totalChanges = stagedFiles.length + unstagedFiles.length + conflictedFiles.length

  const loadDiff = useCallback(async (path: string, staged: boolean) => {
    if (!cwd) return
    setDiffLoading(true)
    setDiffContent(null)
    try {
      const api = window.api
      const r = await api.workspace.gitDiffFile?.({ cwd, path, staged })
      if (r?.ok) {
        setDiffContent(r.diff || '(no diff)')
      } else {
        setDiffContent(r?.error ?? 'Failed to load diff')
      }
    } finally {
      setDiffLoading(false)
    }
  }, [cwd])

  const handleViewDiff = useCallback((path: string, staged: boolean) => {
    setSelectedPath(path)
    void loadDiff(path, staged)
  }, [loadDiff])

  const handleStage = useCallback(async (path: string) => {
    await handleGitStageFile(path)
    void refreshGitSourceControl()
    if (selectedPath === path) setDiffContent(null)
  }, [handleGitStageFile, refreshGitSourceControl, selectedPath])

  const handleUnstage = useCallback(async (path: string) => {
    await handleGitUnstageFile(path)
    void refreshGitSourceControl()
    if (selectedPath === path) setDiffContent(null)
  }, [handleGitUnstageFile, refreshGitSourceControl, selectedPath])

  const handleDiscard = useCallback(async (path: string) => {
    await handleGitDiscardFile(path)
    void refreshGitSourceControl()
    if (selectedPath === path) setDiffContent(null)
  }, [handleGitDiscardFile, refreshGitSourceControl, selectedPath])

  const handleStageAll = useCallback(async () => {
    if (!cwd) return
    const api = getApi()
    if (!api?.workspace?.gitStageFile) return
    setBulkActionBusy(true)
    try {
      for (const f of unstagedFiles) {
        const r = await api.workspace.gitStageFile({ cwd, path: f.path })
        if (!r.ok) {
          window.api.log.error('[GitSourceControlPanel] bulk stage failed', f.path, r.error)
          break
        }
      }
      await Promise.all([refreshGitSourceControl(), refreshWorkspaceGitStatuses()])
    } finally {
      setBulkActionBusy(false)
    }
  }, [cwd, refreshGitSourceControl, refreshWorkspaceGitStatuses, unstagedFiles])

  const handleUnstageAll = useCallback(async () => {
    if (!cwd) return
    const api = getApi()
    if (!api?.workspace?.gitUnstageFile) return
    setBulkActionBusy(true)
    try {
      for (const f of stagedFiles) {
        const r = await api.workspace.gitUnstageFile({ cwd, path: f.path })
        if (!r.ok) {
          window.api.log.error('[GitSourceControlPanel] bulk unstage failed', f.path, r.error)
          break
        }
      }
      await Promise.all([refreshGitSourceControl(), refreshWorkspaceGitStatuses()])
    } finally {
      setBulkActionBusy(false)
    }
  }, [cwd, refreshGitSourceControl, refreshWorkspaceGitStatuses, stagedFiles])

  // Auto-refresh when panel mounts or cwd changes
  useEffect(() => {
    void refreshGitSourceControl()
  }, [cwd, refreshGitSourceControl])

  // Clean tree = no staged, unstaged, or conflicted files
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0 || conflictedFiles.length > 0
  const showSyncButton = !hasChanges && !gitSourceControlLoading
  const canCommit = stagedFiles.length > 0 && gitCommitMessage.trim().length > 0 && !gitSyncBusy && !gitSourceControlHasConflicts

  if (!cwd) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground text-xs leading-relaxed">
          No workspace found. Set up your workspace in Settings → GitHub & Git.
        </p>
      </div>
    )
  }

  if (gitRepoReady === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
        <GitBranch className="text-muted-foreground/40 size-8" aria-hidden />
        <div className="space-y-1">
          <p className="text-foreground text-sm font-medium">No git repository</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Initialize a git repository in your workspace to track changes and sync to GitHub.
          </p>

        </div>
        {gitInitError && (
          <p className="text-destructive text-xs whitespace-pre-wrap">{gitInitError}</p>
        )}
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={gitInitBusy}
          onClick={() => void handleInitGit()}
          data-sidebar-interactive=""
        >
          {gitInitBusy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <GitBranch className="size-3.5" aria-hidden />
          )}
          Initialize repository
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'flex h-9 shrink-0 items-center justify-between gap-1 px-3',
          isMacNotelab && 'pointer-events-none'
        )}
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <span className="text-foreground text-xs font-semibold uppercase tracking-wide">
          Source Control
          {totalChanges > 0 && (
            <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {totalChanges}
            </span>
          )}
        </span>
        <div
          className={cn('flex items-center gap-0.5', isMacNotelab && 'pointer-events-auto')}
          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
          data-sidebar-interactive=""
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground size-6"
            title="Refresh"
            onClick={() => void refreshGitSourceControl()}
            disabled={gitSourceControlLoading}
          >
            {gitSourceControlLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto',
          isMacNotelab && 'pointer-events-auto'
        )}
        data-sidebar-interactive=""
      >
        {/* Rebase warning */}
        {gitSourceControlIsRebasing && (
          <div className="border-border mx-2 mb-2 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-900/50 dark:bg-orange-950/30">
            <p className="text-foreground text-xs font-medium">Rebase in progress</p>
            {conflictedFiles.length > 0 ? (
              <p className="text-muted-foreground mt-0.5 text-xs">
                Resolve all conflicts below, then continue the rebase.
              </p>
            ) : (
              <p className="text-muted-foreground mt-0.5 text-xs">
                All conflicts resolved. You can continue or abort the rebase.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conflictedFiles.length === 0 && (
                <Button
                  type="button"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  disabled={gitSyncBusy}
                  onClick={() => void handleGitContinueRebase()}
                >
                  <Check className="size-3" />
                  Continue rebase
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                disabled={gitSyncBusy}
                onClick={() => void handleGitAbortRebase()}
              >
                <X className="size-3" />
                Abort rebase
              </Button>
            </div>
          </div>
        )}

        {/* Commit / Sync actions */}
        {!gitSourceControlIsRebasing && (
          <div className="border-b border-border/50 px-2 pb-2 pt-1">
            {showSyncButton ? (
              <Button
                type="button"
                size="sm"
                className="h-7 w-full gap-1.5 px-2 text-xs"
                disabled={gitSyncBusy || gitSynced}
                onClick={() => {
                  if (!gitHasOriginRemote) {
                    setGitRemoteDialogOpen(true)
                  } else {
                    void handleGitPullThenPush()
                  }
                }}
                data-sidebar-interactive=""
              >
                {gitSyncBusy ? <Loader2 className="size-3 animate-spin" /> : gitSynced ? <Check className="size-3" /> : <ArrowUpDown className="size-3" />}
                {gitSynced ? 'Synced' : 'Sync changes'}
              </Button>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-none rounded-md border px-2.5 py-2 text-xs leading-relaxed focus-visible:ring-1 focus-visible:outline-none disabled:opacity-50"
                  rows={3}
                  placeholder="Commit message"
                  value={gitCommitMessage}
                  onChange={(e) => setGitCommitMessage(e.target.value)}
                  disabled={gitSyncBusy}
                  data-sidebar-interactive=""
                  style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                />
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-6 flex-1 gap-1 px-2 text-xs"
                    disabled={!canCommit}
                    onClick={() => void handleGitCommit()}
                    data-sidebar-interactive=""
                  >
                    {gitSyncBusy ? <Loader2 className="size-3 animate-spin" /> : <GitCommitHorizontal className="size-3" />}
                    Commit
                  </Button>
                </div>
                {stagedFiles.length === 0 && unstagedFiles.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-[10px]">Stage files to enable commit.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Sync error */}
        {gitSyncError && (
          <div className="border-destructive/30 bg-destructive/5 mx-2 mt-2 rounded-md border px-3 py-2">
            <p className="text-destructive text-xs whitespace-pre-wrap">{gitSyncError}</p>
          </div>
        )}

        {/* Source control error */}
        {gitSourceControlError && !gitSyncError && (
          <div className="mx-2 mt-2 rounded-md border border-orange-200/50 bg-orange-50/50 px-3 py-2 dark:border-orange-900/30 dark:bg-orange-950/20">
            <p className="text-muted-foreground text-xs">{gitSourceControlError}</p>
          </div>
        )}

        {/* Conflicts section */}
        {conflictedFiles.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
              onClick={() => setConflictsExpanded((v) => !v)}
              data-sidebar-interactive=""
            >
              {conflictsExpanded ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              <span className="text-orange-500 dark:text-orange-400">Conflicts</span>
              <span className="ml-1 font-normal text-orange-500/70">{conflictedFiles.length}</span>
            </button>
            {conflictsExpanded && (
              <div className="px-1">
                {conflictedFiles.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    cwd={cwd}
                    onStage={handleStage}
                    onUnstage={handleUnstage}
                    onDiscard={handleDiscard}
                    onOpenConflict={openConflictView}
                    onViewDiff={handleViewDiff}
                    isSelected={selectedPath === f.path}
                    onClick={() => openConflictView(f.path)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Staged section */}
        {(stagedFiles.length > 0 || unstagedFiles.length > 0 || conflictedFiles.length === 0) && (
          <>
            <div className="mt-1">
              <div className="flex items-center">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex flex-1 items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
                  onClick={() => setStagedExpanded((v) => !v)}
                  data-sidebar-interactive=""
                >
                  {stagedExpanded ? (
                    <ChevronDown className="size-3 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" />
                  )}
                  Staged
                  <span className="text-muted-foreground/60 ml-1 font-normal">{stagedFiles.length}</span>
                </button>
                {stagedFiles.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mr-2 size-5 text-muted-foreground"
                    title="Unstage all"
                    onClick={() => void handleUnstageAll()}
                    disabled={bulkActionBusy}
                    data-sidebar-interactive=""
                  >
                    {bulkActionBusy ? <Loader2 className="size-3 animate-spin" /> : <Minus className="size-3" />}
                  </Button>
                )}
              </div>
              {stagedExpanded && (
                <div className="px-1">
                  {stagedFiles.length === 0 ? (
                    <p className="text-muted-foreground/60 px-3 py-1 text-[11px] italic">No staged files</p>
                  ) : (
                    stagedFiles.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        cwd={cwd}
                        onStage={handleStage}
                        onUnstage={handleUnstage}
                        onDiscard={handleDiscard}
                        onOpenConflict={openConflictView}
                        onViewDiff={handleViewDiff}
                        isSelected={selectedPath === f.path}
                        onClick={() => handleViewDiff(f.path, true)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Changes (unstaged) section */}
            <div className="mt-1">
              <div className="flex items-center">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex flex-1 items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
                  onClick={() => setChangesExpanded((v) => !v)}
                  data-sidebar-interactive=""
                >
                  {changesExpanded ? (
                    <ChevronDown className="size-3 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" />
                  )}
                  Changes
                  <span className="text-muted-foreground/60 ml-1 font-normal">{unstagedFiles.length}</span>
                </button>
                {unstagedFiles.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mr-2 size-5 text-muted-foreground"
                    title="Stage all"
                    onClick={() => void handleStageAll()}
                    disabled={bulkActionBusy}
                    data-sidebar-interactive=""
                  >
                    {bulkActionBusy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                  </Button>
                )}
              </div>
              {changesExpanded && (
                <div className="px-1">
                  {unstagedFiles.length === 0 ? (
                    <p className="text-muted-foreground/60 px-3 py-1 text-[11px] italic">No unstaged changes</p>
                  ) : (
                    unstagedFiles.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        cwd={cwd}
                        onStage={handleStage}
                        onUnstage={handleUnstage}
                        onDiscard={handleDiscard}
                        onOpenConflict={openConflictView}
                        onViewDiff={handleViewDiff}
                        isSelected={selectedPath === f.path}
                        onClick={() => handleViewDiff(f.path, false)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* No changes at all */}
        {totalChanges === 0 && !gitSourceControlLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Check className="text-muted-foreground/40 size-8" aria-hidden />
            <p className="text-muted-foreground text-xs">Working tree clean</p>
          </div>
        )}
      </div>

      {/* Diff pane */}
      {selectedPath && (
        <div className="border-border flex min-h-0 flex-col border-t" style={{ height: '40%', minHeight: 120 }}>
          <div className="border-border flex h-7 shrink-0 items-center justify-between border-b px-2">
            <span className="text-muted-foreground truncate text-[11px]">
              {selectedPath.split('/').pop()}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground"
              onClick={() => { setSelectedPath(null); setDiffContent(null) }}
            >
              <X className="size-3" />
            </Button>
          </div>
          {diffLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            </div>
          ) : diffContent ? (
            <DiffPane diff={diffContent} />
          ) : null}
        </div>
      )}
    </div>
  )
}

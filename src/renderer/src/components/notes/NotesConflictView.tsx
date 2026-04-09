import { useCallback, useEffect, useState, type JSX } from 'react'

import { AlertTriangle, Check, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NotesAppViewModel } from './useNotesApp'

type ConflictHunk = {
  type: 'context' | 'ours' | 'theirs'
  lines: string[]
  startLine: number
}

function parseConflictHunks(content: string): ConflictHunk[] {
  const rawLines = content.split('\n')
  const hunks: ConflictHunk[] = []
  let currentLines: string[] = []
  let currentType: 'context' | 'ours' | 'theirs' = 'context'
  let lineNum = 1

  const push = (): void => {
    if (currentLines.length > 0) {
      hunks.push({ type: currentType, lines: currentLines, startLine: lineNum - currentLines.length })
      currentLines = []
    }
  }

  for (const line of rawLines) {
    if (line.startsWith('<<<<<<<')) {
      push()
      currentType = 'ours'
      lineNum++
      continue
    }
    if (line.startsWith('=======')) {
      push()
      currentType = 'theirs'
      lineNum++
      continue
    }
    if (line.startsWith('>>>>>>>')) {
      push()
      currentType = 'context'
      lineNum++
      continue
    }
    if (line.startsWith('|||||||')) {
      // Skip base section marker in diff3 mode
      push()
      lineNum++
      continue
    }
    currentLines.push(line)
    lineNum++
  }
  push()
  return hunks
}

function HunkBlock({
  hunk,
  conflictIndex,
  onAcceptOurs,
  onAcceptTheirs,
  resolved,
  resolution
}: {
  hunk: ConflictHunk
  conflictIndex: number
  onAcceptOurs: (idx: number) => void
  onAcceptTheirs: (idx: number) => void
  resolved: boolean
  resolution: 'ours' | 'theirs' | null
}): JSX.Element {
  if (hunk.type === 'context') {
    return (
      <div>
        {hunk.lines.map((line, i) => (
          <div
            key={i}
            className="flex items-start gap-0 font-mono text-[12px] leading-relaxed"
          >
            <span className="text-muted-foreground/40 w-10 shrink-0 select-none pr-2 text-right text-[10px]">
              {hunk.startLine + i}
            </span>
            <span className="text-foreground whitespace-pre-wrap break-all">{line || '\u00a0'}</span>
          </div>
        ))}
      </div>
    )
  }

  const isOurs = hunk.type === 'ours'
  const label = isOurs ? 'Current Change' : 'Incoming Change'
  const bgClass = isOurs
    ? resolved && resolution === 'ours'
      ? 'bg-green-500/15 border-green-500/40'
      : resolved && resolution === 'theirs'
        ? 'bg-muted/30 border-border/30 opacity-40'
        : 'bg-blue-500/10 border-blue-500/30'
    : resolved && resolution === 'theirs'
      ? 'bg-green-500/15 border-green-500/40'
      : resolved && resolution === 'ours'
        ? 'bg-muted/30 border-border/30 opacity-40'
        : 'bg-orange-500/10 border-orange-500/30'

  const labelColor = isOurs ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'
  const actionLabel = isOurs ? 'Accept Current Change' : 'Accept Incoming Change'

  return (
    <div className={cn('my-0.5 rounded border-l-2 border-r border-b border-t', bgClass)}>
      <div className="flex items-center justify-between px-3 py-1">
        <span className={cn('text-[11px] font-medium', labelColor)}>
          {label}
        </span>
        {resolved ? (
          <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
            <Check className="size-3" />
            {resolution === (isOurs ? 'ours' : 'theirs') ? 'Accepted' : 'Rejected'}
          </span>
        ) : (
          <button
            type="button"
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              isOurs
                ? 'bg-blue-500/20 text-blue-700 hover:bg-blue-500/30 dark:text-blue-400'
                : 'bg-orange-500/20 text-orange-700 hover:bg-orange-500/30 dark:text-orange-400'
            )}
            onClick={() => isOurs ? onAcceptOurs(conflictIndex) : onAcceptTheirs(conflictIndex)}
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="px-3 pb-2">
        {hunk.lines.map((line, i) => (
          <div key={i} className="flex items-start gap-0 font-mono text-[12px] leading-relaxed">
            <span className="text-muted-foreground/40 w-10 shrink-0 select-none pr-2 text-right text-[10px]">
              {hunk.startLine + i}
            </span>
            <span className="text-foreground whitespace-pre-wrap break-all">{line || '\u00a0'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function NotesConflictView({ vm }: { vm: NotesAppViewModel }): JSX.Element | null {
  const {
    conflictViewPath,
    closeConflictView,
    refreshGitSourceControl,
    gitToolbarFolder,
    isMacNotelab,
    macTitlebarStyles,
    gitSyncBusy,
  } = vm

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [resolutions, setResolutions] = useState<Map<number, 'ours' | 'theirs'>>(new Map())

  const cwd = gitToolbarFolder?.localGitPath ?? ''
  const path = conflictViewPath

  const load = useCallback(async () => {
    if (!cwd || !path) return
    setLoading(true)
    setError(null)
    setResolutions(new Map())
    try {
      const api = window.api
      const r = await api.workspace.gitConflictFile?.({ cwd, path })
      if (r?.ok) {
        setContent(r.content)
      } else {
        setError(r?.error ?? 'Failed to load conflict file')
      }
    } finally {
      setLoading(false)
    }
  }, [cwd, path])

  useEffect(() => {
    void load()
  }, [load])

  if (!path) return null

  const hunks = content ? parseConflictHunks(content) : []

  // Group ours/theirs hunks into conflict pairs
  let conflictIdx = 0
  const indexedHunks: { hunk: ConflictHunk; conflictIndex: number }[] = []
  let pendingOursIdx = -1
  for (const hunk of hunks) {
    if (hunk.type === 'ours') {
      pendingOursIdx = conflictIdx
      indexedHunks.push({ hunk, conflictIndex: conflictIdx })
    } else if (hunk.type === 'theirs') {
      indexedHunks.push({ hunk, conflictIndex: pendingOursIdx >= 0 ? pendingOursIdx : conflictIdx })
      conflictIdx++
      pendingOursIdx = -1
    } else {
      indexedHunks.push({ hunk, conflictIndex: -1 })
    }
  }

  const totalConflicts = conflictIdx
  const resolvedCount = resolutions.size
  const allResolved = totalConflicts > 0 && resolvedCount >= totalConflicts

  const handleAcceptOurs = (idx: number): void => {
    setResolutions((prev) => new Map(prev).set(idx, 'ours'))
  }

  const handleAcceptTheirs = (idx: number): void => {
    setResolutions((prev) => new Map(prev).set(idx, 'theirs'))
  }

  const handleApplyAndStage = useCallback(async () => {
    if (!cwd || !path || !content) return
    // Reconstruct file content from resolutions
    let resolved = ''
    let currentConflict = -1
    let inOurs = false
    let inTheirs = false
    const lines = content.split('\n')

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        currentConflict++
        inOurs = true
        inTheirs = false
        continue
      }
      if (line.startsWith('=======')) {
        inOurs = false
        inTheirs = true
        continue
      }
      if (line.startsWith('>>>>>>>')) {
        inOurs = false
        inTheirs = false
        continue
      }
      if (line.startsWith('|||||||')) continue

      const res = resolutions.get(currentConflict)
      if (inOurs) {
        if (res === 'ours') resolved += line + '\n'
      } else if (inTheirs) {
        if (res === 'theirs') resolved += line + '\n'
      } else {
        resolved += line + '\n'
      }
    }
    // Remove trailing extra newline
    resolved = resolved.replace(/\n$/, '')

    try {
      const api = window.api
      await api.workspace.gitAcceptResolution?.({
        cwd,
        path,
        resolution: 'content',
        content: resolved,
      })
      await refreshGitSourceControl()
      closeConflictView()
    } catch (e) {
      setError(String(e))
    }
  }, [cwd, path, content, resolutions, refreshGitSourceControl, closeConflictView])

  const filename = path.split('/').pop() ?? path

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'border-border flex h-10 shrink-0 items-center gap-2 border-b px-3',
          isMacNotelab && 'pointer-events-none'
        )}
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <AlertTriangle className="size-4 shrink-0 text-orange-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="text-foreground truncate text-sm font-semibold">{filename}</span>
          <span className="text-muted-foreground ml-2 text-xs">
            {totalConflicts > 0
              ? `${resolvedCount}/${totalConflicts} conflicts resolved`
              : 'Merge conflict'}
          </span>
        </div>
        <div
          className={cn('flex shrink-0 items-center gap-1.5', isMacNotelab && 'pointer-events-auto')}
          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
        >
          {allResolved && (
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 px-3 text-xs"
              disabled={gitSyncBusy}
              onClick={() => void handleApplyAndStage()}
            >
              {gitSyncBusy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Apply & Stage
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7"
            onClick={closeConflictView}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="border-border/50 flex shrink-0 items-center gap-4 border-b px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500/30 ring-1 ring-blue-500/50" />
          <span className="text-muted-foreground text-[11px]">Current (HEAD)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-500/30 ring-1 ring-orange-500/50" />
          <span className="text-muted-foreground text-[11px]">Incoming</span>
        </div>
        {!allResolved && totalConflicts > 0 && (
          <span className="text-muted-foreground ml-auto text-[11px]">
            Click a button above the change to accept it
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-destructive text-xs">{error}</p>
          </div>
        )}
        {!loading && !error && content && (
          <div>
            {indexedHunks.map((item, i) => (
              <HunkBlock
                key={i}
                hunk={item.hunk}
                conflictIndex={item.conflictIndex}
                onAcceptOurs={handleAcceptOurs}
                onAcceptTheirs={handleAcceptTheirs}
                resolved={item.conflictIndex >= 0 && resolutions.has(item.conflictIndex)}
                resolution={item.conflictIndex >= 0 ? (resolutions.get(item.conflictIndex) ?? null) : null}
              />
            ))}
            {totalConflicts === 0 && (
              <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3">
                <Check className="size-4 text-green-500" />
                <p className="text-sm text-green-700 dark:text-green-400">No conflict markers found in this file.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  GitBranchIcon,
  GitCommitHorizontal,
  Globe,
  Lock,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SidebarFooter } from "@/components/ui/sidebar"
import {
  checkGhInstallation,
  ghPublishBranch,
  type GhCheckResult,
  type GhVisibility,
} from "@/lib/setup-backend"
import { cn } from "@/lib/utils"
import { getCurrentWorkspace } from "@/lib/workspace"

// ──────────────────────────────────────────────────────────────────────────────
// Types (raw backend shape + UI shape)
// ──────────────────────────────────────────────────────────────────────────────

interface RawGitFileStatus {
  path: string
  status: string
  staged: boolean
  untracked: boolean
  modified: boolean
  deleted: boolean
}

interface GitBranch {
  name: string
  is_current: boolean
}

interface GitRepoInfo {
  initialized: boolean
  current_branch: string | null
  ahead: number
  behind: number
  has_changes: boolean
  has_remote: boolean
  has_commits: boolean
}

function workspaceBasename(path: string): string {
  // macOS/Linux use forward slashes; Windows also accepts them via git, but
  // the Tauri path API normalizes on write — here we just need the last
  // segment regardless of separator.
  const trimmed = path.replace(/[\\/]+$/, "")
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  const base = idx === -1 ? trimmed : trimmed.slice(idx + 1)
  // gh enforces: letters, digits, `.`, `_`, `-` — no spaces, no leading dot.
  // Replace invalid chars with `-` and collapse runs so weird folder names
  // still yield a valid default.
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "my-notes"
}

interface GitIdentity {
  name: string | null
  email: string | null
}

interface FileEntry {
  path: string
  staged: boolean
  conflicted: boolean
  label: string
  colorClass: string
  filename: string
  dirPart: string
}

// ──────────────────────────────────────────────────────────────────────────────
// Virtualization primitives (ported from @pierre/trees)
//
// Pierre models virtualization as three pure functions operating on viewport
// metrics. We mirror that shape here. The key trick is `computeWindowRange`:
// it returns the *previous* range when the visible slice is still fully inside
// it, which eliminates re-renders for small scroll deltas within the overscan
// zone. That's what keeps rapid wheel scrolling buttery.
// ──────────────────────────────────────────────────────────────────────────────

interface Range {
  start: number
  end: number
}

const EMPTY_RANGE: Range = { start: 0, end: -1 }

function rangesEqual(a: Range, b: Range): boolean {
  return a.start === b.start && a.end === b.end
}

function normalizeRange(range: Range, itemCount: number): Range {
  if (itemCount <= 0 || range.end < range.start) return EMPTY_RANGE
  const start = Math.max(0, Math.min(range.start, itemCount - 1))
  const end = Math.max(start, Math.min(range.end, itemCount - 1))
  return { start, end }
}

function computeVisibleRange(
  itemCount: number,
  itemHeight: number,
  scrollTop: number,
  viewportHeight: number,
): Range {
  if (itemCount <= 0) return EMPTY_RANGE
  const rawStart = Math.floor(scrollTop / itemHeight)
  const rawEnd = Math.ceil((scrollTop + viewportHeight) / itemHeight) - 1
  if (rawEnd < 0 || rawStart >= itemCount) return EMPTY_RANGE
  return {
    start: Math.max(0, rawStart),
    end: Math.min(itemCount - 1, rawEnd),
  }
}

function computeWindowRange(
  itemCount: number,
  itemHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
  currentRange: Range,
): Range {
  const visible = computeVisibleRange(itemCount, itemHeight, scrollTop, viewportHeight)
  const normalized = normalizeRange(currentRange, itemCount)
  if (
    normalized.end >= normalized.start &&
    visible.start >= normalized.start &&
    visible.end <= normalized.end
  ) {
    return normalized
  }
  return normalizeRange(
    { start: visible.start - overscan, end: visible.end + overscan },
    itemCount,
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Row model — flat list of typed rows for a single virtualized scroller
// ──────────────────────────────────────────────────────────────────────────────

type SectionKey = "conflicts" | "staged" | "changes"

type Row =
  | { type: "header"; key: string; section: SectionKey; count: number; expanded: boolean }
  | { type: "file"; key: string; file: FileEntry }
  | { type: "empty"; key: string; section: SectionKey }

const ROW_HEIGHT = 28
const OVERSCAN = 10

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────────────────────────

function statusLabelFrom(raw: RawGitFileStatus): string {
  if (raw.untracked) return "U"
  if (raw.status === "both_modified") return "C"
  if (raw.status === "added") return "A"
  if (raw.status === "deleted" || raw.deleted) return "D"
  if (raw.status === "modified" || raw.modified) return "M"
  return "?"
}

function colorFor(label: string): string {
  switch (label) {
    case "A":
      return "text-green-500 dark:text-green-400"
    case "M":
      return "text-yellow-500 dark:text-yellow-400"
    case "D":
      return "text-red-500 dark:text-red-400"
    case "C":
      return "text-orange-500 dark:text-orange-400"
    case "U":
      return "text-green-600 dark:text-green-500"
    default:
      return "text-muted-foreground"
  }
}

function splitPath(path: string): { filename: string; dirPart: string } {
  const slash = path.lastIndexOf("/")
  if (slash === -1) return { filename: path, dirPart: "" }
  return { filename: path.slice(slash + 1), dirPart: path.slice(0, slash) }
}

function toFileEntry(raw: RawGitFileStatus): FileEntry {
  const label = statusLabelFrom(raw)
  const conflicted = raw.status === "both_modified"
  const { filename, dirPart } = splitPath(raw.path)
  return {
    path: raw.path,
    staged: raw.staged && !raw.untracked,
    conflicted,
    label,
    colorClass: colorFor(label),
    filename,
    dirPart,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Virtualized list hook — Pierre-style. Returns window range + layout.
// ──────────────────────────────────────────────────────────────────────────────

interface WindowState {
  range: Range
  totalHeight: number
  offsetHeight: number
}

function useWindowRange(
  scrollElementRef: React.RefObject<HTMLElement | null>,
  itemCount: number,
): WindowState {
  const [viewportHeight, setViewportHeight] = React.useState(420)
  const [scrollTop, setScrollTop] = React.useState(0)
  const rangeRef = React.useRef<Range>(EMPTY_RANGE)

  React.useEffect(() => {
    const el = scrollElementRef.current
    if (!el) return

    const readScroll = () => {
      // Reading scrollTop is O(1) and never triggers reflow when called from
      // the scroll event itself. Batching via rAF is unnecessary and adds a
      // frame of lag we actively don't want.
      setScrollTop(el.scrollTop)
    }

    readScroll()
    el.addEventListener("scroll", readScroll, { passive: true })

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        if (h > 0) setViewportHeight(h)
      })
      ro.observe(el)
    }

    return () => {
      el.removeEventListener("scroll", readScroll)
      ro?.disconnect()
    }
  }, [scrollElementRef])

  const range = React.useMemo(() => {
    const next = computeWindowRange(
      itemCount,
      ROW_HEIGHT,
      scrollTop,
      viewportHeight,
      OVERSCAN,
      rangeRef.current,
    )
    if (!rangesEqual(next, rangeRef.current)) {
      rangeRef.current = next
    }
    return rangeRef.current
  }, [itemCount, scrollTop, viewportHeight])

  return React.useMemo<WindowState>(
    () => ({
      range,
      totalHeight: itemCount * ROW_HEIGHT,
      offsetHeight: range.end >= range.start ? range.start * ROW_HEIGHT : 0,
    }),
    [range, itemCount],
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Row components
// ──────────────────────────────────────────────────────────────────────────────

interface HeaderRowProps {
  section: SectionKey
  count: number
  expanded: boolean
  onToggle: (section: SectionKey) => void
  onStageAll?: () => void
  onUnstageAll?: () => void
  bulkBusy: boolean
}

const HeaderRow = React.memo(function HeaderRow({
  section,
  count,
  expanded,
  onToggle,
  onStageAll,
  onUnstageAll,
  bulkBusy,
}: HeaderRowProps): React.ReactElement {
  const label = section === "conflicts" ? "Conflicts" : section === "staged" ? "Staged" : "Changes"
  const accent =
    section === "conflicts"
      ? "text-orange-500 dark:text-orange-400"
      : "text-muted-foreground hover:text-foreground"

  return (
    <div className="group flex h-6 items-center pr-2">
      <button
        type="button"
        onClick={() => onToggle(section)}
        className={cn(
          "flex flex-1 items-center gap-1 px-3 text-[11px] font-semibold uppercase tracking-wide transition-colors",
          accent,
        )}
      >
        {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <span>{label}</span>
        <span className="text-muted-foreground/60 ml-1 font-normal">{count}</span>
      </button>
      {section === "staged" && count > 0 && onUnstageAll && (
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-foreground group-hover:opacity-100"
          title="Unstage all"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onUnstageAll()
          }}
          disabled={bulkBusy}
        >
          {bulkBusy ? <Loader2 className="size-3 animate-spin" /> : <Minus className="size-3" />}
        </button>
      )}
      {section === "changes" && count > 0 && onStageAll && (
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-foreground group-hover:opacity-100"
          title="Stage all"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStageAll()
          }}
          disabled={bulkBusy}
        >
          {bulkBusy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
        </button>
      )}
    </div>
  )
})

interface FileRowProps {
  file: FileEntry
  isSelected: boolean
  onSelect: (file: FileEntry) => void
  onStage: (path: string) => void
  onUnstage: (path: string) => void
  onDiscard: (path: string) => void
}

const FileRow = React.memo(function FileRow({
  file,
  isSelected,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: FileRowProps): React.ReactElement {
  const handleSelect = React.useCallback(() => onSelect(file), [file, onSelect])
  const handleStage = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onStage(file.path)
    },
    [file.path, onStage],
  )
  const handleUnstage = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onUnstage(file.path)
    },
    [file.path, onUnstage],
  )
  const handleDiscard = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onDiscard(file.path)
    },
    [file.path, onDiscard],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleSelect()
        }
      }}
      className={cn(
        "group mx-1 flex h-7 cursor-pointer items-center gap-1 rounded px-2 text-xs select-none",
        isSelected
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      {file.conflicted && <AlertTriangle className="size-3 shrink-0 text-orange-500" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{file.filename}</span>
        {file.dirPart && (
          <span className="text-muted-foreground ml-1.5 text-[10px]">{file.dirPart}</span>
        )}
      </span>
      {/* Status label: visible when not hovered. Hidden (not just faded) on
          hover so flexbox actually reclaims the width for the action buttons. */}
      <span
        className={cn(
          "ml-auto shrink-0 w-3.5 text-right text-[10px] font-semibold group-hover:hidden group-focus-within:hidden",
          file.colorClass,
        )}
      >
        {file.label}
      </span>
      {/* Action buttons: hidden by default, displayed on hover/focus in the
          same slot the label vacates. In-flow (not absolute) so they cannot
          overlap the filename. */}
      <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
        {file.conflicted ? null : file.staged ? (
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent-foreground/10 hover:text-foreground"
            title="Unstage"
            onPointerDown={handleUnstage}
          >
            <Minus className="size-3" />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent-foreground/10 hover:text-destructive"
              title="Discard changes"
              onPointerDown={handleDiscard}
            >
              <RotateCcw className="size-3" />
            </button>
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent-foreground/10 hover:text-foreground"
              title="Stage file"
              onPointerDown={handleStage}
            >
              <Plus className="size-3" />
            </button>
          </>
        )}
      </span>
    </div>
  )
})

const EmptyRow = React.memo(function EmptyRow({ section }: { section: SectionKey }) {
  const msg =
    section === "staged"
      ? "No staged files"
      : section === "conflicts"
        ? "No conflicts"
        : "No changes"
  return <div className="text-muted-foreground/60 px-6 py-1 text-[11px] italic leading-5">{msg}</div>
})

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

interface SourceControlSidebarProps {
  onViewDiff?: (path: string, staged: boolean) => void
  onDiffLoaded?: (path: string, diff: string) => void
}

export const SourceControlSidebar = React.memo(function SourceControlSidebar({
  onViewDiff,
  onDiffLoaded,
}: SourceControlSidebarProps) {
  const workspace = getCurrentWorkspace()

  const [repoInfo, setRepoInfo] = React.useState<GitRepoInfo | null>(null)
  const [rawFiles, setRawFiles] = React.useState<RawGitFileStatus[]>([])
  const [branches, setBranches] = React.useState<GitBranch[]>([])
  const [gitIdentity, setGitIdentity] = React.useState<GitIdentity | null>(null)

  const [commitMessage, setCommitMessage] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [isCommitting, setIsCommitting] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [showBranches, setShowBranches] = React.useState(false)
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null)

  // Publish-branch dialog state. Opens when the user clicks "Publish Branch"
  // and the repo has no remote yet.
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [publishRepoName, setPublishRepoName] = React.useState("")
  const [publishVisibility, setPublishVisibility] = React.useState<GhVisibility>("private")
  const [publishBusy, setPublishBusy] = React.useState(false)
  const [publishError, setPublishError] = React.useState<string | null>(null)
  const [ghCheck, setGhCheck] = React.useState<GhCheckResult | null>(null)
  const [expanded, setExpanded] = React.useState<Record<SectionKey, boolean>>({
    conflicts: true,
    staged: true,
    changes: true,
  })

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const reloadTokenRef = React.useRef(0)

  // Hold callbacks in refs so the component tree does not resubscribe or
  // rebuild handlers when the parent passes new closures each render.
  const onViewDiffRef = React.useRef(onViewDiff)
  const onDiffLoadedRef = React.useRef(onDiffLoaded)
  React.useEffect(() => {
    onViewDiffRef.current = onViewDiff
    onDiffLoadedRef.current = onDiffLoaded
  })

  // ── Data loading ─────────────────────────────────────────────────────────

  const refreshStatus = React.useCallback(async (path: string) => {
    const token = ++reloadTokenRef.current
    try {
      const info = await invoke<GitRepoInfo>("get_git_repo_info", { path })
      if (token !== reloadTokenRef.current) return
      setRepoInfo(info)
      if (!info.initialized) {
        setRawFiles([])
        setBranches([])
        return
      }
      const status = await invoke<RawGitFileStatus[]>("get_git_status", { path })
      if (token !== reloadTokenRef.current) return
      setRawFiles(status)
    } catch (err) {
      console.error("Failed to refresh git status:", err)
    }
  }, [])

  const loadAll = React.useCallback(async (path: string) => {
    setIsLoading(true)
    const token = ++reloadTokenRef.current
    try {
      // Probe repo state first — if `.git` was removed, status/branches will
      // throw and reject the whole batch, leaving stale UI. Branching on
      // `info.initialized` lets us clear state correctly in either case.
      const [info, identity] = await Promise.all([
        invoke<GitRepoInfo>("get_git_repo_info", { path }),
        invoke<GitIdentity>("get_git_global_identity"),
      ])
      if (token !== reloadTokenRef.current) return
      console.log("[git] loadAll repo_info", info)
      setRepoInfo(info)
      setGitIdentity(identity)
      if (!info.initialized) {
        setRawFiles([])
        setBranches([])
        return
      }
      const [status, branchList] = await Promise.all([
        invoke<RawGitFileStatus[]>("get_git_status", { path }),
        invoke<GitBranch[]>("get_git_branches", { path }),
      ])
      if (token !== reloadTokenRef.current) return
      setRawFiles(status)
      setBranches(branchList)
    } catch (err) {
      console.error("Failed to load git info:", err)
    } finally {
      if (token === reloadTokenRef.current) setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (workspace) void loadAll(workspace)
  }, [workspace, loadAll])

  // ── Derived: map + partition files exactly once per rawFiles change ──────

  const { stagedFiles, unstagedFiles, conflictedFiles } = React.useMemo(() => {
    const conflictedFiles: FileEntry[] = []
    const stagedFiles: FileEntry[] = []
    const unstagedFiles: FileEntry[] = []
    for (const raw of rawFiles) {
      const entry = toFileEntry(raw)
      if (entry.conflicted) conflictedFiles.push(entry)
      else if (entry.staged) stagedFiles.push(entry)
      else unstagedFiles.push(entry)
    }
    return { stagedFiles, unstagedFiles, conflictedFiles }
  }, [rawFiles])

  // ── Flatten into a single row list for the virtualized scroller ──────────

  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = []
    if (conflictedFiles.length > 0) {
      out.push({
        type: "header",
        key: "h-conflicts",
        section: "conflicts",
        count: conflictedFiles.length,
        expanded: expanded.conflicts,
      })
      if (expanded.conflicts) {
        for (const f of conflictedFiles) out.push({ type: "file", key: `c-${f.path}`, file: f })
      }
    }
    out.push({
      type: "header",
      key: "h-staged",
      section: "staged",
      count: stagedFiles.length,
      expanded: expanded.staged,
    })
    if (expanded.staged) {
      if (stagedFiles.length === 0) {
        out.push({ type: "empty", key: "e-staged", section: "staged" })
      } else {
        for (const f of stagedFiles) out.push({ type: "file", key: `s-${f.path}`, file: f })
      }
    }
    out.push({
      type: "header",
      key: "h-changes",
      section: "changes",
      count: unstagedFiles.length,
      expanded: expanded.changes,
    })
    if (expanded.changes) {
      if (unstagedFiles.length === 0) {
        out.push({ type: "empty", key: "e-changes", section: "changes" })
      } else {
        for (const f of unstagedFiles) out.push({ type: "file", key: `u-${f.path}`, file: f })
      }
    }
    return out
  }, [conflictedFiles, stagedFiles, unstagedFiles, expanded])

  const { range, totalHeight, offsetHeight } = useWindowRange(scrollRef, rows.length)

  // ── Actions (optimistic) ─────────────────────────────────────────────────

  const loadDiff = React.useCallback(
    async (path: string, staged: boolean) => {
      if (!workspace) return
      try {
        const diff = await invoke<string>("get_file_diff", {
          path: workspace,
          filePath: path,
          staged,
        })
        onDiffLoadedRef.current?.(path, diff)
      } catch {
        onDiffLoadedRef.current?.(path, "(no diff available)")
      }
    },
    [workspace],
  )

  const handleSelect = React.useCallback(
    (file: FileEntry) => {
      setSelectedPath(file.path)
      onViewDiffRef.current?.(file.path, file.staged)
      void loadDiff(file.path, file.staged)
    },
    [loadDiff],
  )

  const handleStage = React.useCallback(
    async (filePath: string) => {
      if (!workspace) return
      setRawFiles((prev) =>
        prev.map((f) =>
          f.path === filePath
            ? { ...f, staged: true, untracked: false, status: f.modified ? "modified" : "added" }
            : f,
        ),
      )
      try {
        await invoke("stage_file", { path: workspace, filePath })
      } catch (err) {
        console.error("Failed to stage file:", err)
      } finally {
        void refreshStatus(workspace)
      }
    },
    [workspace, refreshStatus],
  )

  const handleUnstage = React.useCallback(
    async (filePath: string) => {
      if (!workspace) return
      setRawFiles((prev) =>
        prev.map((f) =>
          f.path === filePath ? { ...f, staged: false, status: f.modified ? "modified" : "untracked" } : f,
        ),
      )
      try {
        await invoke("unstage_file", { path: workspace, filePath })
      } catch (err) {
        console.error("Failed to unstage file:", err)
      } finally {
        void refreshStatus(workspace)
      }
    },
    [workspace, refreshStatus],
  )

  const handleDiscard = React.useCallback(
    async (filePath: string) => {
      if (!workspace) return
      try {
        await invoke("discard_file_changes", { path: workspace, filePath })
      } catch (err) {
        console.error("Failed to discard changes:", err)
      } finally {
        void refreshStatus(workspace)
      }
    },
    [workspace, refreshStatus],
  )

  const handleStageAll = React.useCallback(async () => {
    if (!workspace) return
    setBulkBusy(true)
    try {
      await invoke("stage_all_files", { path: workspace })
      await refreshStatus(workspace)
    } catch (err) {
      console.error("Failed to stage all:", err)
    } finally {
      setBulkBusy(false)
    }
  }, [workspace, refreshStatus])

  const handleUnstageAll = React.useCallback(async () => {
    if (!workspace) return
    setBulkBusy(true)
    try {
      await invoke("unstage_all_files", { path: workspace })
      await refreshStatus(workspace)
    } catch (err) {
      console.error("Failed to unstage all:", err)
    } finally {
      setBulkBusy(false)
    }
  }, [workspace, refreshStatus])

  const handleToggleSection = React.useCallback((section: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  const handleCommit = React.useCallback(async () => {
    if (!workspace || !commitMessage.trim()) return
    if (!gitIdentity?.name || !gitIdentity?.email) {
      alert("Please set up your git user name and email in settings first.")
      return
    }
    setIsCommitting(true)
    try {
      await invoke("commit_changes", { path: workspace, message: commitMessage.trim() })
      setCommitMessage("")
      await loadAll(workspace)
    } catch (err) {
      console.error("Failed to commit:", err)
      alert(`Failed to commit: ${err}`)
    } finally {
      setIsCommitting(false)
    }
  }, [workspace, commitMessage, gitIdentity, loadAll])

  const openPublishDialog = React.useCallback(async () => {
    if (!workspace) return
    const defaultName = workspaceBasename(workspace)
    console.log("[publish] open dialog", { workspace, defaultName, branch: repoInfo?.current_branch })
    setPublishError(null)
    setPublishRepoName(defaultName)
    setPublishVisibility("private")
    setPublishOpen(true)
    // Kick off a gh check in the background so the dialog can surface a
    // helpful hint if gh is missing/unauthenticated before the user tries.
    try {
      const result = await checkGhInstallation()
      console.log("[publish] gh check", result)
      setGhCheck(result)
    } catch (err) {
      console.error("[publish] gh check failed", err)
      setGhCheck(null)
    }
  }, [workspace, repoInfo])

  const handlePublishBranch = React.useCallback(async () => {
    if (!workspace || !repoInfo?.current_branch) {
      console.warn("[publish] aborted: missing workspace or branch", {
        workspace,
        branch: repoInfo?.current_branch,
      })
      return
    }
    const name = publishRepoName.trim()
    if (!name) {
      setPublishError("Enter a repository name.")
      return
    }
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      setPublishError("Repository names can only contain letters, numbers, dots, hyphens, and underscores.")
      return
    }
    console.log("[publish] invoke", {
      workspace,
      branch: repoInfo.current_branch,
      visibility: publishVisibility,
      name,
    })
    setPublishBusy(true)
    setPublishError(null)
    try {
      const result = await ghPublishBranch(workspace, repoInfo.current_branch, publishVisibility, name)
      console.log("[publish] success", result)
      setPublishOpen(false)
      await loadAll(workspace)
    } catch (err) {
      console.error("[publish] failed", err)
      setPublishError(err instanceof Error ? err.message : String(err))
    } finally {
      setPublishBusy(false)
    }
  }, [workspace, repoInfo, publishRepoName, publishVisibility, loadAll])

  const handleCheckoutBranch = React.useCallback(
    async (branchName: string) => {
      if (!workspace) return
      // Clicking the branch you're already on is a no-op. This also avoids
      // `git checkout <name>` failing on an unborn HEAD, where the branch is
      // only a symbolic ref and has no object to check out yet.
      if (branchName === repoInfo?.current_branch) {
        setShowBranches(false)
        return
      }
      try {
        await invoke("checkout_branch", { path: workspace, branchName })
        setShowBranches(false)
        await loadAll(workspace)
      } catch (err) {
        console.error("Failed to checkout branch:", err)
      }
    },
    [workspace, repoInfo, loadAll],
  )

  const handleCreateBranch = React.useCallback(async () => {
    if (!workspace) return
    const branchName = prompt("Enter new branch name:")
    if (!branchName) return
    try {
      await invoke("create_git_branch", { path: workspace, branchName })
      await loadAll(workspace)
    } catch (err) {
      console.error("Failed to create branch:", err)
    }
  }, [workspace, loadAll])

  const handleInitGit = React.useCallback(async () => {
    if (!workspace) return
    try {
      await invoke("init_git_repo", { path: workspace })
      await loadAll(workspace)
    } catch (err) {
      console.error("Failed to init git:", err)
    }
  }, [workspace, loadAll])

  const handleRefresh = React.useCallback(() => {
    if (workspace) void loadAll(workspace)
  }, [workspace, loadAll])

  // ── Derived UI state ─────────────────────────────────────────────────────

  const totalChanges = stagedFiles.length + unstagedFiles.length + conflictedFiles.length
  const canCommit = stagedFiles.length > 0 && commitMessage.trim().length > 0 && !isCommitting
  // Show the Publish Branch CTA when the repo has no remote and there's
  // nothing to commit right now — either because the working tree is clean
  // (post-initial-commit) or because the user has pending changes but none
  // are staged yet. In the latter case the commit UI would be empty and
  // non-actionable, so the publish shortcut is the more useful thing to
  // surface. We still require at least one commit, since publishing an
  // unborn HEAD has nothing to push.
  const hasPendingStagedCommit = stagedFiles.length > 0
  const showPublishPanel =
    repoInfo?.initialized === true &&
    repoInfo.has_commits &&
    !repoInfo.has_remote &&
    !hasPendingStagedCommit

  const handleCommitKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCommit) {
        e.preventDefault()
        void handleCommit()
      }
    },
    [canCommit, handleCommit],
  )

  // ── Render early returns ─────────────────────────────────────────────────

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground text-xs leading-relaxed">
          No workspace found. Set up your workspace in Settings first.
        </p>
      </div>
    )
  }

  if (repoInfo?.initialized === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
        <GitBranchIcon className="text-muted-foreground/40 size-8" aria-hidden />
        <div className="space-y-1">
          <p className="text-foreground text-sm font-medium">No git repository</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Initialize a git repository in your workspace to track changes.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={isLoading}
          onClick={() => void handleInitGit()}
        >
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <GitBranchIcon className="size-3.5" />}
          Initialize repository
        </Button>
      </div>
    )
  }

  // ── Virtualized slice ────────────────────────────────────────────────────

  const visibleRows =
    range.end >= range.start ? rows.slice(range.start, range.end + 1) : []

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="flex h-9 shrink-0 items-center gap-1 px-3 border-b border-sidebar-border/60">
        <span className="text-foreground text-xs font-semibold uppercase tracking-wide">
          Source Control
          {totalChanges > 0 && (
            <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {totalChanges}
            </span>
          )}
        </span>
      </div>

      <div className="border-b border-sidebar-border/50 px-2 pb-2 pt-1 shrink-0">
        {showPublishPanel ? (
          <Button
            type="button"
            size="sm"
            className="h-7 w-full gap-1.5 text-xs"
            onClick={() => void openPublishDialog()}
          >
            <CloudUpload className="size-3.5" />
            Publish Branch
          </Button>
        ) : (
          <>
            <textarea
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-none rounded-md border px-2.5 py-2 text-xs leading-relaxed focus-visible:ring-1 focus-visible:outline-none disabled:opacity-50"
              rows={3}
              placeholder="Commit message (⌘/Ctrl+Enter to commit)"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={handleCommitKeyDown}
              disabled={isCommitting}
            />
            <div className="mt-1.5 flex gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-6 flex-1 gap-1 px-2 text-xs"
                disabled={!canCommit}
                onClick={() => void handleCommit()}
              >
                {isCommitting ? <Loader2 className="size-3 animate-spin" /> : <GitCommitHorizontal className="size-3" />}
                Commit
              </Button>
            </div>
            {stagedFiles.length === 0 && unstagedFiles.length > 0 && (
              <p className="text-muted-foreground mt-1 text-[10px]">Stage files to enable commit.</p>
            )}
          </>
        )}
      </div>

      {/* Virtualized scroller: container holds totalHeight, inner window is
          positioned at offsetHeight. Row list is sliced to `range`. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {totalChanges === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center">
            <Check className="text-muted-foreground/40 size-8" aria-hidden />
            <p className="text-muted-foreground text-xs">Working tree clean</p>
          </div>
        ) : (
          <div style={{ height: totalHeight, position: "relative" }}>
            <div
              style={{
                transform: `translateY(${offsetHeight}px)`,
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
              }}
            >
              {visibleRows.map((row) => (
                <div key={row.key} style={{ height: ROW_HEIGHT }}>
                  {row.type === "header" ? (
                    <HeaderRow
                      section={row.section}
                      count={row.count}
                      expanded={row.expanded}
                      onToggle={handleToggleSection}
                      onStageAll={handleStageAll}
                      onUnstageAll={handleUnstageAll}
                      bulkBusy={bulkBusy}
                    />
                  ) : row.type === "file" ? (
                    <FileRow
                      file={row.file}
                      isSelected={selectedPath === row.file.path}
                      onSelect={handleSelect}
                      onStage={handleStage}
                      onUnstage={handleUnstage}
                      onDiscard={handleDiscard}
                    />
                  ) : (
                    <EmptyRow section={row.section} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <SidebarFooter>
        <div className="relative flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={() => setShowBranches((v) => !v)}
          >
            <GitBranchIcon className="size-3" />
            <span>{repoInfo?.current_branch || "No branch"}</span>
            {repoInfo && (repoInfo.ahead > 0 || repoInfo.behind > 0) && (
              <span className="text-muted-foreground">
                {repoInfo.ahead > 0 && `↑${repoInfo.ahead}`}
                {repoInfo.behind > 0 && `↓${repoInfo.behind}`}
              </span>
            )}
            <ChevronDown className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground size-6"
            title="Refresh"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>

          {/* Popover: anchored to the branch button row, rendered *above* it
              (bottom-full) so it can't overflow the window below. Capped at
              the available viewport height so long branch lists scroll. */}
          {showBranches && (
            <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 rounded-md border border-sidebar-border/60 bg-sidebar shadow-lg">
              <div className="max-h-[min(12rem,calc(100vh-8rem))] overflow-auto p-1">
                <div className="px-2 py-1 text-xs text-muted-foreground">Branches</div>
                {branches.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground/70 italic">
                    No branches yet
                  </div>
                ) : (
                  branches.map((branch) => (
                    <button
                      key={branch.name}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        branch.is_current && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                      onClick={() => void handleCheckoutBranch(branch.name)}
                    >
                      <GitBranchIcon className="size-3" />
                      <span className="truncate">{branch.name}</span>
                      {branch.is_current && <Check className="size-3 ml-auto" />}
                    </button>
                  ))
                )}
                <div className="mt-1 border-t border-sidebar-border/60 pt-1">
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={() => void handleCreateBranch()}
                  >
                    <Plus className="size-3" />
                    Create new branch
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarFooter>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish branch to GitHub</DialogTitle>
            <DialogDescription>
              Create a GitHub repository and push{" "}
              <span className="font-mono text-foreground">{repoInfo?.current_branch ?? ""}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="publish-repo-name">Repository name</Label>
              <Input
                id="publish-repo-name"
                value={publishRepoName}
                onChange={(e) => setPublishRepoName(e.target.value)}
                disabled={publishBusy}
                autoFocus
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                Created under your GitHub account. Letters, numbers, dots, hyphens, underscores.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={publishBusy}
                  onClick={() => setPublishVisibility("private")}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                    publishVisibility === "private"
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:bg-muted/40",
                  )}
                >
                  <Lock className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Private</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">
                      Only you can see it.
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={publishBusy}
                  onClick={() => setPublishVisibility("public")}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                    publishVisibility === "public"
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:bg-muted/40",
                  )}
                >
                  <Globe className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Public</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">
                      Anyone on GitHub can see it.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {ghCheck && (!ghCheck.installed || !ghCheck.authenticated) ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                {ghCheck.installed
                  ? "You're not signed in to GitHub CLI. Open Settings → Account to sign in, then try again."
                  : "GitHub CLI isn't installed. Set it up from Settings → Account."}
              </div>
            ) : null}

            {publishError ? (
              <p className="text-xs text-destructive" role="alert">{publishError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPublishOpen(false)}
              disabled={publishBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handlePublishBranch()}
              disabled={publishBusy || !publishRepoName.trim()}
            >
              {publishBusy ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Publishing…
                </>
              ) : (
                <>
                  <CloudUpload className="mr-1.5 size-3.5" />
                  Publish
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})

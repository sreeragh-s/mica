import { BookOpenIcon, FolderIcon, XIcon } from "lucide-react"
import {
  type ChangeEvent,
  type ComponentProps,
  type Dispatch,
  type KeyboardEventHandler,
  type SetStateAction,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { Badge, badgeVariants } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { InputGroupTextarea } from "@/components/ui/input-group"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { DEFAULT_WORKSPACE_ID } from "@/lib/notes/notes-storage"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptInputChatReference =
  | { kind: "note"; refId: string; label: string }
  | { kind: "workspace"; refId: string; label: string }

export type PromptInputChatMentionNote = {
  id: string
  title: string
  folderId: string
  /** Shown in @-mention rows when set (matches note title emoji). */
  titleEmoji?: string | null
}
export type PromptInputChatMentionWorkspace = { id: string; name: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cursor is inside an unfinished `@query` segment (same line, after whitespace-start `@`). */
export function getActiveMentionText(
  value: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = value.slice(0, cursor)
  const at = before.lastIndexOf("@")
  if (at === -1) return null
  const charBefore = at > 0 ? before[at - 1] : ""
  if (at > 0 && !/[\s\n]/.test(charBefore)) return null
  const afterAt = before.slice(at + 1)
  if (afterAt.includes("\n")) return null
  return { start: at, query: afterAt }
}

function referenceKey(r: PromptInputChatReference): string {
  return r.kind === "note" ? `n:${r.refId}` : `w:${r.refId}`
}

export function addChatReference(
  refs: PromptInputChatReference[],
  next: PromptInputChatReference,
): PromptInputChatReference[] {
  const k = referenceKey(next)
  if (refs.some(r => referenceKey(r) === k)) return refs
  return [...refs, next]
}

/** Matches NotesSidebar / note-link-picker: empty title shows as "Untitled" in UI. */
function displayNoteTitle(title: string): string {
  return title.trim() || "Untitled"
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/** Open note in the editor — shown as outline badge until added to references. */
export type PromptInputChatEditorNote = {
  id: string
  title: string
  titleEmoji?: string | null
}

export type PromptInputChatReferenceChipsProps = {
  references: PromptInputChatReference[]
  onRemove: (r: PromptInputChatReference) => void
  onReferencesChange: Dispatch<SetStateAction<PromptInputChatReference[]>>
  className?: string
  /** When set and not already listed in `references`, shows an outline badge; click adds a note reference. */
  editorNote?: PromptInputChatEditorNote | null
}

export function PromptInputChatReferenceChips({
  references,
  onRemove,
  onReferencesChange,
  className,
  editorNote,
}: PromptInputChatReferenceChipsProps) {
  const editorNoteInReferences = Boolean(
    editorNote &&
      references.some(r => r.kind === "note" && r.refId === editorNote.id),
  )
  const showOutlineEditorPill = Boolean(editorNote && !editorNoteInReferences)

  if (references.length === 0 && !showOutlineEditorPill) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {showOutlineEditorPill && editorNote ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  badgeVariants({ variant: "outline" }),
                  "max-w-full cursor-pointer gap-1  font-normal hover:bg-accent/50",
                )}
                onClick={() =>
                  onReferencesChange(prev =>
                    addChatReference(prev, {
                      kind: "note",
                      label: displayNoteTitle(editorNote.title),
                      refId: editorNote.id,
                    }),
                  )
                }
                type="button"
              >
                {editorNote.titleEmoji?.trim() ? (
                  <span className="text-sm leading-none" aria-hidden>
                    {editorNote.titleEmoji.trim()}
                  </span>
                ) : (
                  <BookOpenIcon aria-hidden className="size-3 shrink-0 opacity-70" />
                )}
                <span className="max-w-[160px] truncate">
                  {displayNoteTitle(editorNote.title)}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Add open note as reference</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      {references.map(r => (
        <Badge
          key={referenceKey(r)}
          className="max-w-full gap-1 pr-0.5 font-normal"
          variant="secondary"
        >
          {r.kind === "note" ? (
            <BookOpenIcon aria-hidden className="size-3 shrink-0 opacity-70" />
          ) : (
            <FolderIcon aria-hidden className="size-3 shrink-0 opacity-70" />
          )}
          <span className="max-w-[160px] truncate">{r.label}</span>
          <button
            aria-label={`Remove ${r.label}`}
            className="rounded-full p-0.5 hover:bg-background/80"
            onClick={() => onRemove(r)}
            type="button"
          >
            <XIcon className="size-3 opacity-70" />
          </button>
        </Badge>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Textarea with @-mentions
// ---------------------------------------------------------------------------

export type PromptInputChatMentionTextareaProps = Omit<
  ComponentProps<typeof InputGroupTextarea>,
  "onChange" | "value"
> & {
  value: string
  onChange: (value: string) => void
  notes: PromptInputChatMentionNote[]
  workspaces: PromptInputChatMentionWorkspace[]
  onReferencesChange: Dispatch<SetStateAction<PromptInputChatReference[]>>
}

/** Imperative API (paperclip / shortcuts): same behavior as typing `@`. */
export type PromptInputChatMentionTextareaHandle = {
  focus: (options?: Parameters<HTMLTextAreaElement["focus"]>[0]) => void
  blur: () => void
  /** Inserts `@` at the caret and opens the reference picker. */
  openReferencePicker: () => void
}

type MentionCandidate =
  | { kind: "workspace"; id: string; label: string }
  | {
      kind: "note"
      id: string
      label: string
      folderLabel: string
      titleEmoji?: string | null
    }

export const PromptInputChatMentionTextarea = forwardRef<
  PromptInputChatMentionTextareaHandle,
  PromptInputChatMentionTextareaProps
>(function PromptInputChatMentionTextarea(
  {
    value,
    onChange,
    notes,
    workspaces,
    onReferencesChange,
    className,
    onKeyDown,
    disabled,
    ...rest
  },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const openReferencePicker = useCallback(() => {
    const el = innerRef.current
    if (!el || disabled) return
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const before = value.slice(0, start)
    const after = value.slice(end)
    let insertStr = "@"
    if (start > 0) {
      const prev = value[start - 1]
      if (prev && !/[\s\n]/.test(prev)) insertStr = " @"
    }
    const newValue = before + insertStr + after
    onChange(newValue)
    const pos = start + insertStr.length
    requestAnimationFrame(() => {
      const ta = innerRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(pos, pos)
      setMentionOpen(true)
      setTick(t => t + 1)
    })
  }, [disabled, onChange, value])

  useImperativeHandle(
    ref,
    () => ({
      blur: () => innerRef.current?.blur(),
      focus: (options?: Parameters<HTMLTextAreaElement["focus"]>[0]) =>
        innerRef.current?.focus(options),
      openReferencePicker,
    }),
    [openReferencePicker],
  )

  const [mentionOpen, setMentionOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [tick, setTick] = useState(0)

  const mention = useMemo(() => {
    const el = innerRef.current
    const cursor = el?.selectionStart ?? value.length
    return getActiveMentionText(value, cursor)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces recompute after selection moves
  }, [value, tick])

  const candidates = useMemo((): MentionCandidate[] => {
    const q = (mention?.query ?? "").toLowerCase().trim()
    const ws: MentionCandidate[] = workspaces
      .filter(w => !q || w.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map(w => ({ kind: "workspace" as const, id: w.id, label: w.name }))
    const ns: MentionCandidate[] = notes
      .filter(n => !q || displayNoteTitle(n.title).toLowerCase().includes(q))
      .slice(0, 12)
      .map(n => {
        const folderLabel =
          workspaces.find(w => w.id === n.folderId)?.name ??
          (n.folderId === DEFAULT_WORKSPACE_ID ? "Root" : "Workspace")
        return {
          kind: "note" as const,
          id: n.id,
          label: displayNoteTitle(n.title),
          folderLabel,
          titleEmoji: n.titleEmoji,
        }
      })
    return [...ws, ...ns]
  }, [mention?.query, notes, workspaces])

  useEffect(() => {
    setHighlight(0)
  }, [mention?.query, mentionOpen])

  const showMentionPopover = mentionOpen && !!mention
  const activeIndex = candidates.length === 0 ? 0 : Math.min(highlight, candidates.length - 1)

  useEffect(() => {
    if (!showMentionPopover) return
    const el = listRef.current?.querySelector(`[data-mention-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, showMentionPopover])

  const selectCandidate = useCallback(
    (item: MentionCandidate) => {
      const el = innerRef.current
      if (!el) return
      const m = getActiveMentionText(value, el.selectionStart ?? value.length)
      if (!m) return

      const cursor = el.selectionStart ?? value.length
      const before = value.slice(0, m.start)
      const after = value.slice(cursor)
      onChange(before + after)

      const next: PromptInputChatReference =
        item.kind === "note"
          ? { kind: "note", refId: item.id, label: item.label }
          : { kind: "workspace", refId: item.id, label: item.label }
      onReferencesChange(prev => addChatReference(prev, next))

      setMentionOpen(false)

      requestAnimationFrame(() => {
        const ta = innerRef.current
        if (!ta) return
        const pos = before.length
        ta.focus()
        ta.setSelectionRange(pos, pos)
        setTick(t => t + 1)
      })
    },
    [onChange, onReferencesChange, value],
  )

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    const pos = e.target.selectionStart ?? v.length
    onChange(v)
    const m = getActiveMentionText(v, pos)
    if (m) setMentionOpen(true)
    else setMentionOpen(false)
    setTick(t => t + 1)
  }

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = e => {
    const el = innerRef.current
    const mNow = el ? getActiveMentionText(value, el.selectionStart ?? value.length) : null

    if (mentionOpen && mNow) {
      if (e.key === "Escape") {
        e.preventDefault()
        if (el) {
          const cursor = el.selectionStart ?? value.length
          const before = value.slice(0, mNow.start)
          const after = value.slice(cursor)
          onChange(before + after)
          requestAnimationFrame(() => {
            const ta = innerRef.current
            if (!ta) return
            const pos = mNow.start
            ta.focus()
            ta.setSelectionRange(pos, pos)
            setTick(t => t + 1)
          })
        }
        setMentionOpen(false)
        return
      }
      if (candidates.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setHighlight(h => Math.min(h + 1, candidates.length - 1))
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setHighlight(h => Math.max(h - 1, 0))
          return
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          const maxIdx = Math.max(0, candidates.length - 1)
          const idx = Math.min(highlight, maxIdx)
          const picked = candidates[idx]
          if (picked) selectCandidate(picked)
          return
        }
      }
    }

    onKeyDown?.(e)
  }

  const hasWorkspaces = candidates.some(c => c.kind === "workspace")

  return (
    <Popover
      open={showMentionPopover}
      onOpenChange={next => {
        if (!next) setMentionOpen(false)
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative min-w-0 w-full flex-1">
          <InputGroupTextarea
            ref={innerRef}
            aria-autocomplete="list"
            aria-expanded={showMentionPopover}
            className={className}
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={() => setTick(t => t + 1)}
            onClick={() => setTick(t => t + 1)}
            value={value}
            {...rest}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="center"
        className="border-border bg-popover text-popover-foreground max-h-[min(50vh,340px)] w-[min(28rem,calc(100vw-2rem))] overflow-hidden p-0 shadow-lg"
        onCloseAutoFocus={e => e.preventDefault()}
        onOpenAutoFocus={e => e.preventDefault()}
        side="top"
        sideOffset={6}
      >
        <div
          ref={listRef}
          aria-label="Reference notes or workspaces"
          className="max-h-[min(50vh,340px)] overflow-y-auto p-1"
          role="listbox"
        >
          {candidates.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              No matching notes or workspaces.
            </p>
          ) : (
            <>
              {hasWorkspaces && (
                <p className="text-muted-foreground px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide">
                  Workspaces
                </p>
              )}
              {candidates.map((c, idx) => {
                const showNotesHeader =
                  c.kind === "note" && (idx === 0 || candidates[idx - 1]!.kind === "workspace")
                return (
                  <div key={`${c.kind}-${c.id}`}>
                    {showNotesHeader && (
                      <p
                        className={cn(
                          "text-muted-foreground px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide",
                          idx > 0 && "border-border mt-1 border-t",
                        )}
                      >
                        Notes
                      </p>
                    )}
                    <Button
                      aria-selected={idx === activeIndex}
                      className={cn(
                        "h-auto min-h-0 w-full flex-col items-stretch gap-1 rounded-md px-2.5 py-2 text-left font-normal",
                        idx === activeIndex && "bg-accent text-accent-foreground",
                      )}
                      data-mention-index={idx}
                      onClick={() => selectCandidate(c)}
                      onMouseDown={e => e.preventDefault()}
                      onMouseEnter={() => setHighlight(idx)}
                      role="option"
                      type="button"
                      variant="ghost"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {c.kind === "workspace" ? (
                          <FolderIcon
                            aria-hidden
                            className="text-muted-foreground size-4 shrink-0 opacity-90"
                          />
                        ) : c.titleEmoji?.trim() ? (
                          <span
                            className="flex size-4 shrink-0 items-center justify-center text-base leading-none"
                            aria-hidden
                          >
                            {c.titleEmoji.trim()}
                          </span>
                        ) : (
                          <BookOpenIcon
                            aria-hidden
                            className="text-muted-foreground size-4 shrink-0 opacity-90"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
                          {c.label}
                        </span>
                      </div>
                      {c.kind === "note" && (
                        <div className="text-muted-foreground pl-6 text-xs leading-snug">
                          <span className="mt-0.5 block opacity-80">{c.folderLabel}</span>
                        </div>
                      )}
                    </Button>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})

'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ESCAPE_COMMAND,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode
} from 'lexical'
import { ChevronDown, ChevronUp, WholeWord, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Mirrors `ElementNode.getTextContent` so search offsets align with `$getRoot().getTextContent()`. */
const DOUBLE_LINE_BREAK = '\n\n'

type MappedSpan =
  | { kind: 'text'; key: string; start: number; end: number }
  | { kind: 'linebreak'; key: string; start: number; end: number }

function appendSyntheticBreak(flat: { value: string }, global: { i: number }): void {
  flat.value += DOUBLE_LINE_BREAK
  global.i += DOUBLE_LINE_BREAK.length
}

function visitNode(
  node: LexicalNode,
  flat: { value: string },
  global: { i: number },
  spans: MappedSpan[]
): void {
  if ($isTextNode(node)) {
    const text = node.getTextContent()
    if (text.length === 0) return
    const start = global.i
    flat.value += text
    global.i += text.length
    spans.push({ kind: 'text', key: node.getKey(), start, end: global.i })
    return
  }
  if ($isLineBreakNode(node)) {
    const start = global.i
    flat.value += '\n'
    global.i += 1
    spans.push({ kind: 'linebreak', key: node.getKey(), start, end: global.i })
    return
  }
  if ($isElementNode(node)) {
    visitElement(node, flat, global, spans)
    return
  }
  const fallback = node.getTextContent()
  if (fallback.length > 0) {
    flat.value += fallback
    global.i += fallback.length
  }
}

function visitElement(
  el: ElementNode,
  flat: { value: string },
  global: { i: number },
  spans: MappedSpan[]
): void {
  const children = el.getChildren()
  const n = children.length
  for (let i = 0; i < n; i++) {
    const child = children[i]
    visitNode(child, flat, global, spans)
    if ($isElementNode(child) && i !== n - 1 && !child.isInline()) {
      appendSyntheticBreak(flat, global)
    }
  }
}

function collectMappedText(): { flat: string; spans: MappedSpan[] } {
  const flat = { value: '' }
  const global = { i: 0 }
  const spans: MappedSpan[] = []
  visitElement($getRoot(), flat, global, spans)
  return { flat: flat.value, spans }
}

function isWordCharAt(s: string, index: number): boolean {
  const c = s[index]
  if (!c) return false
  return /[\p{L}\p{M}\p{N}_]/u.test(c)
}

function isWholeWordAt(haystack: string, start: number, len: number): boolean {
  const leftOk = start === 0 || !isWordCharAt(haystack, start - 1)
  const rightOk = start + len >= haystack.length || !isWordCharAt(haystack, start + len)
  return leftOk && rightOk
}

function findMatchRanges(
  flat: string,
  query: string,
  wholeWord: boolean
): { start: number; end: number }[] {
  if (!query) return []
  const hay = flat.toLowerCase()
  const q = query.toLowerCase()
  const out: { start: number; end: number }[] = []
  let from = 0
  while (from <= hay.length - q.length) {
    const i = hay.indexOf(q, from)
    if (i < 0) break
    const end = i + q.length
    if (!wholeWord || isWholeWordAt(flat, i, q.length)) {
      out.push({ start: i, end })
    }
    from = i + 1
  }
  return out
}

function spansCoveringRange(spans: MappedSpan[], start: number, end: number): MappedSpan[] {
  const hit: MappedSpan[] = []
  for (const s of spans) {
    if (s.end <= start) continue
    if (s.start >= end) break
    if (s.start < end && s.end > start) hit.push(s)
  }
  return hit
}

function filterSelectable(
  raw: { start: number; end: number }[],
  spans: MappedSpan[]
): { start: number; end: number }[] {
  return raw.filter((m) => spansCoveringRange(spans, m.start, m.end).length === 1)
}

const HIGHLIGHT_OTHER = 'notelab-editor-find'
const HIGHLIGHT_ACTIVE = 'notelab-editor-find-active'

type HighlightRegistryMap = {
  delete(name: string): void
  set(name: string, highlight: Highlight): void
}

function supportsCssCustomHighlight(): boolean {
  return typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && 'highlights' in CSS
}

function getHighlightRegistry(): HighlightRegistryMap | null {
  if (!supportsCssCustomHighlight()) return null
  return CSS.highlights as unknown as HighlightRegistryMap
}

function clearFindHighlights(): void {
  const reg = getHighlightRegistry()
  if (!reg) return
  reg.delete(HIGHLIGHT_OTHER)
  reg.delete(HIGHLIGHT_ACTIVE)
}

/** Map an offset within one Lexical text segment to a DOM text node + offset (handles split text nodes). */
function getTextPointInRichText(
  rootEl: HTMLElement,
  offset: number
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT)
  let consumed = 0
  let last: Text | null = null
  let n: Node | null
  while ((n = walker.nextNode())) {
    const t = n as Text
    last = t
    const len = t.length
    if (offset <= consumed + len) {
      return { node: t, offset: Math.max(0, Math.min(offset - consumed, len)) }
    }
    consumed += len
  }
  if (last && offset === consumed) {
    return { node: last, offset: last.length }
  }
  return null
}

function createDOMRangeForTextMatch(
  editor: LexicalEditor,
  nodeKey: string,
  startOff: number,
  endOff: number
): Range | null {
  const el = editor.getElementByKey(nodeKey)
  if (!el) return null
  const a = getTextPointInRichText(el, startOff)
  const b = getTextPointInRichText(el, endOff)
  if (!a || !b) return null
  try {
    const range = document.createRange()
    range.setStart(a.node, a.offset)
    range.setEnd(b.node, b.offset)
    if (range.collapsed && endOff > startOff) return null
    return range
  } catch {
    return null
  }
}

function createDOMRangeForLineBreak(editor: LexicalEditor, nodeKey: string): Range | null {
  const el = editor.getElementByKey(nodeKey)
  if (!el) return null
  try {
    const range = document.createRange()
    range.setStartBefore(el)
    range.setEndAfter(el)
    return range
  } catch {
    return null
  }
}

function matchToDOMRange(
  editor: LexicalEditor,
  match: { start: number; end: number },
  spans: MappedSpan[]
): Range | null {
  const covering = spansCoveringRange(spans, match.start, match.end)
  if (covering.length !== 1) return null
  const span = covering[0]
  if (span.kind === 'text') {
    const startOff = match.start - span.start
    const endOff = match.end - span.start
    return createDOMRangeForTextMatch(editor, span.key, startOff, endOff)
  }
  if (span.kind === 'linebreak' && match.end - match.start === 1) {
    return createDOMRangeForLineBreak(editor, span.key)
  }
  return null
}

function applyFindCssHighlights(
  editor: LexicalEditor,
  matches: { start: number; end: number }[],
  currentIndex: number,
  spans: MappedSpan[]
): void {
  const reg = getHighlightRegistry()
  if (!reg) return
  const inactive: Range[] = []
  const active: Range[] = []
  for (let i = 0; i < matches.length; i++) {
    const r = matchToDOMRange(editor, matches[i], spans)
    if (!r) continue
    if (i === currentIndex) active.push(r)
    else inactive.push(r)
  }
  if (inactive.length > 0) {
    const h = new Highlight(...inactive)
    h.priority = 0
    reg.set(HIGHLIGHT_OTHER, h)
  } else {
    reg.delete(HIGHLIGHT_OTHER)
  }
  if (active.length > 0) {
    const h = new Highlight(...active)
    h.priority = 1
    reg.set(HIGHLIGHT_ACTIVE, h)
  } else {
    reg.delete(HIGHLIGHT_ACTIVE)
  }
}

function scrollActiveMatchIntoView(
  editor: LexicalEditor,
  matches: { start: number; end: number }[],
  currentIndex: number,
  spans: MappedSpan[],
  behavior: ScrollBehavior
): void {
  if (matches.length === 0) return
  const m = matches[currentIndex]
  if (!m) return
  const range = matchToDOMRange(editor, m, spans)
  if (!range) return

  const rootEl = editor.getRootElement()
  let scrollHost: HTMLElement | null = null
  let p: HTMLElement | null = rootEl?.parentElement ?? null
  while (p) {
    const st = getComputedStyle(p)
    if (
      (st.overflowY === 'auto' || st.overflowY === 'scroll') &&
      p.scrollHeight > p.clientHeight + 1
    ) {
      scrollHost = p
      break
    }
    p = p.parentElement
  }

  const rects = range.getClientRects()
  const box = rects.length > 0 ? rects[0] : range.getBoundingClientRect()
  if (scrollHost && (box.width > 0 || box.height > 0)) {
    const hr = scrollHost.getBoundingClientRect()
    const nextTop =
      box.top - hr.top + scrollHost.scrollTop - scrollHost.clientHeight / 2 + box.height / 2
    scrollHost.scrollTo({ top: Math.max(0, nextTop), behavior })
    return
  }

  const startEl =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? (range.startContainer.parentElement as Element | null)
      : (range.startContainer as Element)
  startEl?.scrollIntoView({ behavior, block: 'center', inline: 'nearest' })
}

function applyMatch(
  editor: LexicalEditor,
  match: { start: number; end: number },
  spans: MappedSpan[]
): boolean {
  const covering = spansCoveringRange(spans, match.start, match.end)
  if (covering.length !== 1) return false
  const span = covering[0]
  if (span.kind === 'text') {
    const anchorOffset = match.start - span.start
    const focusOffset = match.end - span.start
    if (anchorOffset < 0 || focusOffset > span.end - span.start) return false
    editor.update(
      () => {
        const sel = $createRangeSelection()
        sel.anchor.set(span.key, anchorOffset, 'text')
        sel.focus.set(span.key, focusOffset, 'text')
        $setSelection(sel)
      },
      { tag: 'editor-find' }
    )
    return true
  }
  if (span.kind === 'linebreak' && match.end - match.start === 1) {
    editor.update(
      () => {
        const sel = $createRangeSelection()
        sel.anchor.set(span.key, 0, 'element')
        sel.focus.set(span.key, 1, 'element')
        $setSelection(sel)
      },
      { tag: 'editor-find' }
    )
    return true
  }
  return false
}

function focusGlobalOffset(spans: MappedSpan[]): number {
  const sel = $getSelection()
  if (!$isRangeSelection(sel)) return 0
  const key = sel.focus.key
  const offset = sel.focus.offset
  const type = sel.focus.type
  for (const span of spans) {
    if (span.key !== key) continue
    if (span.kind === 'text' && type === 'text') {
      return span.start + Math.min(offset, span.end - span.start)
    }
    if (span.kind === 'linebreak' && type === 'element') {
      return span.start + Math.min(offset, 1)
    }
  }
  return 0
}

function firstMatchIndexFromCursor(
  matches: { start: number; end: number }[],
  cursor: number
): number {
  if (matches.length === 0) return 0
  const idx = matches.findIndex((m) => m.start >= cursor)
  return idx === -1 ? 0 : idx
}

export function EditorFindPlugin({
  anchorElem
}: {
  anchorElem: HTMLDivElement | null
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [wholeWord, setWholeWord] = useState(false)
  const [matches, setMatches] = useState<{ start: number; end: number }[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSpansRef = useRef<MappedSpan[]>([])
  const scrollBehaviorRef = useRef<ScrollBehavior>('auto')

  const queryRef = useRef(query)
  const wholeWordRef = useRef(wholeWord)
  const openRef = useRef(open)

  useLayoutEffect(() => {
    queryRef.current = query
    wholeWordRef.current = wholeWord
    openRef.current = open
  }, [query, wholeWord, open])

  const syncFromEditor = useCallback(
    (indexMode: 'cursor' | 'start' | 'clamp') => {
      editor.getEditorState().read(() => {
        const { flat, spans } = collectMappedText()
        lastSpansRef.current = spans
        const raw = findMatchRanges(flat, queryRef.current, wholeWordRef.current)
        const selectable = filterSelectable(raw, spans)
        setMatches(selectable)
        if (indexMode === 'start') {
          setCurrentIndex(0)
        } else if (indexMode === 'cursor') {
          setCurrentIndex(firstMatchIndexFromCursor(selectable, focusGlobalOffset(spans)))
        } else {
          setCurrentIndex((prev) =>
            selectable.length === 0 ? 0 : Math.min(prev, selectable.length - 1)
          )
        }
      })
    },
    [editor]
  )

  useEffect(() => {
    if (!open) return
    syncFromEditor('cursor')
  }, [open, wholeWord, syncFromEditor])

  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
      if (tags?.has('editor-find')) return
      if (!openRef.current) return
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
      syncFromEditor('clamp')
    })
  }, [editor, syncFromEditor])

  useLayoutEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open])

  useEffect(() => {
    if (!anchorElem) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'f') return
      const t = e.target
      const inAnchor = t instanceof Node && anchorElem.contains(t)
      const inFindBar =
        t instanceof Element &&
        typeof t.closest === 'function' &&
        Boolean(t.closest('[data-notelab-find-bar]'))
      if (!(t instanceof Node) || (!inAnchor && !inFindBar)) return
      e.preventDefault()
      e.stopPropagation()
      setOpen(true)
      queueMicrotask(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [anchorElem])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!open) return false
          setOpen(false)
          return true
        },
        COMMAND_PRIORITY_HIGH
      )
    )
  }, [editor, open])

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (matches.length === 0) return
      scrollBehaviorRef.current = 'smooth'
      const i = ((nextIndex % matches.length) + matches.length) % matches.length
      setCurrentIndex(i)
    },
    [matches.length]
  )

  useLayoutEffect(() => {
    if (!open) {
      clearFindHighlights()
      return
    }

    const spans = lastSpansRef.current
    const behavior = scrollBehaviorRef.current

    const id = requestAnimationFrame(() => {
      const useHighlight = supportsCssCustomHighlight()
      if (matches.length === 0) {
        clearFindHighlights()
      } else if (useHighlight) {
        applyFindCssHighlights(editor, matches, currentIndex, spans)
      } else {
        applyMatch(editor, matches[currentIndex], spans)
      }

      scrollActiveMatchIntoView(editor, matches, currentIndex, spans, behavior)
      scrollBehaviorRef.current = 'auto'

      if (!useHighlight && matches.length > 0) {
        const inputEl = inputRef.current
        let restore: { s: number; e: number } | null = null
        if (inputEl && document.activeElement === inputEl) {
          restore = {
            s: inputEl.selectionStart ?? 0,
            e: inputEl.selectionEnd ?? 0
          }
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = inputRef.current
            if (!el) return
            el.focus({ preventScroll: true })
            const n = el.value.length
            if (restore) {
              el.setSelectionRange(Math.min(restore.s, n), Math.min(restore.e, n))
            } else {
              el.setSelectionRange(n, n)
            }
          })
        })
      }
    })

    return () => cancelAnimationFrame(id)
  }, [open, editor, matches, currentIndex])

  useEffect(() => {
    return () => clearFindHighlights()
  }, [])

  const countLabel = useMemo(() => {
    if (!query.trim()) return ''
    if (matches.length === 0) return '0 / 0'
    return `${currentIndex + 1} / ${matches.length}`
  }, [query, matches.length, currentIndex])

  if (!anchorElem || !open) return null

  return (
    <div
      data-notelab-find-bar
      className={cn(
        'border-border bg-background/95 supports-[backdrop-filter]:bg-background/90 pointer-events-auto flex max-w-[min(100%-1rem,26rem)] flex-nowrap items-center gap-1.5 overflow-x-auto rounded-lg border px-2 py-1.5 shadow-md backdrop-blur'
      )}
      role="search"
      aria-label="Find in editor"
      onKeyDown={(e) => {
        e.stopPropagation()
      }}
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          const v = e.target.value
          queryRef.current = v
          setQuery(v)
          editor.getEditorState().read(() => {
            const { flat, spans } = collectMappedText()
            lastSpansRef.current = spans
            const raw = findMatchRanges(flat, v, wholeWordRef.current)
            const selectable = filterSelectable(raw, spans)
            setMatches(selectable)
            setCurrentIndex(0)
          })
        }}
        placeholder="Find…"
        className="h-8 min-w-[6.5rem] flex-1 text-sm"
        aria-label="Search text"
      />
      <span className="text-muted-foreground shrink-0 tabular-nums text-xs">{countLabel}</span>
      <div className="flex shrink-0 items-center ">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="Previous match"
          disabled={matches.length === 0}
          onClick={() => goToIndex(currentIndex - 1)}
        >
          <ChevronUp className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="Next match"
          disabled={matches.length === 0}
          onClick={() => goToIndex(currentIndex + 1)}
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant={wholeWord ? 'secondary' : 'ghost'}
          className="size-8 shrink-0"
          aria-label="Match whole word"
          aria-pressed={wholeWord}
          onClick={() => setWholeWord((w) => !w)}
        >
          <WholeWord className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-muted-foreground size-8 shrink-0"
          aria-label="Close find"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

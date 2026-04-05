"use client"

import type { JSX } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

import { useNotelabEditorContext } from "@/components/editor/notelab-editor-context"
import {
  InternalNoteLinkIcon,
  InternalNoteLinkPreviewBody,
  LinkPreviewCardShell,
  UrlFavicon,
  ExternalUrlPreviewBody,
} from "@/components/editor/link-preview-card"
import { parseInternalNoteIdFromHref } from "@/lib/internal-note-link"

type HoverPayload =
  | {
      kind: "internal"
      noteId: string
      rect: DOMRect
    }
  | {
      kind: "external"
      href: string
      rect: DOMRect
    }

const GAP = 8
const SHOW_DELAY_MS = 120

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

export function LinkHoverPreviewPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const notelabCtx = useNotelabEditorContext()
  const [hover, setHover] = useState<HoverPayload | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAnchorRef = useRef<HTMLAnchorElement | null>(null)

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearTimers()
    hideTimerRef.current = setTimeout(() => {
      setHover(null)
      lastAnchorRef.current = null
    }, 80)
  }, [clearTimers])

  useEffect(() => {
    return editor.registerRootListener((rootEl) => {
      if (!rootEl) return

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === "touch") return

        const sel = window.getSelection()
        if (sel && !sel.isCollapsed) {
          clearTimers()
          setHover(null)
          lastAnchorRef.current = null
          return
        }

        const under = document.elementFromPoint(e.clientX, e.clientY)
        if (under instanceof Element && under.closest("[data-link-hover-ignore]")) {
          if (lastAnchorRef.current) scheduleHide()
          return
        }
        const anchor =
          under instanceof Element
            ? (under.closest("a[href]") as HTMLAnchorElement | null)
            : null

        if (!anchor || !rootEl.contains(anchor)) {
          if (lastAnchorRef.current) {
            scheduleHide()
          }
          return
        }

        if (lastAnchorRef.current === anchor) {
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
          }
          return
        }

        lastAnchorRef.current = anchor
        clearTimers()

        const raw = anchor.getAttribute("href") ?? ""
        const resolvedHref = anchor.href || raw
        const rect = anchor.getBoundingClientRect()
        const noteId = parseInternalNoteIdFromHref(resolvedHref) ?? parseInternalNoteIdFromHref(raw)

        showTimerRef.current = setTimeout(() => {
          if (noteId) {
            setHover({ kind: "internal", noteId, rect })
          } else {
            setHover({
              kind: "external",
              href: resolvedHref,
              rect,
            })
          }
        }, SHOW_DELAY_MS)
      }

      const onPointerLeaveRoot = (e: PointerEvent) => {
        const related = e.relatedTarget as Node | null
        if (related && rootEl.contains(related)) return
        scheduleHide()
      }

      const onScroll = () => {
        scheduleHide()
      }

      rootEl.addEventListener("pointermove", onPointerMove, { passive: true })
      rootEl.addEventListener("pointerleave", onPointerLeaveRoot, true)
      rootEl.addEventListener("scroll", onScroll, { capture: true })

      return () => {
        clearTimers()
        rootEl.removeEventListener("pointermove", onPointerMove)
        rootEl.removeEventListener("pointerleave", onPointerLeaveRoot, true)
        rootEl.removeEventListener("scroll", onScroll, { capture: true })
      }
    })
  }, [editor, notelabCtx, clearTimers, scheduleHide])

  if (!hover) return null

  const resolvedNote =
    hover.kind === "internal" && notelabCtx
      ? notelabCtx.notes.find((n) => n.id === hover.noteId)
      : undefined

  let top = hover.rect.bottom + GAP
  let left = hover.rect.left

  const cardWidth = 320
  const estHeight = 120
  const vw = typeof window !== "undefined" ? window.innerWidth : 800
  const vh = typeof window !== "undefined" ? window.innerHeight : 600

  left = clamp(left, 8, vw - cardWidth - 8)
  if (top + estHeight > vh - 8) {
    top = hover.rect.top - GAP - estHeight
  }
  top = clamp(top, 8, vh - estHeight - 8)

  const portal = (
    <div
      className="pointer-events-none fixed z-[140]"
      style={{ top, left, width: cardWidth }}
      data-link-hover-ignore
      aria-hidden
    >
      {hover.kind === "internal" ? (
        <LinkPreviewCardShell className="gap-3">
          <InternalNoteLinkIcon />
          <InternalNoteLinkPreviewBody
            resolvedNote={resolvedNote}
            notelabCtx={notelabCtx}
          />
        </LinkPreviewCardShell>
      ) : (
        <LinkPreviewCardShell>
          <UrlFavicon href={hover.href} />
          <ExternalUrlPreviewBody displayUrl={hover.href} compact />
        </LinkPreviewCardShell>
      )}
    </div>
  )

  return typeof document !== "undefined"
    ? createPortal(portal, document.body)
    : null
}

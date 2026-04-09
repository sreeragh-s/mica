"use client"

import type { JSX } from "react"
import { useState, type ReactNode } from "react"
import { Globe, Mail, NotebookText } from "lucide-react"

import type { NotelabEditorContextValue } from "@/components/editor/notelab-editor-context"
import { isDrawingNote } from "@/components/notes/notes-app-utils"
import { cn } from "@/lib/utils"
import {
  extractPreviewText,
  formatNoteTime,
  type SavedNote,
} from "@/lib/notes/notes-storage"

/** Single card surface — use once per floating panel (avoid stacking with an outer wrapper). */
export function LinkPreviewCardShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        "bg-background flex max-w-md items-start gap-2 rounded-md border p-2 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  )
}

export function faviconUrlForHref(href: string): string | null {
  try {
    const base =
      typeof window !== "undefined" ? window.location.href : "https://example.com/"
    const u = new URL(href, base)
    if (u.protocol === "http:" || u.protocol === "https:") {
      return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(u.hostname)}`
    }
  } catch {
    return null
  }
  return null
}

export function UrlFavicon({ href }: { href: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (href.startsWith("mailto:")) {
    return (
      <Mail
        className="text-muted-foreground size-4 shrink-0"
        aria-hidden
      />
    )
  }
  const src = faviconUrlForHref(href)
  if (failed || !src) {
    return (
      <Globe
        className="text-muted-foreground size-4 shrink-0"
        aria-hidden
      />
    )
  }
  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      className="size-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  )
}

export function InternalNoteLinkPreviewBody({
  resolvedNote,
  notelabCtx,
}: {
  resolvedNote: SavedNote | undefined
  notelabCtx: NotelabEditorContextValue | null
}): JSX.Element {
  const folderLabel =
    resolvedNote && notelabCtx
      ? (notelabCtx.folders.find((f) => f.folder === resolvedNote.folder)
          ?.name ?? "Workspace")
      : ""

  const previewLine =
    resolvedNote && isDrawingNote(resolvedNote)
      ? "Drawing canvas"
      : resolvedNote?.content
        ? extractPreviewText(resolvedNote.content, 100)
        : resolvedNote
          ? "Empty note"
          : null

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="truncate text-sm leading-tight font-medium">
        {resolvedNote
          ? resolvedNote.title?.trim() || "Untitled"
          : "Missing note"}
      </div>
      <div className="text-muted-foreground text-xs">
        {resolvedNote
          ? `${formatNoteTime(resolvedNote.updatedAt)} · ${folderLabel} · ${isDrawingNote(resolvedNote) ? "Drawing" : "Note"}`
          : "This note may have been deleted or is unavailable."}
      </div>
      {previewLine ? (
        <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">
          {previewLine}
        </p>
      ) : null}
    </div>
  )
}

export function InternalNoteLinkIcon(): JSX.Element {
  return (
    <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
      <NotebookText className="text-muted-foreground size-4" aria-hidden />
    </div>
  )
}

export function ExternalUrlPreviewBody({
  displayUrl,
  compact = false,
}: {
  displayUrl: string
  compact?: boolean
}): JSX.Element {
  return (
    <div className="min-w-0 flex-1">
      <p
        className={
          compact
            ? "text-muted-foreground line-clamp-2 text-xs leading-snug break-all"
            : "text-foreground text-sm leading-snug break-all"
        }
      >
        {displayUrl}
      </p>
    </div>
  )
}

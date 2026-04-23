"use client"

import * as React from "react"

import * as pdfjsLib from "pdfjs-dist"
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api"
import { readFile } from "@tauri-apps/plugin-fs"
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker

const THUMBNAIL_WIDTH = 140
const PAGE_GAP = 16
const PAGE_VERTICAL_PADDING = 48
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25
const PAGE_LAZY_MARGIN = "1200px"
const THUMB_LAZY_MARGIN = "400px"

type PageEntry = {
  pageNumber: number
  page: PDFPageProxy | null
  width: number
  height: number
}

type PdfFileViewProps = {
  filePath: string
}

function PageThumbnail({
  entry,
  isActive,
  onSelect,
  registerRef,
  observer,
}: {
  entry: PageEntry
  isActive: boolean
  onSelect: (pageNumber: number) => void
  registerRef: (pageNumber: number, el: HTMLButtonElement | null) => void
  observer: IntersectionObserver | null
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)
  const [shouldRender, setShouldRender] = React.useState(false)
  const renderedRef = React.useRef(false)

  const { page, pageNumber, width, height } = entry
  const scale = width > 0 ? THUMBNAIL_WIDTH / width : 1
  const displayWidth = width > 0 ? THUMBNAIL_WIDTH : 0
  const displayHeight = height > 0 ? Math.round(height * scale) : 0

  React.useEffect(() => {
    registerRef(pageNumber, buttonRef.current)
    return () => registerRef(pageNumber, null)
  }, [pageNumber, registerRef])

  React.useEffect(() => {
    const el = buttonRef.current
    if (!el || !observer) return
    if (shouldRender) return

    const handler = (entries: IntersectionObserverEntry[]) => {
      for (const e of entries) {
        if (e.target === el && e.isIntersecting) {
          setShouldRender(true)
          observer.unobserve(el)
        }
      }
    }
    el.dataset.thumbHandler = "1"
    ;(el as HTMLButtonElement & { __thumbHandler?: typeof handler }).__thumbHandler = handler
    observer.observe(el)

    return () => {
      observer.unobserve(el)
    }
  }, [observer, shouldRender])

  React.useEffect(() => {
    if (!shouldRender || !page || renderedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    const viewport = page.getViewport({ scale })

    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    } as never)

    renderedRef.current = true

    renderTask.promise.catch((err) => {
      if (cancelled) return
      if (err?.name !== "RenderingCancelledException") {
        console.error(`[PdfFileView] Thumbnail render failed (page ${pageNumber}):`, err)
      }
    })

    return () => {
      cancelled = true
      renderTask.cancel()
    }
  }, [shouldRender, page, scale, pageNumber])

  return (
    <button
      ref={buttonRef}
      type="button"
      data-thumb-page={pageNumber}
      onClick={() => onSelect(pageNumber)}
      className={cn(
        "flex w-full flex-col items-center gap-1 rounded-md p-2 transition-colors",
        "hover:bg-muted",
        isActive && "bg-muted ring-2 ring-primary"
      )}
    >
      <div
        className="rounded-sm border border-border bg-white shadow-sm"
        style={{
          width: displayWidth || THUMBNAIL_WIDTH,
          height: displayHeight || THUMBNAIL_WIDTH * 1.4,
        }}
      >
        <canvas ref={canvasRef} className="block" />
      </div>
      <span className="text-xs text-muted-foreground">{pageNumber}</span>
    </button>
  )
}

function PdfPage({
  entry,
  scale,
  registerRef,
  observer,
}: {
  entry: PageEntry
  scale: number
  registerRef: (pageNumber: number, el: HTMLDivElement | null) => void
  observer: IntersectionObserver | null
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [shouldRender, setShouldRender] = React.useState(false)
  const renderedScaleRef = React.useRef(0)

  const { page, pageNumber, width, height } = entry
  const displayWidth = width > 0 ? width * scale : 0
  const displayHeight = height > 0 ? height * scale : 0

  React.useEffect(() => {
    registerRef(pageNumber, containerRef.current)
    return () => registerRef(pageNumber, null)
  }, [pageNumber, registerRef])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el || !observer) return

    const handler = (entries: IntersectionObserverEntry[]) => {
      for (const e of entries) {
        if (e.target === el) {
          setShouldRender(e.isIntersecting)
        }
      }
    }
    ;(el as HTMLDivElement & { __pageHandler?: typeof handler }).__pageHandler = handler
    observer.observe(el)

    return () => {
      observer.unobserve(el)
    }
  }, [observer])

  React.useEffect(() => {
    if (!shouldRender || !page) return
    if (renderedScaleRef.current === scale) return
    const canvas = canvasRef.current
    if (!canvas) return

    let completed = false
    const viewport = page.getViewport({ scale })
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    } as never)

    renderTask.promise
      .then(() => {
        completed = true
        renderedScaleRef.current = scale
      })
      .catch((err) => {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`[PdfFileView] Page render failed (page ${pageNumber}):`, err)
        }
      })

    return () => {
      if (!completed) {
        renderTask.cancel()
        renderedScaleRef.current = 0
      }
    }
  }, [shouldRender, page, scale, pageNumber])

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      className="flex flex-col items-center"
      style={{
        width: displayWidth || undefined,
        height: displayHeight || undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        className="block rounded-sm border border-border bg-white shadow-md"
        style={{
          width: displayWidth || undefined,
          height: displayHeight || undefined,
        }}
      />
    </div>
  )
}

export const PdfFileView = React.memo(function PdfFileView({
  filePath,
}: PdfFileViewProps) {
  const [pageEntries, setPageEntries] = React.useState<PageEntry[]>([])
  const [activePage, setActivePage] = React.useState(1)
  const [error, setError] = React.useState<string | null>(null)
  const [fitToHeight, setFitToHeight] = React.useState(true)
  const [zoom, setZoom] = React.useState(1)
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 })

  const pageRefsRef = React.useRef(new Map<number, HTMLDivElement>())
  const thumbnailRefsRef = React.useRef(new Map<number, HTMLButtonElement>())
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null)
  const thumbnailScrollRef = React.useRef<HTMLDivElement | null>(null)
  const docRef = React.useRef<PDFDocumentProxy | null>(null)
  const pendingTargetPageRef = React.useRef<number | null>(null)

  const [pageObserver, setPageObserver] = React.useState<IntersectionObserver | null>(null)
  const [thumbObserver, setThumbObserver] = React.useState<IntersectionObserver | null>(null)

  const registerPageRef = React.useCallback(
    (pageNumber: number, el: HTMLDivElement | null) => {
      const refs = pageRefsRef.current
      if (el) refs.set(pageNumber, el)
      else refs.delete(pageNumber)
    },
    []
  )

  const registerThumbnailRef = React.useCallback(
    (pageNumber: number, el: HTMLButtonElement | null) => {
      const refs = thumbnailRefsRef.current
      if (el) refs.set(pageNumber, el)
      else refs.delete(pageNumber)
    },
    []
  )

  React.useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const updateSize = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const scroller = scrollContainerRef.current
    if (!scroller) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const handler = (entry.target as HTMLElement & { __pageHandler?: (e: IntersectionObserverEntry[]) => void }).__pageHandler
          handler?.([entry])
        }
      },
      { root: scroller, rootMargin: PAGE_LAZY_MARGIN }
    )
    setPageObserver(observer)
    return () => {
      observer.disconnect()
      setPageObserver(null)
    }
  }, [])

  React.useEffect(() => {
    const scroller = thumbnailScrollRef.current
    if (!scroller) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const handler = (entry.target as HTMLElement & { __thumbHandler?: (e: IntersectionObserverEntry[]) => void }).__thumbHandler
          handler?.([entry])
        }
      },
      { root: scroller, rootMargin: THUMB_LAZY_MARGIN }
    )
    setThumbObserver(observer)
    return () => {
      observer.disconnect()
      setThumbObserver(null)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    let loadedDoc: PDFDocumentProxy | null = null

    setError(null)
    setPageEntries([])
    setActivePage(1)

    void (async () => {
      try {
        const bytes = await readFile(filePath)
        if (cancelled) return

        const data = new Uint8Array(bytes)
        const loadingTask = pdfjsLib.getDocument({ data })
        const doc = await loadingTask.promise
        if (cancelled) {
          void doc.destroy()
          return
        }
        loadedDoc = doc
        docRef.current = doc

        const firstPage = await doc.getPage(1)
        if (cancelled) {
          void doc.destroy()
          return
        }

        const firstViewport = firstPage.getViewport({ scale: 1 })
        const initialEntries: PageEntry[] = Array.from(
          { length: doc.numPages },
          (_, i) => ({
            pageNumber: i + 1,
            page: i === 0 ? firstPage : null,
            width: firstViewport.width,
            height: firstViewport.height,
          })
        )

        setPageEntries(initialEntries)

        for (let i = 2; i <= doc.numPages; i++) {
          if (cancelled) return
          const page = await doc.getPage(i)
          if (cancelled) return
          const viewport = page.getViewport({ scale: 1 })
          setPageEntries((prev) => {
            if (prev.length === 0) return prev
            const next = prev.slice()
            next[i - 1] = {
              pageNumber: i,
              page,
              width: viewport.width,
              height: viewport.height,
            }
            return next
          })
        }
      } catch (err) {
        if (cancelled) return
        console.error("[PdfFileView] Failed to load PDF:", err)
        setError("Unable to open this PDF file.")
      }
    })()

    return () => {
      cancelled = true
      if (loadedDoc) void loadedDoc.destroy()
      docRef.current = null
    }
  }, [filePath])

  const firstEntry = pageEntries[0]

  const fitScale = React.useMemo(() => {
    if (!firstEntry || firstEntry.width <= 0 || containerSize.height <= 0 || containerSize.width <= 0) {
      return 1
    }
    const availableHeight = containerSize.height - PAGE_VERTICAL_PADDING
    const availableWidth = containerSize.width - PAGE_VERTICAL_PADDING
    if (availableHeight <= 0 || availableWidth <= 0) return 1
    const heightScale = availableHeight / firstEntry.height
    const widthScale = availableWidth / firstEntry.width
    return Math.max(0.1, Math.min(heightScale, widthScale))
  }, [firstEntry, containerSize.height, containerSize.width])

  const renderScale = fitToHeight ? fitScale : zoom

  const scrollToPage = React.useCallback((pageNumber: number) => {
    const el = pageRefsRef.current.get(pageNumber)
    if (!el) return
    pendingTargetPageRef.current = pageNumber
    el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const handleSelectPage = React.useCallback(
    (pageNumber: number) => {
      scrollToPage(pageNumber)
      setActivePage(pageNumber)
    },
    [scrollToPage]
  )

  const handlePrevPage = React.useCallback(() => {
    setActivePage((current) => {
      const next = Math.max(1, current - 1)
      scrollToPage(next)
      return next
    })
  }, [scrollToPage])

  const handleNextPage = React.useCallback(() => {
    setActivePage((current) => {
      const next = Math.min(pageEntries.length, current + 1)
      scrollToPage(next)
      return next
    })
  }, [pageEntries.length, scrollToPage])

  const handleZoomOut = React.useCallback(() => {
    setFitToHeight(false)
    setZoom((current) => {
      const base = fitToHeight ? fitScale : current
      return Math.max(MIN_ZOOM, Math.round((base - ZOOM_STEP) * 100) / 100)
    })
  }, [fitToHeight, fitScale])

  const handleZoomIn = React.useCallback(() => {
    setFitToHeight(false)
    setZoom((current) => {
      const base = fitToHeight ? fitScale : current
      return Math.min(MAX_ZOOM, Math.round((base + ZOOM_STEP) * 100) / 100)
    })
  }, [fitToHeight, fitScale])

  const handleToggleFit = React.useCallback(() => {
    setFitToHeight((prev) => {
      const next = !prev
      if (!next) setZoom(fitScale)
      return next
    })
  }, [fitScale])

  React.useEffect(() => {
    if (pageEntries.length === 0) return
    const scroller = scrollContainerRef.current
    if (!scroller) return

    let rafId: number | null = null
    let idleTimerId: number | null = null

    const compute = () => {
      rafId = null
      if (pendingTargetPageRef.current !== null) return

      const scrollerRect = scroller.getBoundingClientRect()
      const viewerCenter = scrollerRect.top + scrollerRect.height / 2

      let bestPage = -1
      let bestDistance = Number.POSITIVE_INFINITY

      pageRefsRef.current.forEach((el, pageNumber) => {
        const rect = el.getBoundingClientRect()
        if (rect.bottom < scrollerRect.top || rect.top > scrollerRect.bottom) return
        const pageCenter = rect.top + rect.height / 2
        const distance = Math.abs(pageCenter - viewerCenter)
        if (distance < bestDistance) {
          bestDistance = distance
          bestPage = pageNumber
        }
      })

      if (bestPage > 0) setActivePage(bestPage)
    }

    const schedule = () => {
      if (pendingTargetPageRef.current !== null) {
        if (idleTimerId !== null) window.clearTimeout(idleTimerId)
        idleTimerId = window.setTimeout(() => {
          idleTimerId = null
          pendingTargetPageRef.current = null
          schedule()
        }, 150)
        return
      }
      if (rafId !== null) return
      rafId = requestAnimationFrame(compute)
    }

    schedule()
    scroller.addEventListener("scroll", schedule, { passive: true })

    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(scroller)

    return () => {
      scroller.removeEventListener("scroll", schedule)
      resizeObserver.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (idleTimerId !== null) window.clearTimeout(idleTimerId)
    }
  }, [pageEntries.length])

  React.useEffect(() => {
    const thumbScroller = thumbnailScrollRef.current
    const thumbEl = thumbnailRefsRef.current.get(activePage)
    if (!thumbScroller || !thumbEl) return

    const scrollerRect = thumbScroller.getBoundingClientRect()
    const thumbRect = thumbEl.getBoundingClientRect()

    if (thumbRect.top < scrollerRect.top || thumbRect.bottom > scrollerRect.bottom) {
      thumbEl.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [activePage])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        {error}
      </div>
    )
  }

  const showLoading = pageEntries.length === 0
  const zoomPercent = Math.round(renderScale * 100)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex h-full w-44 shrink-0 flex-col border-r bg-muted/30">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
            {showLoading ? "Loading..." : `${pageEntries.length} ${pageEntries.length === 1 ? "page" : "pages"}`}
          </div>
          <div ref={thumbnailScrollRef} className="flex-1 overflow-y-auto p-2">
            <div className="flex flex-col gap-2">
              {pageEntries.map((entry) => (
                <PageThumbnail
                  key={entry.pageNumber}
                  entry={entry}
                  isActive={entry.pageNumber === activePage}
                  onSelect={handleSelectPage}
                  registerRef={registerThumbnailRef}
                  observer={thumbObserver}
                />
              ))}
            </div>
          </div>
        </aside>
        <div
          ref={scrollContainerRef}
          className="min-w-0 flex-1 overflow-auto bg-muted/20"
        >
          {showLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading PDF...
            </div>
          ) : (
            <div
              className="flex flex-col items-center p-6"
              style={{ gap: `${PAGE_GAP}px` }}
            >
              {pageEntries.map((entry) => (
                <PdfPage
                  key={entry.pageNumber}
                  entry={entry}
                  scale={renderScale}
                  registerRef={registerPageRef}
                  observer={pageObserver}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="bottom-bar bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-full w-full items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handlePrevPage}
            disabled={activePage <= 1}
            title="Previous page"
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <span className="min-w-[70px] text-center text-xs tabular-nums text-muted-foreground">
            {activePage} / {pageEntries.length || "—"}
          </span>
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleNextPage}
            disabled={activePage >= pageEntries.length}
            title="Next page"
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleZoomOut}
            disabled={renderScale <= MIN_ZOOM + 0.01}
            title="Zoom out"
          >
            <MinusIcon className="size-3.5" />
          </Button>
          <span className="min-w-[44px] text-center text-xs tabular-nums text-muted-foreground">
            {zoomPercent}%
          </span>
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleZoomIn}
            disabled={renderScale >= MAX_ZOOM - 0.01}
            title="Zoom in"
          >
            <PlusIcon className="size-3.5" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <Button
            size="xs"
            variant={fitToHeight ? "secondary" : "ghost"}
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleToggleFit}
            title="Fit page to viewer"
          >
            <MaximizeIcon className="size-3.5" />
            Fit
          </Button>
        </div>
      </div>
    </div>
  )
})

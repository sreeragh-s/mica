"use client"

import * as React from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { readFile } from "@tauri-apps/plugin-fs"
import {
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  RotateCwIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { isHeicImageFile } from "@/lib/file-types"
import { cn } from "@/lib/utils"

type ImageFileViewProps = {
  filePath: string
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const ZOOM_STEP = 0.25
const PADDING = 48

export const ImageFileView = React.memo(function ImageFileView({
  filePath,
}: ImageFileViewProps) {
  const isHeic = React.useMemo(() => isHeicImageFile(filePath), [filePath])
  const assetSrc = React.useMemo(() => convertFileSrc(filePath), [filePath])

  const [heicObjectUrl, setHeicObjectUrl] = React.useState<string | null>(null)
  const [heicDecoding, setHeicDecoding] = React.useState(false)

  const [naturalSize, setNaturalSize] = React.useState({ width: 0, height: 0 })
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 })
  const [fitToScreen, setFitToScreen] = React.useState(true)
  const [zoom, setZoom] = React.useState(1)
  const [rotation, setRotation] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setNaturalSize({ width: 0, height: 0 })
    setRotation(0)
    setZoom(1)
    setFitToScreen(true)
    setError(null)
    setLoaded(false)
  }, [filePath])

  React.useEffect(() => {
    if (!isHeic) {
      setHeicObjectUrl(null)
      setHeicDecoding(false)
      return
    }

    let cancelled = false
    let createdUrl: string | null = null

    setHeicDecoding(true)
    setError(null)

    void (async () => {
      try {
        const [{ heicTo }, bytes] = await Promise.all([
          import("heic-to"),
          readFile(filePath),
        ])
        if (cancelled) return

        const sourceBlob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
          type: "image/heic",
        })
        const converted = await heicTo({
          blob: sourceBlob,
          type: "image/jpeg",
          quality: 0.92,
        })
        if (cancelled) return

        const outputBlob = Array.isArray(converted) ? converted[0] : converted
        if (!outputBlob) {
          throw new Error("Empty HEIC decode result")
        }

        createdUrl = URL.createObjectURL(outputBlob)
        setHeicObjectUrl(createdUrl)
      } catch (err) {
        if (cancelled) return
        console.error("[ImageFileView] HEIC decode failed:", { filePath, err })
        setError("Unable to decode this HEIC image.")
      } finally {
        if (!cancelled) setHeicDecoding(false)
      }
    })()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
      setHeicObjectUrl((previous) => {
        if (previous && previous !== createdUrl) {
          URL.revokeObjectURL(previous)
        }
        return null
      })
    }
  }, [filePath, isHeic])

  const src = isHeic ? heicObjectUrl ?? "" : assetSrc

  React.useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateSize = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const rotated = rotation % 180 !== 0
  const effectiveWidth = rotated ? naturalSize.height : naturalSize.width
  const effectiveHeight = rotated ? naturalSize.width : naturalSize.height

  const fitScale = React.useMemo(() => {
    if (
      effectiveWidth <= 0 ||
      effectiveHeight <= 0 ||
      containerSize.width <= 0 ||
      containerSize.height <= 0
    ) {
      return 1
    }
    const availableWidth = Math.max(0, containerSize.width - PADDING)
    const availableHeight = Math.max(0, containerSize.height - PADDING)
    if (availableWidth <= 0 || availableHeight <= 0) return 1
    const scale = Math.min(
      availableWidth / effectiveWidth,
      availableHeight / effectiveHeight,
      1,
    )
    return Math.max(0.01, scale)
  }, [effectiveWidth, effectiveHeight, containerSize.width, containerSize.height])

  const renderScale = fitToScreen ? fitScale : zoom
  const zoomPercent = Math.round(renderScale * 100)

  const handleZoomOut = React.useCallback(() => {
    setFitToScreen(false)
    setZoom((current) => {
      const base = fitToScreen ? fitScale : current
      return Math.max(MIN_ZOOM, Math.round((base - ZOOM_STEP) * 100) / 100)
    })
  }, [fitToScreen, fitScale])

  const handleZoomIn = React.useCallback(() => {
    setFitToScreen(false)
    setZoom((current) => {
      const base = fitToScreen ? fitScale : current
      return Math.min(MAX_ZOOM, Math.round((base + ZOOM_STEP) * 100) / 100)
    })
  }, [fitToScreen, fitScale])

  const handleToggleFit = React.useCallback(() => {
    setFitToScreen((prev) => {
      const next = !prev
      if (!next) setZoom(fitScale)
      return next
    })
  }, [fitScale])

  const handleRotate = React.useCallback(() => {
    setRotation((prev) => (prev + 90) % 360)
  }, [])

  const displayWidth = naturalSize.width * renderScale
  const displayHeight = naturalSize.height * renderScale

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-auto bg-background"
      >
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
            {error}
          </div>
        ) : heicDecoding && !heicObjectUrl ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Decoding HEIC…
          </div>
        ) : !src ? null : (
          <div
            className="flex min-h-full min-w-full items-center justify-center p-6"
          >
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget
                setNaturalSize({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
                setLoaded(true)
              }}
              onError={(event) => {
                console.error("[ImageFileView] Failed to load image:", {
                  filePath,
                  src: event.currentTarget.src,
                })
                setError("Unable to open this image.")
                setLoaded(false)
              }}
              style={{
                width: displayWidth > 0 ? displayWidth : undefined,
                height: displayHeight > 0 ? displayHeight : undefined,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: "center center",
                maxWidth: "none",
                maxHeight: "none",
              }}
              className={cn(
                "select-none bg-transparent transition-opacity",
                loaded ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        )}
      </div>
      <div className="bottom-bar bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-full w-full items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleZoomOut}
            disabled={renderScale <= MIN_ZOOM + 0.001}
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
            disabled={renderScale >= MAX_ZOOM - 0.001}
            title="Zoom in"
          >
            <PlusIcon className="size-3.5" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <Button
            size="xs"
            variant={fitToScreen ? "secondary" : "ghost"}
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleToggleFit}
            title="Fit to screen"
          >
            <MaximizeIcon className="size-3.5" />
            Fit
          </Button>

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleRotate}
            title="Rotate 90°"
          >
            <RotateCwIcon className="size-3.5" />
          </Button>

          <div className="ml-auto text-xs tabular-nums text-muted-foreground">
            {naturalSize.width > 0
              ? `${naturalSize.width} × ${naturalSize.height}`
              : ""}
          </div>
        </div>
      </div>
    </div>
  )
})

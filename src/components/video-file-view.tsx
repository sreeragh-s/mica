"use client"

import * as React from "react"
import { convertFileSrc } from "@tauri-apps/api/core"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

type VideoFileViewProps = {
  filePath: string
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  return `${m}:${s.toString().padStart(2, "0")}`
}

export const VideoFileView = React.memo(function VideoFileView({
  filePath,
}: VideoFileViewProps) {
  const src = React.useMemo(() => convertFileSrc(filePath), [filePath])

  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [duration, setDuration] = React.useState(0)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })
  const [rate, setRate] = React.useState<number>(1)
  const [posterUrl, setPosterUrl] = React.useState<string | null>(null)
  const posterCapturedRef = React.useRef(false)

  React.useEffect(() => {
    setError(null)
    setDuration(0)
    setCurrentTime(0)
    setDimensions({ width: 0, height: 0 })
    setRate(1)
    posterCapturedRef.current = false
    setPosterUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
  }, [src])

  React.useEffect(() => {
    return () => {
      setPosterUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return null
      })
    }
  }, [])

  React.useEffect(() => {
    const el = videoRef.current
    if (el) el.playbackRate = rate
  }, [rate])

  React.useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting && !el.paused) {
            el.pause()
          }
        }
      },
      { threshold: 0.01 },
    )
    observer.observe(el)

    const handleVisibilityChange = () => {
      if (document.hidden && !el.paused) {
        el.pause()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [src])

  const captureThumbnail = React.useCallback(() => {
    if (posterCapturedRef.current) return
    const el = videoRef.current
    if (!el || el.videoWidth === 0 || el.videoHeight === 0) return

    try {
      const canvas = document.createElement("canvas")
      canvas.width = el.videoWidth
      canvas.height = el.videoHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          posterCapturedRef.current = true
          setPosterUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous)
            return url
          })
        },
        "image/jpeg",
        0.85,
      )
    } catch (err) {
      console.warn("[VideoFileView] Thumbnail capture failed:", err)
    }
  }, [])

  const cycleRate = React.useCallback(() => {
    setRate((current) => {
      const idx = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number])
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]
      return next
    })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background">
        {error ? (
          <div className="px-6 text-sm text-muted-foreground">{error}</div>
        ) : (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            {...(posterUrl ? { poster: posterUrl } : {})}
            onLoadedMetadata={(event) => {
              const el = event.currentTarget
              setDuration(el.duration || 0)
              setDimensions({
                width: el.videoWidth,
                height: el.videoHeight,
              })
              if (!posterCapturedRef.current && el.paused) {
                try {
                  el.currentTime = Math.min(0.1, (el.duration || 1) * 0.01)
                } catch {
                  // ignore seek errors
                }
              }
            }}
            onLoadedData={captureThumbnail}
            onSeeked={captureThumbnail}
            onTimeUpdate={(event) => {
              setCurrentTime(event.currentTarget.currentTime || 0)
            }}
            onRateChange={(event) => {
              const next = event.currentTarget.playbackRate
              if (PLAYBACK_RATES.includes(next as (typeof PLAYBACK_RATES)[number])) {
                setRate(next)
              }
            }}
            onError={(event) => {
              const el = event.currentTarget
              console.error("[VideoFileView] Failed to load video:", {
                filePath,
                src: el.currentSrc,
                error: el.error,
              })
              setError("Unable to play this video.")
            }}
            className="max-h-full max-w-full bg-black"
          />
        )}
      </div>
      <div className="bottom-bar bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-full w-full items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="h-7 px-2 text-xs tabular-nums"
            onClick={cycleRate}
            title="Playback speed"
          >
            {rate}×
          </Button>

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="ml-auto text-xs tabular-nums text-muted-foreground">
            {dimensions.width > 0
              ? `${dimensions.width} × ${dimensions.height}`
              : ""}
          </div>
        </div>
      </div>
    </div>
  )
})

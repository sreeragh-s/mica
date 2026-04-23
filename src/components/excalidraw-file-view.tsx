"use client"

import * as React from "react"

import debounce from "lodash/debounce.js"
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw"
import "@excalidraw/excalidraw/index.css"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"

import { BottomDrawingBar } from "@/components/editor/bottom-drawing-bar"

const AUTOSAVE_DEBOUNCE_MS = 600

type ExcalidrawScene = {
  appState?: Record<string, unknown>
  elements?: unknown[]
  files?: Record<string, unknown>
}

type ExcalidrawFileViewProps = {
  filePath: string
}

export const ExcalidrawFileView = React.memo(function ExcalidrawFileView({
  filePath,
}: ExcalidrawFileViewProps) {
  const [initialData, setInitialData] = React.useState<Record<string, unknown> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const filePathRef = React.useRef(filePath)
  const skipAutosaveRef = React.useRef(true)

  React.useLayoutEffect(() => {
    filePathRef.current = filePath
  }, [filePath])

  const debouncedSave = React.useMemo(
    () =>
      debounce(
        (
          elements: readonly OrderedExcalidrawElement[],
          appState: AppState,
          files: BinaryFiles
        ) => {
          if (skipAutosaveRef.current) return

          const path = filePathRef.current
          if (!path) return

          void (async () => {
            try {
              const scene = serializeAsJSON(elements, appState, files, "local")
              await writeTextFile(path, scene)
            } catch (err) {
              console.error("[ExcalidrawFileView] Auto-save failed:", err)
            }
          })()
        },
        AUTOSAVE_DEBOUNCE_MS
      ),
    []
  )

  React.useEffect(() => {
    debouncedSave.flush()
    debouncedSave.cancel()
    skipAutosaveRef.current = true
  }, [debouncedSave, filePath])

  React.useEffect(() => {
    if (isLoading || !initialData) return

    const id = requestAnimationFrame(() => {
      skipAutosaveRef.current = false
    })

    return () => cancelAnimationFrame(id)
  }, [initialData, isLoading])

  React.useEffect(() => {
    return () => {
      skipAutosaveRef.current = false
      debouncedSave.flush()
      debouncedSave.cancel()
    }
  }, [debouncedSave])

  React.useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setError(null)

    void readTextFile(filePath)
      .then((content) => {
        if (cancelled) return

        const parsed = JSON.parse(content) as ExcalidrawScene

        setInitialData({
          appState: parsed.appState,
          elements: parsed.elements ?? [],
          files: parsed.files,
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.error("[ExcalidrawFileView] Failed to load file:", err)
        setError("Unable to open this Excalidraw file.")
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [filePath])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        {error}
      </div>
    )
  }

  if (isLoading || !initialData) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        Loading drawing...
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1">
        <Excalidraw
          initialData={initialData as never}
          onChange={(elements, appState, files) => {
            debouncedSave(elements, appState, files)
          }}
        />
      </div>
      <BottomDrawingBar showDownload={false} />
    </div>
  )
})

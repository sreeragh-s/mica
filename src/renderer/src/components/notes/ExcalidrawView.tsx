import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from 'react'

import {
  CaptureUpdateAction,
  Excalidraw,
  serializeAsJSON
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { useTheme } from 'next-themes'

import { THEME_PRESET_CHANGED_EVENT } from '@/lib/theme-preset-apply'
import { cn } from '@/lib/utils'

/** Same values as `globals.css` `:root` / `.dark` defaults (before preset overrides). */
const BG_LIGHT = 'oklch(1 0 0)'
const BG_DARK = 'oklch(0.145 0 0)'

/**
 * `useTheme().resolvedTheme` is often `undefined` until the client hydrates; treating
 * that as "light" keeps Excalidraw in light mode even when `<html class="dark">` is set.
 */
function resolveIsDark(resolvedTheme: string | undefined): boolean {
  if (resolvedTheme === 'dark') return true
  if (resolvedTheme === 'light') return false
  return (
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  )
}

function fallbackBackgroundFromClass(): string {
  return document.documentElement.classList.contains('dark') ? BG_DARK : BG_LIGHT
}

/**
 * Excalidraw sets `canvas.fillStyle` to this string; resolve to `rgb()` for broad canvas support.
 */
function cssColorToCanvasColor(css: string): string {
  const trimmed = css.trim()
  if (trimmed === '' || trimmed === 'transparent') return trimmed
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return trimmed
  if (/^rgba?\(/i.test(trimmed)) return trimmed

  const el = document.createElement('div')
  el.style.backgroundColor = trimmed
  el.style.position = 'fixed'
  el.style.left = '0'
  el.style.top = '0'
  el.style.visibility = 'hidden'
  el.style.pointerEvents = 'none'
  document.body.appendChild(el)
  const out = getComputedStyle(el).backgroundColor
  el.remove()
  return out && out !== 'rgba(0, 0, 0, 0)' ? out : trimmed
}

function readDocumentBackgroundCss(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim()
  if (raw.length > 0) return raw
  return fallbackBackgroundFromClass()
}

function canvasBackgroundNow(): string {
  return cssColorToCanvasColor(readDocumentBackgroundCss())
}

export type ExcalidrawViewProps = {
  noteId: string
  sceneJson: string | null
  onSceneJsonChange: (json: string) => void
}

export function ExcalidrawView({
  noteId,
  sceneJson,
  onSceneJsonChange
}: ExcalidrawViewProps): JSX.Element {
  const { resolvedTheme } = useTheme()
  const excalidrawTheme = resolveIsDark(resolvedTheme) ? 'dark' : 'light'

  /** Kept in sync for theme toggles; deduped to avoid redundant canvas repaints. */
  const [themeBackgroundColor, setThemeBackgroundColor] = useState(canvasBackgroundNow)

  const applyDocumentBackground = useCallback((): void => {
    const next = canvasBackgroundNow()
    setThemeBackgroundColor((prev) => (prev === next ? prev : next))
  }, [])

  /** Before paint: align with `--background` when theme flips (reduces one flash frame). */
  useLayoutEffect(() => {
    applyDocumentBackground()
  }, [resolvedTheme, applyDocumentBackground])

  useEffect(() => {
    let raf = 0
    const scheduleCatchUp = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        applyDocumentBackground()
      })
    }

    applyDocumentBackground()
    raf = requestAnimationFrame(() => {
      applyDocumentBackground()
    })

    const el = document.documentElement
    const obs = new MutationObserver(scheduleCatchUp)
    obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] })

    window.addEventListener(THEME_PRESET_CHANGED_EVENT, scheduleCatchUp)

    return () => {
      cancelAnimationFrame(raf)
      obs.disconnect()
      window.removeEventListener(THEME_PRESET_CHANGED_EVENT, scheduleCatchUp)
    }
  }, [applyDocumentBackground])

  const debounceRef = useRef<number>(0)
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const loadingUnsubRef = useRef<(() => void) | null>(null)

  /** Cover Excalidraw until `initializeScene` finishes (spinner / partial scene blink). */
  const [sceneReady, setSceneReady] = useState(false)

  useEffect(() => {
    setSceneReady(false)
  }, [noteId])

  useEffect(() => {
    return () => {
      loadingUnsubRef.current?.()
      loadingUnsubRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => window.clearTimeout(debounceRef.current)
  }, [])

  useEffect(() => {
    excalidrawApiRef.current?.updateScene({
      appState: { viewBackgroundColor: themeBackgroundColor },
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [themeBackgroundColor])

  /**
   * Depends only on the note payload — not on `themeBackgroundColor` state — so opening
   * a note does not rebuild `initialData` after the first frame (that double-apply was
   * causing a visible blink). Background for the initial mount comes from the same read
   * as `useState`, via `canvasBackgroundNow()` here.
   */
  const initialData = useMemo(() => {
    const viewBg = canvasBackgroundNow()
    const raw = sceneJson?.trim()
    if (!raw) {
      return { appState: { viewBackgroundColor: viewBg } }
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const prevApp =
        typeof parsed.appState === 'object' && parsed.appState !== null
          ? (parsed.appState as Record<string, unknown>)
          : {}
      return {
        ...parsed,
        appState: {
          ...prevApp,
          viewBackgroundColor: viewBg
        }
      }
    } catch {
      return { appState: { viewBackgroundColor: viewBg } }
    }
  }, [noteId, sceneJson])

  const onChange = useCallback(
    (
      elements: Parameters<typeof serializeAsJSON>[0],
      appState: Parameters<typeof serializeAsJSON>[1],
      files: Parameters<typeof serializeAsJSON>[2]
    ) => {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        const json = serializeAsJSON(elements, appState, files, 'local')
        onSceneJsonChange(json)
      }, 400)
    },
    [onSceneJsonChange]
  )

  /** If loading never clears (e.g. bad scene), avoid a permanent blank. */
  useEffect(() => {
    if (sceneReady) return
    const t = window.setTimeout(() => {
      setSceneReady(true)
    }, 4000)
    return () => window.clearTimeout(t)
  }, [noteId, sceneReady])

  return (
    <div className="gitnotes-excalidraw-host relative min-h-0 w-full flex-1 [&_.excalidraw]:h-full">
      <div
        className={cn(
          'absolute inset-0 z-[60] transition-opacity duration-150',
          sceneReady ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
        )}
        style={{ backgroundColor: themeBackgroundColor }}
        aria-hidden={sceneReady}
      />
      <Excalidraw
        key={noteId}
        theme={excalidrawTheme}
        initialData={initialData}
        excalidrawAPI={(api) => {
          excalidrawApiRef.current = api
          loadingUnsubRef.current?.()
          loadingUnsubRef.current = api.onChange((_elements, appState) => {
            if (!appState.isLoading) {
              setSceneReady(true)
            }
          })
          queueMicrotask(() => {
            if (!api.getAppState().isLoading) {
              setSceneReady(true)
            }
          })
        }}
        onChange={onChange}
      />
    </div>
  )
}

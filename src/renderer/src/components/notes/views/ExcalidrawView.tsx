import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

import {
  CaptureUpdateAction,
  Excalidraw,
  serializeAsJSON
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { useTheme } from 'next-themes'

import { THEME_PRESET_CHANGED_EVENT } from '@/lib/theme/theme-preset-apply'

/** Hides Excalidraw’s first-paint flash while the scene initializes (new note / switch). */
const LOAD_MASK_MS = 200

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

function fallbackBackground(resolvedTheme: string | undefined): string {
  return resolveIsDark(resolvedTheme) ? BG_DARK : BG_LIGHT
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

export type ExcalidrawViewProps = {
  notePath: string
  sceneJson: string | null
  onSceneJsonChange: (json: string) => void
}

export function ExcalidrawView({
  notePath,
  sceneJson,
  onSceneJsonChange
}: ExcalidrawViewProps): JSX.Element {
  const { resolvedTheme } = useTheme()
  const excalidrawTheme = resolveIsDark(resolvedTheme) ? 'dark' : 'light'

  const [themeBackgroundColor, setThemeBackgroundColor] = useState(() =>
    cssColorToCanvasColor(fallbackBackground(resolvedTheme))
  )

  const [loadMaskVisible, setLoadMaskVisible] = useState(true)

  useEffect(() => {
    setLoadMaskVisible(true)
    const id = window.setTimeout(() => setLoadMaskVisible(false), LOAD_MASK_MS)
    return () => window.clearTimeout(id)
  }, [notePath])

  useEffect(() => {
    setThemeBackgroundColor(cssColorToCanvasColor(fallbackBackground(resolvedTheme)))

    const sync = (): void => {
      setThemeBackgroundColor(cssColorToCanvasColor(readDocumentBackgroundCss()))
    }

    sync()
    const t = window.setTimeout(sync, 0)

    const el = document.documentElement
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] })

    const onPresetChanged = (): void => {
      sync()
    }
    window.addEventListener(THEME_PRESET_CHANGED_EVENT, onPresetChanged)

    return () => {
      window.clearTimeout(t)
      obs.disconnect()
      window.removeEventListener(THEME_PRESET_CHANGED_EVENT, onPresetChanged)
    }
  }, [resolvedTheme])

  const debounceRef = useRef<number>(0)
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const lastSavedElementsRef = useRef<string>('')

  useEffect(() => {
    return () => window.clearTimeout(debounceRef.current)
  }, [])

  // Reset saved elements ref when switching notes so the first onChange after
  // a note switch is not wrongly skipped.
  useEffect(() => {
    lastSavedElementsRef.current = ''
  }, [notePath])

  useEffect(() => {
    excalidrawApiRef.current?.updateScene({
      appState: { viewBackgroundColor: themeBackgroundColor },
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [themeBackgroundColor])

  const initialData = useMemo(() => {
    const raw = sceneJson?.trim()
    if (!raw) {
      return { appState: { viewBackgroundColor: themeBackgroundColor } }
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
          viewBackgroundColor: themeBackgroundColor
        }
      }
    } catch {
      return { appState: { viewBackgroundColor: themeBackgroundColor } }
    }
  }, [notePath, sceneJson, themeBackgroundColor])

  const onChange = useCallback(
    (
      elements: Parameters<typeof serializeAsJSON>[0],
      appState: Parameters<typeof serializeAsJSON>[1],
      files: Parameters<typeof serializeAsJSON>[2]
    ) => {
      // Serialize only the stable parts (elements + files) to detect real content
      // changes. appState contains volatile UI state (scroll, cursor, etc.) that
      // changes constantly even when the drawing is untouched.
      const elementsKey = JSON.stringify({ elements, files })
      if (elementsKey === lastSavedElementsRef.current) return

      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        const json = serializeAsJSON(elements, appState, files, 'local')
        lastSavedElementsRef.current = elementsKey
        onSceneJsonChange(json)
      }, 400)
    },
    [onSceneJsonChange]
  )

  return (
    <div className="notelab-excalidraw-host relative min-h-0 w-full flex-1 [&_.excalidraw]:h-full">
      {loadMaskVisible ? (
        <div
          className="pointer-events-auto absolute inset-0 z-50"
          style={{ backgroundColor: themeBackgroundColor }}
          aria-hidden
        />
      ) : null}
      <Excalidraw
        key={notePath}
        theme={excalidrawTheme}
        initialData={initialData}
        excalidrawAPI={(api) => {
          excalidrawApiRef.current = api
          queueMicrotask(() => {
            const css = readDocumentBackgroundCss()
            api.updateScene({
              appState: {
                viewBackgroundColor: cssColorToCanvasColor(css)
              },
              captureUpdate: CaptureUpdateAction.NEVER
            })
          })
        }}
        onChange={onChange}
      />
    </div>
  )
}

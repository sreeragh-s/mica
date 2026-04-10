"use client"

import { type CSSProperties, type JSX, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'

import { ArrowLeft, ArrowRight, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MacTitlebarStyles } from '@/components/notes/notes-app-types'

export type NotesBrowserPanelProps = {
  url: string
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  onClose: () => void
}

const embeddedBrowserUserAgent =
  typeof window !== 'undefined' ? window.api?.embeddedBrowserUserAgent : undefined

export function NotesBrowserPanel({
  url,
  isMacNotelab,
  macTitlebarStyles,
  onClose,
}: NotesBrowserPanelProps): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag & HTMLElement>(null)
  const [inputUrl, setInputUrl] = useState(url)

  // Keep address bar in sync with webview navigation
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    const onNavigate = (e: Event): void => {
      const url = (e as CustomEvent & { url: string }).url
      if (url) setInputUrl(url)
    }
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
    }
  }, [])

  const navigate = useCallback((target: string) => {
    let normalized = target.trim()
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`
    }
    if (!normalized) return
    setInputUrl(normalized)
    const wv = webviewRef.current
    if (wv) {
      void Promise.resolve(wv.loadURL(normalized)).catch(() => {})
    }
  }, [])

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') navigate(inputUrl)
    },
    [inputUrl, navigate]
  )

  const handleReload = useCallback(() => {
    webviewRef.current?.reload()
  }, [])

  const handleBack = useCallback(() => {
    webviewRef.current?.goBack()
  }, [])

  const handleForward = useCallback(() => {
    webviewRef.current?.goForward()
  }, [])

  const toolbar: CSSProperties = isMacNotelab ? macTitlebarStyles.noDrag : {}

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div
        className="border-border bg-background flex h-10 shrink-0 items-center gap-1 border-b px-2"
        style={toolbar}
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Close browser panel"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Go back"
          onClick={handleBack}
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Go forward"
          onClick={handleForward}
        >
          <ArrowRight className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Reload"
          onClick={handleReload}
        >
          <RefreshCw className="size-4" aria-hidden />
        </Button>

        <Input
          className="h-7 min-w-0 flex-1 text-xs"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={(e) => e.target.select()}
          aria-label="URL"
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {/* Page — webview runs in its own renderer process, bypassing the app's CSP */}
      {/* eslint-disable-next-line react/no-unknown-property */}
      <webview
        ref={webviewRef}
        src={url}
        {...(embeddedBrowserUserAgent ? { useragent: embeddedBrowserUserAgent } : {})}
        style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%' }}
      />
    </div>
  )
}

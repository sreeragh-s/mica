"use client"

import * as React from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  GlobeIcon,
  HomeIcon,
  RefreshCwIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { isBrowserUrl, isHtmlFile } from "@/lib/file-types"
import {
  getDisplayNameForUrl,
  getFaviconUrl,
  requestBrowserTabUpdate,
} from "@/lib/browser-settings"

type HtmlFileViewProps = {
  filePath: string
}

export const HtmlFileView = React.memo(function HtmlFileView({
  filePath,
}: HtmlFileViewProps) {
  const isUrl = isBrowserUrl(filePath)
  const homeSrc = React.useMemo(() => {
    if (isUrl) return filePath
    if (isHtmlFile(filePath)) return convertFileSrc(filePath)
    return filePath
  }, [filePath, isUrl])

  const [currentUrl, setCurrentUrl] = React.useState(homeSrc)
  const [inputValue, setInputValue] = React.useState(homeSrc)
  const [iframeKey, setIframeKey] = React.useState(0)
  const [faviconError, setFaviconError] = React.useState(false)
  const historyRef = React.useRef<string[]>([homeSrc])
  const cursorRef = React.useRef(0)
  const [canGoBack, setCanGoBack] = React.useState(false)
  const [canGoForward, setCanGoForward] = React.useState(false)

  const favicon = React.useMemo(() => getFaviconUrl(currentUrl), [currentUrl])

  React.useEffect(() => {
    setFaviconError(false)
  }, [favicon])

  React.useEffect(() => {
    if (!isUrl) return
    requestBrowserTabUpdate({
      path: filePath,
      name: getDisplayNameForUrl(currentUrl),
      faviconUrl: favicon,
    })
  }, [filePath, currentUrl, favicon, isUrl])

  React.useEffect(() => {
    historyRef.current = [homeSrc]
    cursorRef.current = 0
    setCurrentUrl(homeSrc)
    setInputValue(homeSrc)
    setCanGoBack(false)
    setCanGoForward(false)
    setIframeKey((k) => k + 1)
  }, [homeSrc])

  const navigateTo = React.useCallback((target: string) => {
    const history = historyRef.current
    history.splice(cursorRef.current + 1)
    history.push(target)
    cursorRef.current = history.length - 1
    setCurrentUrl(target)
    setInputValue(target)
    setCanGoBack(cursorRef.current > 0)
    setCanGoForward(false)
    setIframeKey((k) => k + 1)
  }, [])

  const handleBack = React.useCallback(() => {
    if (cursorRef.current <= 0) return
    cursorRef.current -= 1
    const target = historyRef.current[cursorRef.current]
    setCurrentUrl(target)
    setInputValue(target)
    setCanGoBack(cursorRef.current > 0)
    setCanGoForward(cursorRef.current < historyRef.current.length - 1)
    setIframeKey((k) => k + 1)
  }, [])

  const handleForward = React.useCallback(() => {
    if (cursorRef.current >= historyRef.current.length - 1) return
    cursorRef.current += 1
    const target = historyRef.current[cursorRef.current]
    setCurrentUrl(target)
    setInputValue(target)
    setCanGoBack(cursorRef.current > 0)
    setCanGoForward(cursorRef.current < historyRef.current.length - 1)
    setIframeKey((k) => k + 1)
  }, [])

  const handleReload = React.useCallback(() => {
    setIframeKey((k) => k + 1)
  }, [])

  const handleHome = React.useCallback(() => {
    if (currentUrl === homeSrc) {
      setIframeKey((k) => k + 1)
      return
    }
    navigateTo(homeSrc)
  }, [currentUrl, homeSrc, navigateTo])

  const handleOpenExternal = React.useCallback(() => {
    const target = isBrowserUrl(currentUrl) ? currentUrl : inputValue
    if (!isBrowserUrl(target)) return
    void openUrl(target)
  }, [currentUrl, inputValue])

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const value = inputValue.trim()
      if (!value) return

      let target = value
      if (
        !isBrowserUrl(target) &&
        !target.startsWith("file://") &&
        !target.startsWith("tauri://") &&
        !target.startsWith("http://localhost")
      ) {
        target = `https://${target}`
      }
      navigateTo(target)
    },
    [inputValue, navigateTo],
  )

  const canOpenExternal = isBrowserUrl(currentUrl)
  const showFavicon = Boolean(favicon) && !faviconError

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-hidden">
        <iframe
          key={iframeKey}
          src={currentUrl}
          className="block h-full w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          referrerPolicy="no-referrer"
          title="In-app browser"
        />
      </div>
      <div className="bottom-bar bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-full w-full items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleBack}
            disabled={!canGoBack}
            title="Back"
          >
            <ArrowLeftIcon className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleForward}
            disabled={!canGoForward}
            title="Forward"
          >
            <ArrowRightIcon className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleReload}
            title="Reload"
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleHome}
            title="Home"
          >
            <HomeIcon className="size-3.5" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <form
            onSubmit={handleSubmit}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 transition-colors focus-within:border-ring focus-within:bg-background"
          >
            {showFavicon ? (
              <img
                src={favicon ?? undefined}
                alt=""
                aria-hidden
                className="size-3.5 shrink-0 rounded-sm object-contain"
                onError={() => setFaviconError(true)}
              />
            ) : (
              <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="h-7 w-full min-w-0 border-0 bg-transparent text-xs text-foreground outline-none"
              placeholder="Enter URL"
            />
          </form>

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={handleOpenExternal}
            disabled={!canOpenExternal}
            title="Open in system browser"
          >
            <ExternalLinkIcon className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
})

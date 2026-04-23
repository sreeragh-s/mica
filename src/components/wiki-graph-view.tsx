import * as React from "react"

import { Button } from "@/components/ui/button"
import { useSigma } from "@/hooks/useSigma"
import { wikiGraphToGraphology, type WikiGraphTheme } from "@/lib/wiki-graph-adapter"
import {
  requestWorkspaceWikiLinkRebuild,
  useWikiLinkGraphData,
  type WikiLinkIndexingState,
} from "@/lib/wikilink-utils"
import {
  LoaderCircleIcon,
  LocateFixedIcon,
  MaximizeIcon,
  MinimizeIcon,
  OrbitIcon,
  RefreshCwIcon,
  WaypointsIcon,
} from "lucide-react"

function toCanvasColor(value: string, fallback: string) {
  if (typeof document === "undefined") {
    return fallback
  }

  const probe = document.createElement("span")
  probe.style.color = fallback
  probe.style.color = value
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  probe.style.pointerEvents = "none"
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color || fallback
  probe.remove()
  return resolved
}

type WikiGraphViewProps = {
  activeFilePath: string | null
  indexingState: WikiLinkIndexingState
}

export const WikiGraphView = React.memo(function WikiGraphView({
  activeFilePath,
  indexingState,
}: WikiGraphViewProps) {
  const { edges, isIndexed, isLoading, meta, nodes } = useWikiLinkGraphData()
  const [graphTheme, setGraphTheme] = React.useState<WikiGraphTheme & {
    background: string
    border: string
    fontFamily: string
    foreground: string
    mutedForeground: string
  }>(() => ({
    activeEdge: "currentColor",
    activeNode: "currentColor",
    background: "transparent",
    border: "currentColor",
    danglingEdge: "currentColor",
    edge: "currentColor",
    fontFamily: "inherit",
    foreground: "currentColor",
    mutedForeground: "currentColor",
    node: "currentColor",
  }))

  React.useEffect(() => {
    const readTheme = () => {
      const styles = getComputedStyle(document.documentElement)
      const bodyStyles = getComputedStyle(document.body)
      const baseColor = bodyStyles.color || "rgb(0, 0, 0)"
      const backgroundBase = bodyStyles.backgroundColor || "rgba(0, 0, 0, 0)"
      const primaryColor = toCanvasColor(
        styles.getPropertyValue("--primary").trim(),
        baseColor
      )
      const highlightColor = toCanvasColor(
        styles.getPropertyValue("--highlight").trim() || styles.getPropertyValue("--primary").trim(),
        primaryColor
      )
      const backgroundColor = toCanvasColor(
        styles.getPropertyValue("--background").trim(),
        backgroundBase
      )
      const borderColor = toCanvasColor(
        styles.getPropertyValue("--border").trim(),
        baseColor
      )
      const destructiveColor = toCanvasColor(
        styles.getPropertyValue("--destructive").trim(),
        baseColor
      )
      const foregroundColor = toCanvasColor(
        styles.getPropertyValue("--foreground").trim(),
        baseColor
      )
      const mutedColor = toCanvasColor(
        styles.getPropertyValue("--muted-foreground").trim(),
        baseColor
      )

      setGraphTheme({
        activeEdge: highlightColor,
        activeNode: primaryColor,
        background: backgroundColor,
        border: borderColor,
        danglingEdge: destructiveColor,
        edge: borderColor,
        fontFamily: bodyStyles.fontFamily || "inherit",
        foreground: foregroundColor,
        mutedForeground: mutedColor,
        node: primaryColor,
      })
    }

    readTheme()

    const observer = new MutationObserver(() => {
      readTheme()
    })

    observer.observe(document.documentElement, {
      attributeFilter: ["class", "style"],
      attributes: true,
    })

    return () => observer.disconnect()
  }, [])

  const highlightedNodeIds = React.useMemo(
    () => (activeFilePath ? new Set([activeFilePath]) : new Set<string>()),
    [activeFilePath]
  )
  const {
    containerRef,
    focusNode,
    isLayoutRunning,
    resetZoom,
    setGraph,
    startLayout,
    stopLayout,
    zoomIn,
    zoomOut,
  } = useSigma({
    highlightedNodeIds,
    theme: {
      accent: graphTheme.activeNode,
      background: graphTheme.background,
      border: graphTheme.border,
      edge: graphTheme.edge,
      fontFamily: graphTheme.fontFamily,
      foreground: graphTheme.foreground,
      mutedForeground: graphTheme.mutedForeground,
      node: graphTheme.node,
    },
  })

  React.useEffect(() => {
    if (meta?.status === "indexing") {
      return
    }

    const graph = wikiGraphToGraphology(nodes, edges, activeFilePath, graphTheme)
    setGraph(graph)
  }, [activeFilePath, edges, graphTheme, meta?.status, nodes, setGraph])

  React.useEffect(() => {
    if (!activeFilePath) {
      return
    }

    focusNode(activeFilePath)
  }, [activeFilePath, focusNode])

  const isIndexingActive =
    Boolean(indexingState.workspace) &&
    (indexingState.phase === "scanning" ||
      indexingState.phase === "saving" ||
      indexingState.phase === "error")
  const indexingProgress =
    indexingState.totalFiles > 0
      ? Math.max(
          0,
          Math.min(100, (indexingState.processedFiles / indexingState.totalFiles) * 100)
        )
      : 0

  if (!isIndexed && !isLoading && nodes.length === 0) {
    return (
      <GraphEmptyState
        actionLabel="Build graph"
        description="Index your workspace to generate the wikilink graph."
        onAction={() => requestWorkspaceWikiLinkRebuild(true)}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="relative min-h-0 flex-1 bg-background">
        <div ref={containerRef} className="h-full w-full" />
        {!isIndexed && isLoading && nodes.length === 0 ? (
          <GraphLoadingOverlay
            currentFile={indexingState.currentFile}
            indexingProgress={indexingProgress}
            isIndexingActive={isIndexingActive}
            phase={indexingState.phase}
            processedFiles={indexingState.processedFiles}
            totalFiles={indexingState.totalFiles}
          />
        ) : null}
        {isIndexingActive && nodes.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-4 top-4 z-10">
            <div className="rounded-xl border border-border/60 bg-background/88 px-3 py-2 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex min-w-0 items-center gap-2">
                  <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
                  <span className="truncate">
                    {indexingState.currentFile
                      ? `Indexing ${indexingState.currentFile}`
                      : indexingState.phase === "saving"
                        ? "Finalizing wiki graph"
                        : "Indexing wiki graph"}
                  </span>
                </div>
                <span className="shrink-0">
                  {indexingState.processedFiles}/{indexingState.totalFiles || indexingState.processedFiles}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${indexingProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bottom-bar bg-background/85 px-4 text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2">
            <WaypointsIcon className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {nodes.length} nodes, {edges.length} links
              {meta?.status ? ` • ${meta.status}` : ""}
            </span>
          </div>
          {isLoading ? <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" /> : null}
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={zoomOut}>
            <MinimizeIcon className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={zoomIn}>
            <MaximizeIcon className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={resetZoom}>
            <LocateFixedIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={isLayoutRunning ? stopLayout : startLayout}
          >
            <OrbitIcon className={isLayoutRunning ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => requestWorkspaceWikiLinkRebuild(true)}
          >
            <RefreshCwIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
})

function GraphLoadingOverlay({
  currentFile,
  indexingProgress,
  isIndexingActive,
  phase,
  processedFiles,
  totalFiles,
}: {
  currentFile: string | null
  indexingProgress: number
  isIndexingActive: boolean
  phase: WikiLinkIndexingState["phase"]
  processedFiles: number
  totalFiles: number
}) {
  const dotCount = Math.max(6, Math.min(20, processedFiles || 6))

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card/92 p-6 shadow-lg">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <LoaderCircleIcon className="size-4 animate-spin text-primary" />
          <span>
            {phase === "saving"
              ? "Finalizing wiki graph"
              : phase === "error"
                ? "Wiki indexing failed"
                : "Building wiki graph"}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {currentFile
            ? `Processing ${currentFile}`
            : isIndexingActive
              ? "Scanning workspace notes and wikilinks"
              : "Preparing graph view"}
        </p>

        <div className="mt-5 rounded-xl border border-border/60 bg-background/80 p-4">
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
            {Array.from({ length: dotCount }, (_, index) => (
              <div
                key={index}
                className="aspect-square rounded-full bg-primary/20 animate-pulse"
                style={{
                  animationDelay: `${index * 80}ms`,
                  opacity: index / dotCount < indexingProgress / 100 ? 1 : 0.35,
                  transform: `scale(${index / dotCount < indexingProgress / 100 ? 1 : 0.7})`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {processedFiles} of {totalFiles || processedFiles} files
            </span>
            <span>{Math.round(indexingProgress)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${indexingProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function GraphEmptyState({
  actionLabel,
  description,
  onAction,
}: {
  actionLabel: string
  description: string
  onAction: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-6">
      <div className="max-w-md rounded-2xl border border-border/60 bg-card px-6 py-8 text-center shadow-sm">
        <WaypointsIcon className="mx-auto size-10 text-primary/80" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Wiki graph unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button type="button" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

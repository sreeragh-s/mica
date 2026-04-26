import * as React from "react"
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d"

import { Button } from "@/components/ui/button"
import {
  buildForceGraphData,
  type ForceGraphLink,
  type ForceGraphNode,
  type WikiGraphTheme,
} from "@/lib/wiki-graph-adapter"
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

type FGNode = NodeObject<ForceGraphNode>
type FGLink = LinkObject<ForceGraphNode, ForceGraphLink>

const nodeCanvasObjectModeAll = () => "replace" as const

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

function withAlpha(color: string, alpha: number) {
  const match = color.match(/^rgba?\(([^)]+)\)$/i)
  if (!match) {
    return color
  }

  const parts = match[1].split(",").map((part) => part.trim())
  if (parts.length < 3) {
    return color
  }

  const [r, g, b] = parts
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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

  const [graphTheme, setGraphTheme] = React.useState<WikiGraphTheme>(() => ({
    activeEdge: "rgb(96, 165, 250)",
    activeNode: "rgb(96, 165, 250)",
    background: "rgb(18, 18, 28)",
    border: "rgb(42, 42, 58)",
    danglingEdge: "rgb(239, 68, 68)",
    danglingNode: "rgb(148, 163, 184)",
    edge: "rgb(42, 42, 58)",
    fontFamily: "inherit",
    foreground: "rgb(245, 245, 247)",
    mutedForeground: "rgb(148, 163, 184)",
    node: "rgb(96, 165, 250)",
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
        styles.getPropertyValue("--highlight").trim() ||
          styles.getPropertyValue("--primary").trim(),
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
        danglingNode: mutedColor,
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

  const graphData = React.useMemo(
    () => buildForceGraphData(nodes, edges),
    [nodes, edges]
  )

  const fgData = React.useMemo(
    () => ({ links: graphData.links, nodes: graphData.nodes }),
    [graphData]
  )

  const containerRef = React.useRef<HTMLDivElement>(null)
  const fgRef = React.useRef<ForceGraphMethods<ForceGraphNode, ForceGraphLink>>(undefined)
  const [dimensions, setDimensions] = React.useState({ height: 0, width: 0 })
  const [isLayoutRunning, setIsLayoutRunning] = React.useState(false)
  const [hoverNode, setHoverNode] = React.useState<FGNode | null>(null)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const update = () => {
      const rect = element.getBoundingClientRect()
      setDimensions({
        height: Math.max(0, Math.round(rect.height)),
        width: Math.max(0, Math.round(rect.width)),
      })
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const highlightedNodeIds = React.useMemo(() => {
    const set = new Set<string>()
    if (activeFilePath) set.add(activeFilePath)
    if (selectedNodeId) set.add(selectedNodeId)
    if (hoverNode?.id != null) set.add(String(hoverNode.id))
    return set
  }, [activeFilePath, hoverNode, selectedNodeId])

  const focusedNodeId = selectedNodeId ?? (hoverNode?.id != null ? String(hoverNode.id) : null)

  const connectedNodeIds = React.useMemo(() => {
    if (!focusedNodeId) return new Set<string>()
    const neighbors = graphData.neighborsByNode.get(focusedNodeId)
    return neighbors ? new Set(neighbors) : new Set<string>()
  }, [focusedNodeId, graphData.neighborsByNode])

  const connectedLinkIds = React.useMemo(() => {
    if (!focusedNodeId) return new Set<string>()
    const linkIds = graphData.linksByNode.get(focusedNodeId)
    return linkIds ? new Set(linkIds) : new Set<string>()
  }, [focusedNodeId, graphData.linksByNode])

  const hasFocus = focusedNodeId != null

  const derivedColors = React.useMemo(
    () => ({
      activeNodeRing: withAlpha(graphTheme.activeNode, 0.18),
      dimmedEdge: withAlpha(graphTheme.edge, 0.2),
      dimmedLabel: withAlpha(graphTheme.mutedForeground, 0.5),
      dimmedNode: withAlpha(graphTheme.mutedForeground, 0.35),
    }),
    [graphTheme]
  )

  const nodeColor = React.useCallback(
    (node: FGNode) => {
      const id = String(node.id)
      if (highlightedNodeIds.has(id)) return graphTheme.activeNode
      if (hasFocus) {
        if (connectedNodeIds.has(id)) return graphTheme.activeNode
        return derivedColors.dimmedNode
      }
      return node.isDangling ? graphTheme.danglingNode : graphTheme.node
    },
    [connectedNodeIds, derivedColors, graphTheme, hasFocus, highlightedNodeIds]
  )

  const linkColor = React.useCallback(
    (link: FGLink) => {
      const id = String(link.id)
      const isDangling = Boolean(link.isDangling)
      if (hasFocus) {
        if (connectedLinkIds.has(id)) return graphTheme.activeEdge
        return derivedColors.dimmedEdge
      }
      return isDangling ? graphTheme.danglingEdge : graphTheme.edge
    },
    [connectedLinkIds, derivedColors, graphTheme, hasFocus]
  )

  const linkWidth = React.useCallback(
    (link: FGLink) => {
      const id = String(link.id)
      const base = typeof link.width === "number" ? link.width : 1
      if (connectedLinkIds.has(id)) return Math.max(1.6, base * 2.2)
      return base
    },
    [connectedLinkIds]
  )

  const linkDirectionalParticles = React.useCallback(
    (link: FGLink) => (connectedLinkIds.has(String(link.id)) ? 3 : 0),
    [connectedLinkIds]
  )

  const nodeVal = React.useCallback((node: FGNode) => {
    const size = typeof node.size === "number" ? node.size : 8
    return size
  }, [])

  const LABEL_ZOOM_THRESHOLD = 0.5

  const renderNode = React.useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x
      const y = node.y
      if (x == null || y == null) return

      const id = String(node.id)
      const isHighlighted = highlightedNodeIds.has(id)
      const isConnected = hasFocus && connectedNodeIds.has(id)
      const size = typeof node.size === "number" ? node.size : 8
      const radius = size * 0.9 > 5 ? size * 0.9 : 5

      if (isHighlighted) {
        const invScale = 1 / globalScale
        ctx.beginPath()
        ctx.arc(x, y, radius + 4 * invScale, 0, Math.PI * 2)
        ctx.fillStyle = derivedColors.activeNodeRing
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, radius + 2 * invScale, 0, Math.PI * 2)
        ctx.strokeStyle = graphTheme.activeNode
        ctx.lineWidth = 1.5 * invScale
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = nodeColor(node)
      ctx.fill()

      const label = node.label
      if (!label) return
      if (!isHighlighted && !isConnected && globalScale < LABEL_ZOOM_THRESHOLD) return

      const invScale = 1 / globalScale
      const fontSize = 13 * invScale > 10 ? 13 * invScale : 10
      ctx.font = `500 ${fontSize}px ${graphTheme.fontFamily}`
      ctx.textAlign = "center"
      ctx.textBaseline = "top"

      const textY = y + radius + 3 * invScale

      if (isHighlighted) {
        const textWidth = ctx.measureText(label).width
        const paddingX = 4 * invScale
        const paddingY = 2 * invScale
        const bgX = x - textWidth / 2 - paddingX
        const bgY = textY - paddingY
        const bgW = textWidth + paddingX * 2
        const bgH = fontSize + paddingY * 2
        const r = 3 * invScale

        ctx.fillStyle = graphTheme.background
        ctx.beginPath()
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(bgX, bgY, bgW, bgH, r)
        } else {
          ctx.rect(bgX, bgY, bgW, bgH)
        }
        ctx.fill()

        ctx.strokeStyle = graphTheme.activeNode
        ctx.lineWidth = invScale
        ctx.stroke()

        ctx.fillStyle = graphTheme.foreground
      } else {
        ctx.fillStyle =
          hasFocus && !isConnected ? derivedColors.dimmedLabel : graphTheme.foreground
      }

      ctx.fillText(label, x, textY)
    },
    [connectedNodeIds, derivedColors, graphTheme, hasFocus, highlightedNodeIds, nodeColor]
  )

  const paintPointerArea = React.useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.x == null || node.y == null) return
      const size = typeof node.size === "number" ? node.size : 8
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x, node.y, Math.max(6, size * 1.0), 0, 2 * Math.PI, false)
      ctx.fill()
    },
    []
  )

  const handleNodeClick = React.useCallback(
    (node: FGNode) => {
      if (node.id == null) return
      const id = String(node.id)
      setSelectedNodeId(id)
      if (node.x != null && node.y != null) {
        fgRef.current?.centerAt(node.x, node.y, 500)
        fgRef.current?.zoom(3, 500)
      }
    },
    []
  )

  const handleBackgroundClick = React.useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const handleNodeHover = React.useCallback((node: FGNode | null) => {
    setHoverNode(node)
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? "pointer" : "grab"
    }
  }, [])

  const handleEngineStop = React.useCallback(() => {
    setIsLayoutRunning(false)
  }, [])

  React.useEffect(() => {
    setIsLayoutRunning(true)
  }, [fgData])

  React.useEffect(() => {
    if (!activeFilePath) return
    const fg = fgRef.current
    if (!fg) return

    const match = graphData.nodes.find((node) => node.id === activeFilePath)
    if (!match) return

    const focus = () => {
      if (match.x == null || match.y == null) return
      fg.centerAt(match.x, match.y, 500)
      fg.zoom(2.4, 500)
    }

    const timeout = window.setTimeout(focus, 200)
    return () => window.clearTimeout(timeout)
  }, [activeFilePath, graphData.nodes])

  const zoomIn = React.useCallback(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.zoom(fg.zoom() * 1.4, 200)
  }, [])

  const zoomOut = React.useCallback(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.zoom(fg.zoom() / 1.4, 200)
  }, [])

  const resetZoom = React.useCallback(() => {
    setSelectedNodeId(null)
    fgRef.current?.zoomToFit(400, 60)
  }, [])

  const startLayout = React.useCallback(() => {
    fgRef.current?.d3ReheatSimulation()
    setIsLayoutRunning(true)
  }, [])

  const stopLayout = React.useCallback(() => {
    fgRef.current?.pauseAnimation()
    setIsLayoutRunning(false)
  }, [])

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
        <div ref={containerRef} className="h-full w-full">
          {dimensions.width > 0 && dimensions.height > 0 ? (
            <ForceGraph2D<ForceGraphNode, ForceGraphLink>
              ref={fgRef}
              autoPauseRedraw
              backgroundColor={graphTheme.background}
              cooldownTicks={Math.min(120, Math.max(60, Math.round(fgData.nodes.length * 0.6)))}
              d3AlphaDecay={0.035}
              d3VelocityDecay={0.4}
              enableNodeDrag
              graphData={fgData}
              height={dimensions.height}
              linkColor={linkColor}
              linkDirectionalParticleColor={graphTheme.activeEdge}
              linkDirectionalParticleSpeed={0.006}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticles={linkDirectionalParticles}
              linkWidth={linkWidth}
              nodeCanvasObject={renderNode}
              nodeCanvasObjectMode={nodeCanvasObjectModeAll}
              nodePointerAreaPaint={paintPointerArea}
              nodeRelSize={6}
              nodeVal={nodeVal}
              onBackgroundClick={handleBackgroundClick}
              onEngineStop={handleEngineStop}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              warmupTicks={10}
              width={dimensions.width}
            />
          ) : null}
        </div>
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

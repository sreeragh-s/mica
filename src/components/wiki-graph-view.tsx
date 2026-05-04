import * as React from "react"
import { forceX, forceY } from "d3-force"
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
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
import { LoaderCircleIcon, LocateFixedIcon, RefreshCwIcon, WaypointsIcon } from "lucide-react"

type FGNode = NodeObject<ForceGraphNode>
type FGLink = LinkObject<ForceGraphNode, ForceGraphLink>
type NodePositionSnapshot = Pick<ForceGraphNode, "vx" | "vy" | "x" | "y">
type GraphViewportBounds = {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

const LABEL_ZOOM_THRESHOLD = 1.15
const LABEL_FADE_WINDOW = 0.9
const nodeCanvasObjectModeAll = () => "replace" as const

type GraphControls = {
  arrows: boolean
  centerForce: number
  labelZoomThreshold: number
  linkDistance: number
  linkForce: number
  linkThicknessScale: number
  nodeSizeScale: number
  repelForce: number
}

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getLabelOpacity(globalScale: number, threshold: number) {
  const fadeStart = Math.max(0, threshold - LABEL_FADE_WINDOW)
  if (globalScale >= threshold) {
    return 1
  }
  if (globalScale <= fadeStart) {
    return 0
  }

  const progress = (globalScale - fadeStart) / Math.max(0.001, threshold - fadeStart)
  return clamp(progress, 0, 1)
}

function isWithinBounds(
  x: number,
  y: number,
  bounds: GraphViewportBounds | null,
  padding: number
) {
  if (!bounds) {
    return true
  }

  return (
    x >= bounds.minX - padding &&
    x <= bounds.maxX + padding &&
    y >= bounds.minY - padding &&
    y <= bounds.maxY + padding
  )
}

function openNodeFile(node: FGNode) {
  if (!node.path) {
    return
  }

  window.dispatchEvent(
    new CustomEvent("file-selected", {
      detail: {
        name: node.label || node.path.split("/").pop() || node.path,
        path: node.path,
      },
    })
  )
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
  const [controls, setControls] = React.useState<GraphControls>({
    arrows: false,
    centerForce: 0.4,
    labelZoomThreshold: LABEL_ZOOM_THRESHOLD,
    linkDistance: 90,
    linkForce: 0.55,
    linkThicknessScale: 1,
    nodeSizeScale: 1,
    repelForce: 180,
  })

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
  const containerRef = React.useRef<HTMLDivElement>(null)
  const fgRef = React.useRef<ForceGraphMethods<ForceGraphNode, ForceGraphLink>>(undefined)
  const didInitialFitRef = React.useRef(false)
  const positionCacheRef = React.useRef(new Map<string, NodePositionSnapshot>())
  const [dimensions, setDimensions] = React.useState({ height: 0, width: 0 })
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null)
  const [viewportBounds, setViewportBounds] = React.useState<GraphViewportBounds | null>(null)

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

    const observer = new MutationObserver(readTheme)
    observer.observe(document.documentElement, {
      attributeFilter: ["class", "style"],
      attributes: true,
    })

    return () => observer.disconnect()
  }, [])

  const graphData = React.useMemo(() => {
    const nextGraph = buildForceGraphData(nodes, edges)

    nextGraph.nodes = nextGraph.nodes.map((node) => {
      const cached = positionCacheRef.current.get(node.id)
      return cached ? { ...node, ...cached } : node
    })

    return nextGraph
  }, [nodes, edges])

  const fgData = React.useMemo(
    () => ({ links: graphData.links, nodes: graphData.nodes }),
    [graphData]
  )

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

  const focusedNodeId = selectedNodeId ?? activeFilePath

  const connectedNodeIds = React.useMemo(() => {
    if (!focusedNodeId) return new Set<string>()

    const neighbors = graphData.neighborsByNode.get(focusedNodeId)
    return new Set([focusedNodeId, ...(neighbors ? Array.from(neighbors) : [])])
  }, [focusedNodeId, graphData.neighborsByNode])

  const connectedLinkIds = React.useMemo(() => {
    if (!focusedNodeId) return new Set<string>()
    const linkIds = graphData.linksByNode.get(focusedNodeId)
    return linkIds ? new Set(linkIds) : new Set<string>()
  }, [focusedNodeId, graphData.linksByNode])

  const hasFocus = connectedNodeIds.size > 0

  const derivedColors = React.useMemo(
    () => ({
      activeNodeRing: withAlpha(graphTheme.activeNode, 0.16),
      dimmedEdge: withAlpha(graphTheme.edge, 0.18),
      dimmedLabel: withAlpha(graphTheme.mutedForeground, 0.45),
      dimmedNode: withAlpha(graphTheme.mutedForeground, 0.28),
    }),
    [graphTheme]
  )

  const nodeColor = React.useCallback(
    (node: FGNode) => {
      const id = String(node.id)
      if (id === focusedNodeId) return graphTheme.activeNode
      if (hasFocus) {
        return connectedNodeIds.has(id) ? graphTheme.node : derivedColors.dimmedNode
      }
      return node.isDangling ? graphTheme.danglingNode : graphTheme.node
    },
    [connectedNodeIds, derivedColors, focusedNodeId, graphTheme, hasFocus]
  )

  const linkColor = React.useCallback(
    (link: FGLink) => {
      const id = String(link.id)
      if (hasFocus) {
        return connectedLinkIds.has(id) ? graphTheme.edge : derivedColors.dimmedEdge
      }
      return link.isDangling ? graphTheme.danglingEdge : graphTheme.edge
    },
    [connectedLinkIds, derivedColors, graphTheme, hasFocus]
  )

  const linkWidth = React.useCallback(
    (link: FGLink) => {
      const base =
        (typeof link.width === "number" ? link.width : 1) * controls.linkThicknessScale
      return connectedLinkIds.has(String(link.id)) ? Math.max(1.5, base * 1.8) : base
    },
    [connectedLinkIds, controls.linkThicknessScale]
  )

  const nodeVal = React.useCallback((node: FGNode) => {
    const size = typeof node.size === "number" ? node.size : 8
    return size * controls.nodeSizeScale
  }, [controls.nodeSizeScale])

  const renderNode = React.useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x
      const y = node.y
      if (x == null || y == null) return

      const id = String(node.id)
      const isFocused = id === focusedNodeId
      const isConnected = connectedNodeIds.has(id)
      const size = (typeof node.size === "number" ? node.size : 8) * controls.nodeSizeScale
      const radius = Math.max(4.5, size * 0.82)

      if (isFocused) {
        const ringWidth = 2 / globalScale
        ctx.beginPath()
        ctx.arc(x, y, radius + 5 / globalScale, 0, Math.PI * 2)
        ctx.fillStyle = derivedColors.activeNodeRing
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, radius + 2.5 / globalScale, 0, Math.PI * 2)
        ctx.lineWidth = ringWidth
        ctx.strokeStyle = graphTheme.activeNode
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = nodeColor(node)
      ctx.fill()

      if (node.path == null) {
        return
      }

      const label = node.label
      if (!label) return

      const labelOpacity =
        isFocused || isConnected ? 1 : getLabelOpacity(globalScale, controls.labelZoomThreshold)

      if (labelOpacity <= 0) {
        return
      }

      if (!isFocused && !isConnected) {
        const viewportPadding = Math.max(24, 80 / Math.max(globalScale, 0.001))
        if (!isWithinBounds(x, y, viewportBounds, viewportPadding)) {
          return
        }
      }

      const fontSize = Math.max(10, 12 / globalScale)
      ctx.font = `${fontSize}px ${graphTheme.fontFamily}`
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      const baseLabelColor =
        hasFocus && !isConnected ? derivedColors.dimmedLabel : graphTheme.foreground
      ctx.save()
      ctx.globalAlpha *= labelOpacity
      ctx.fillStyle = baseLabelColor
      ctx.fillText(label, x, y + radius + 6 / globalScale)
      ctx.restore()
    },
    [
      connectedNodeIds,
      controls.labelZoomThreshold,
      controls.nodeSizeScale,
      derivedColors,
      focusedNodeId,
      graphTheme,
      hasFocus,
      nodeColor,
      viewportBounds,
    ]
  )

  const paintPointerArea = React.useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.x == null || node.y == null) return
      const size = (typeof node.size === "number" ? node.size : 8) * controls.nodeSizeScale
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x, node.y, Math.max(8, size), 0, 2 * Math.PI, false)
      ctx.fill()
    },
    [controls.nodeSizeScale]
  )

  const updateViewportBounds = React.useCallback(() => {
    const fg = fgRef.current
    if (!fg || dimensions.width === 0 || dimensions.height === 0) return

    const topLeft = fg.screen2GraphCoords(0, 0)
    const bottomRight = fg.screen2GraphCoords(dimensions.width, dimensions.height)

    setViewportBounds({
      maxX: Math.max(topLeft.x, bottomRight.x),
      maxY: Math.max(topLeft.y, bottomRight.y),
      minX: Math.min(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
    })
  }, [dimensions.height, dimensions.width])

  const cacheNodePositions = React.useCallback((graphNodes: ForceGraphNode[]) => {
    graphNodes.forEach((node) => {
      if (typeof node.x !== "number" || typeof node.y !== "number") {
        return
      }

      positionCacheRef.current.set(node.id, {
        vx: node.vx,
        vy: node.vy,
        x: node.x,
        y: node.y,
      })
    })
  }, [])

  const fitGraph = React.useCallback((duration = 600) => {
    setSelectedNodeId(null)
    fgRef.current?.zoomToFit(duration, 64)
  }, [])

  const handleNodeClick = React.useCallback((node: FGNode) => {
    if (node.id == null) return

    setSelectedNodeId(String(node.id))
    if (node.x != null && node.y != null) {
      fgRef.current?.centerAt(node.x, node.y, 600)
      fgRef.current?.zoom(4, 900)
    }
  }, [])

  const handleNodeRightClick = React.useCallback((node: FGNode) => {
    openNodeFile(node)
  }, [])

  const handleNodeHover = React.useCallback((node: FGNode | null) => {
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? "pointer" : "grab"
    }
  }, [])

  React.useEffect(() => {
    didInitialFitRef.current = false
  }, [fgData])

  React.useEffect(() => {
    if (!activeFilePath) return

    const match = graphData.nodes.find((node) => node.id === activeFilePath)
    if (!match) return

    setSelectedNodeId(activeFilePath)

    const timeout = window.setTimeout(() => {
      if (match.x == null || match.y == null) return
      fgRef.current?.centerAt(match.x, match.y, 500)
      fgRef.current?.zoom(3, 700)
    }, 220)

    return () => window.clearTimeout(timeout)
  }, [activeFilePath, graphData.nodes])

  const deferredCenterForce = React.useDeferredValue(controls.centerForce)
  const deferredLinkDistance = React.useDeferredValue(controls.linkDistance)
  const deferredLinkForce = React.useDeferredValue(controls.linkForce)
  const deferredRepelForce = React.useDeferredValue(controls.repelForce)

  React.useEffect(() => {
    const fg = fgRef.current
    if (!fg || dimensions.width === 0 || dimensions.height === 0) return

    fg.d3Force("center", null)
    fg.d3Force("x", forceX(0).strength(deferredCenterForce))
    fg.d3Force("y", forceY(0).strength(deferredCenterForce))

    const chargeForce = fg.d3Force("charge") as
      | { strength?: (value: number) => unknown }
      | undefined
    const linkForce = fg.d3Force("link") as
      | {
          distance?: (value: number) => unknown
          strength?: (value: number) => unknown
        }
      | undefined

    chargeForce?.strength?.(-deferredRepelForce)
    linkForce?.distance?.(deferredLinkDistance)
    linkForce?.strength?.(deferredLinkForce)
    fg.d3ReheatSimulation()
  }, [
    dimensions.height,
    dimensions.width,
    deferredCenterForce,
    deferredLinkDistance,
    deferredLinkForce,
    deferredRepelForce,
  ])

  React.useEffect(() => {
    updateViewportBounds()
  }, [updateViewportBounds])

  const animateGraph = React.useCallback(() => {
    fgRef.current?.d3ReheatSimulation()
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
              cooldownTicks={Math.min(140, Math.max(70, Math.round(fgData.nodes.length * 0.65)))}
              cooldownTime={18000}
              d3AlphaDecay={0.032}
              d3AlphaMin={0.001}
              d3VelocityDecay={0.32}
              enableNodeDrag
              graphData={fgData}
              height={dimensions.height}
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkDirectionalArrowLength={controls.arrows ? 4 : 0}
              linkDirectionalArrowRelPos={1}
              nodeCanvasObject={renderNode}
              nodeCanvasObjectMode={nodeCanvasObjectModeAll}
              nodeLabel={(node) => node.label}
              nodePointerAreaPaint={paintPointerArea}
              nodeRelSize={6}
              nodeVal={nodeVal}
              onBackgroundClick={() => fitGraph(700)}
              onEngineStop={() => {
                cacheNodePositions(fgData.nodes)
                if (!didInitialFitRef.current && fgData.nodes.length > 0) {
                  didInitialFitRef.current = true
                  fgRef.current?.zoomToFit(700, 64)
                }
              }}
              onNodeClick={handleNodeClick}
              onNodeDragEnd={(node) => {
                if (typeof node.x === "number" && typeof node.y === "number") {
                  positionCacheRef.current.set(String(node.id), {
                    vx: node.vx,
                    vy: node.vy,
                    x: node.x,
                    y: node.y,
                  })
                }
                updateViewportBounds()
              }}
              onNodeHover={handleNodeHover}
              onNodeRightClick={handleNodeRightClick}
              onZoom={updateViewportBounds}
              warmupTicks={8}
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

        <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-3">
          {isIndexingActive && nodes.length > 0 ? (
            <div className="pointer-events-auto min-w-0 max-w-md rounded-xl border border-border/60 bg-background/88 px-3 py-2 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
                <span className="truncate">
                  {indexingState.currentFile
                    ? `Indexing ${indexingState.currentFile}`
                    : indexingState.phase === "saving"
                      ? "Finalizing wiki graph"
                      : "Indexing wiki graph"}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${indexingProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div />
          )}

          <GraphControlsCard
            controls={controls}
            onAnimate={animateGraph}
            onCenter={() => fitGraph(700)}
            onControlChange={setControls}
            onRefresh={() => requestWorkspaceWikiLinkRebuild(true)}
          />
        </div>
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
        <div className="ml-4 shrink-0 text-[11px] text-muted-foreground">
          Click to focus • Right click to open • Background to reset
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
                className="aspect-square animate-pulse rounded-full bg-primary/20"
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

function GraphControlsCard({
  controls,
  onAnimate,
  onCenter,
  onControlChange,
  onRefresh,
}: {
  controls: GraphControls
  onAnimate: () => void
  onCenter: () => void
  onControlChange: React.Dispatch<React.SetStateAction<GraphControls>>
  onRefresh: () => void
}) {
  const setValue = React.useCallback(
    (key: keyof GraphControls, value: GraphControls[keyof GraphControls]) => {
      onControlChange((current) => ({ ...current, [key]: value }))
    },
    [onControlChange]
  )

  return (
    <Card className="pointer-events-auto w-[320px] border border-border/60 bg-background/92 shadow-sm backdrop-blur">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle>Graph Controls</CardTitle>
        <CardDescription>Adjust display density and force layout behavior.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Accordion type="multiple" defaultValue={["display", "forces"]} className="border-0 rounded-none">
          <AccordionItem value="display" className="border-b border-border/50 bg-transparent">
            <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
              Display
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-foreground">Arrows</span>
                  <Switch
                    checked={controls.arrows}
                    onCheckedChange={(checked) => setValue("arrows", checked)}
                  />
                </div>
                <GraphSliderField
                  label="Text fade threshold"
                  max={2}
                  min={0}
                  step={0.05}
                  value={controls.labelZoomThreshold}
                  onValueChange={(value) => setValue("labelZoomThreshold", value)}
                />
                <GraphSliderField
                  label="Node size"
                  max={1.8}
                  min={0.6}
                  step={0.05}
                  value={controls.nodeSizeScale}
                  onValueChange={(value) => setValue("nodeSizeScale", value)}
                />
                <GraphSliderField
                  label="Link thickness"
                  max={2}
                  min={0.5}
                  step={0.05}
                  value={controls.linkThicknessScale}
                  onValueChange={(value) => setValue("linkThicknessScale", value)}
                />
                <Button type="button" className="w-full" onClick={onAnimate}>
                  Animate
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="forces" className="bg-transparent">
            <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
              Forces
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-5">
                <GraphSliderField
                  label="Centre force"
                  max={1}
                  min={0}
                  step={0.02}
                  value={controls.centerForce}
                  onValueChange={(value) => setValue("centerForce", value)}
                />
                <GraphSliderField
                  label="Repel force"
                  max={400}
                  min={20}
                  step={5}
                  value={controls.repelForce}
                  onValueChange={(value) => setValue("repelForce", value)}
                />
                <GraphSliderField
                  label="Link force"
                  max={1.5}
                  min={0}
                  step={0.02}
                  value={controls.linkForce}
                  onValueChange={(value) => setValue("linkForce", value)}
                />
                <GraphSliderField
                  label="Link distance"
                  max={220}
                  min={30}
                  step={5}
                  value={controls.linkDistance}
                  onValueChange={(value) => setValue("linkDistance", value)}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t border-border/50 pt-3">
        <Button type="button" size="sm" variant="ghost" onClick={onCenter}>
          <LocateFixedIcon className="size-4" />
          <span className="ml-1">Center</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRefresh}>
          <RefreshCwIcon className="size-4" />
          <span className="ml-1">Refresh</span>
        </Button>
      </CardFooter>
    </Card>
  )
}

function GraphSliderField({
  label,
  max,
  min,
  onValueChange,
  step,
  value,
}: {
  label: string
  max: number
  min: number
  onValueChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{formatControlValue(value)}</span>
      </div>
      <Slider
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={(next) => {
          const nextValue = next[0]
          if (typeof nextValue === "number") {
            onValueChange(nextValue)
          }
        }}
      />
    </div>
  )
}

function formatControlValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
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

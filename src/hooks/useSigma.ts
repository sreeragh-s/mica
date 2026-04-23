import { useCallback, useEffect, useRef, useState } from "react"

import EdgeCurveProgram from "@sigma/edge-curve"
import Graph from "graphology"
import forceAtlas2 from "graphology-layout-forceatlas2"
import FA2Layout from "graphology-layout-forceatlas2/worker"
import noverlap from "graphology-layout-noverlap"
import Sigma from "sigma"

import type {
  SigmaEdgeAttributes,
  SigmaNodeAttributes,
} from "@/lib/wiki-graph-adapter"

type UseSigmaOptions = {
  highlightedNodeIds?: Set<string>
  onNodeClick?: (nodeId: string) => void
  onStageClick?: () => void
  theme?: {
    accent: string
    background: string
    border: string
    edge: string
    fontFamily: string
    foreground: string
    mutedForeground: string
    node: string
  }
}

type UseSigmaReturn = {
  containerRef: React.RefObject<HTMLDivElement | null>
  focusNode: (nodeId: string) => void
  isLayoutRunning: boolean
  resetZoom: () => void
  selectedNode: string | null
  setGraph: (graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>) => void
  startLayout: () => void
  stopLayout: () => void
  zoomIn: () => void
  zoomOut: () => void
}

const NOVERLAP_SETTINGS = {
  expansion: 1.18,
  margin: 18,
  maxIterations: 80,
  ratio: 1.6,
}

const hexToRgb = (hex: string): { b: number; g: number; r: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        b: Number.parseInt(result[3], 16),
        g: Number.parseInt(result[2], 16),
        r: Number.parseInt(result[1], 16),
      }
    : { b: 100, g: 100, r: 100 }
}

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((channel) => {
      const value = Math.max(0, Math.min(255, Math.round(channel))).toString(16)
      return value.length === 1 ? `0${value}` : value
    })
    .join("")}`

const dimColor = (hex: string, amount: number) => {
  const rgb = hexToRgb(hex)
  const darkBg = { b: 28, g: 18, r: 18 }

  return rgbToHex(
    darkBg.r + (rgb.r - darkBg.r) * amount,
    darkBg.g + (rgb.g - darkBg.g) * amount,
    darkBg.b + (rgb.b - darkBg.b) * amount
  )
}

const brightenColor = (hex: string, factor: number) => {
  const rgb = hexToRgb(hex)

  return rgbToHex(
    rgb.r + ((255 - rgb.r) * (factor - 1)) / factor,
    rgb.g + ((255 - rgb.g) * (factor - 1)) / factor,
    rgb.b + ((255 - rgb.b) * (factor - 1)) / factor
  )
}

const getFA2Settings = (nodeCount: number) => {
  const isSmall = nodeCount < 500
  const isMedium = nodeCount >= 500 && nodeCount < 2000
  const isLarge = nodeCount >= 2000 && nodeCount < 10000

  return {
    adjustSizes: true,
    barnesHutOptimize: nodeCount > 200,
    barnesHutTheta: isLarge ? 0.8 : 0.6,
    edgeWeightInfluence: 1,
    gravity: isSmall ? 0.18 : isMedium ? 0.12 : isLarge ? 0.08 : 0.05,
    linLogMode: true,
    outboundAttractionDistribution: true,
    scalingRatio: isSmall ? 28 : isMedium ? 48 : isLarge ? 72 : 110,
    slowDown: isSmall ? 1.4 : isMedium ? 2.2 : isLarge ? 3.5 : 5,
    strongGravityMode: false,
  }
}

const getLayoutDuration = (nodeCount: number) => {
  if (nodeCount > 10000) return 45000
  if (nodeCount > 5000) return 35000
  if (nodeCount > 2000) return 30000
  if (nodeCount > 1000) return 30000
  if (nodeCount > 500) return 25000
  return 20000
}

export function useSigma(options: UseSigmaOptions = {}): UseSigmaReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma<SigmaNodeAttributes, SigmaEdgeAttributes> | null>(null)
  const graphRef = useRef<Graph<SigmaNodeAttributes, SigmaEdgeAttributes> | null>(null)
  const layoutRef = useRef<FA2Layout | null>(null)
  const layoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedNodeRef = useRef<string | null>(null)
  const highlightedRef = useRef<Set<string>>(new Set())
  const callbacksRef = useRef<{
    onNodeClick?: (nodeId: string) => void
    onStageClick?: () => void
  }>({})
  const themeRef = useRef(options.theme)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isLayoutRunning, setIsLayoutRunning] = useState(false)

  useEffect(() => {
    highlightedRef.current = options.highlightedNodeIds ?? new Set()
    sigmaRef.current?.refresh()
  }, [options.highlightedNodeIds])

  useEffect(() => {
    callbacksRef.current = {
      onNodeClick: options.onNodeClick,
      onStageClick: options.onStageClick,
    }
  }, [options.onNodeClick, options.onStageClick])

  useEffect(() => {
    themeRef.current = options.theme
    if (sigmaRef.current && options.theme) {
      sigmaRef.current.setSetting("defaultEdgeColor", options.theme.edge)
      sigmaRef.current.setSetting("defaultNodeColor", options.theme.node)
      sigmaRef.current.setSetting("labelColor", { color: options.theme.foreground })
      sigmaRef.current.setSetting("labelFont", options.theme.fontFamily || "inherit")
    }
    sigmaRef.current?.refresh()
  }, [options.theme])

  const runLayout = useCallback((graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>) => {
    if (graph.order === 0) {
      return
    }

    if (layoutRef.current) {
      layoutRef.current.kill()
      layoutRef.current = null
    }

    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current)
      layoutTimeoutRef.current = null
    }

    const settings = {
      ...forceAtlas2.inferSettings(graph),
      ...getFA2Settings(graph.order),
    }

    const layout = new FA2Layout(graph, { settings })
    layoutRef.current = layout
    layout.start()
    setIsLayoutRunning(true)

    layoutTimeoutRef.current = setTimeout(() => {
      if (!layoutRef.current) {
        return
      }

      layoutRef.current.stop()
      layoutRef.current = null
      noverlap.assign(graph, NOVERLAP_SETTINGS)
      sigmaRef.current?.refresh()
      setIsLayoutRunning(false)
    }, getLayoutDuration(graph.order))
  }, [])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>()
    graphRef.current = graph

    const sigma = new Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>(
      graph,
      containerRef.current,
      {
      allowInvalidContainer: true,
      defaultDrawNodeHover: (context, data, settings) => {
        if (!data.label) return

        const fontSize = settings.labelSize || 11
        const fontFamily = settings.labelFont || themeRef.current?.fontFamily || "inherit"
        const fontWeight = settings.labelWeight || "500"

        context.font = `${fontWeight} ${fontSize}px ${fontFamily}`
        const textWidth = context.measureText(data.label).width
        const nodeSize = data.size || 8
        const x = data.x
        const y = data.y - nodeSize - 10
        const paddingX = 8
        const paddingY = 5
        const height = fontSize + paddingY * 2
        const width = textWidth + paddingX * 2

        context.fillStyle = themeRef.current?.background || "#12121c"
        context.beginPath()
        context.roundRect(x - width / 2, y - height / 2, width, height, 4)
        context.fill()

        context.strokeStyle = data.color || themeRef.current?.node || "#60a5fa"
        context.lineWidth = 2
        context.stroke()

        context.fillStyle = themeRef.current?.foreground || "#f5f5f7"
        context.textAlign = "center"
        context.textBaseline = "middle"
        context.fillText(data.label, x, y)

        context.beginPath()
        context.arc(data.x, data.y, nodeSize + 4, 0, Math.PI * 2)
        context.strokeStyle = data.color || themeRef.current?.node || "#60a5fa"
        context.lineWidth = 2
        context.globalAlpha = 0.5
        context.stroke()
        context.globalAlpha = 1
      },
      defaultEdgeColor: themeRef.current?.edge || "#2a2a3a",
      defaultEdgeType: "curved",
      defaultNodeColor: themeRef.current?.node || "#60a5fa",
      edgeProgramClasses: {
        curved: EdgeCurveProgram as never,
      },
      edgeReducer: (edge, data) => {
        const result = { ...data }
        const currentSelected = selectedNodeRef.current
        const highlighted = highlightedRef.current
        const hasHighlights = highlighted.size > 0

        if (currentSelected) {
          const graphInstance = graphRef.current
          if (graphInstance) {
            const [source, target] = graphInstance.extremities(edge)
            const isConnected = source === currentSelected || target === currentSelected

            if (isConnected) {
              result.color =
                themeRef.current?.accent ||
                themeRef.current?.node ||
                brightenColor(data.color, 1.5)
              result.size = Math.max(2.2, (data.size || 1) * 2.8)
              result.zIndex = 2
            } else {
              result.color =
                themeRef.current?.edge ||
                themeRef.current?.mutedForeground ||
                dimColor(data.color, 0.12)
              result.size = 0.18
              result.zIndex = 0
            }
          }

          return result
        }

        if (hasHighlights) {
          const graphInstance = graphRef.current
          if (graphInstance) {
            const [source, target] = graphInstance.extremities(edge)
            const active = highlighted.has(source) || highlighted.has(target)

            if (active) {
              result.color =
                themeRef.current?.accent ||
                themeRef.current?.node ||
                brightenColor(data.color, 1.4)
              result.size = Math.max(1.8, (data.size || 1) * 2.2)
              result.zIndex = 1
            } else {
              result.color =
                themeRef.current?.edge ||
                themeRef.current?.mutedForeground ||
                dimColor(data.color, 0.1)
              result.size = 0.14
              result.zIndex = 0
            }
          }
        }

        return result
      },
      hideEdgesOnMove: true,
      labelColor: { color: themeRef.current?.foreground || "#e4e4ed" },
      labelDensity: 0.1,
      labelFont: themeRef.current?.fontFamily || "inherit",
      labelGridCellSize: 70,
      labelRenderedSizeThreshold: 6,
      labelSize: 12,
      labelWeight: "500",
      maxCameraRatio: 50,
      minCameraRatio: 0.002,
      nodeReducer: (node, data) => {
        const result = { ...data }
        const currentSelected = selectedNodeRef.current
        const highlighted = highlightedRef.current
        const hasHighlights = highlighted.size > 0

        if (currentSelected) {
          const graphInstance = graphRef.current
          if (graphInstance) {
            const isSelected = node === currentSelected
            const isNeighbor =
              graphInstance.hasEdge(node, currentSelected) ||
              graphInstance.hasEdge(currentSelected, node)

            if (isSelected) {
              result.color = themeRef.current?.node || data.color
              result.size = (data.size || 8) * 1.8
              result.zIndex = 3
            } else if (isNeighbor) {
              result.color = themeRef.current?.node || data.color
              result.size = (data.size || 8) * 1.2
              result.zIndex = 1
            } else {
              result.color = themeRef.current?.mutedForeground || dimColor(data.color, 0.2)
              result.size = (data.size || 8) * 0.7
              result.zIndex = 0
            }
          }

          return result
        }

        if (hasHighlights) {
          if (highlighted.has(node)) {
            result.color = themeRef.current?.node || brightenColor(data.color, 1.25)
            result.size = (data.size || 8) * 1.45
            result.zIndex = 2
          } else {
            result.color = themeRef.current?.node || data.color
            result.size = data.size || 8
            result.zIndex = 0
          }
        }

        return result
      },
      renderLabels: true,
      zIndex: true,
      }
    )

    sigmaRef.current = sigma

    sigma.on("clickNode", ({ node }) => {
      selectedNodeRef.current = node
      setSelectedNode(node)
      callbacksRef.current.onNodeClick?.(node)
      sigma.refresh()
    })

    sigma.on("clickStage", () => {
      selectedNodeRef.current = null
      setSelectedNode(null)
      callbacksRef.current.onStageClick?.()
      sigma.refresh()
    })

    sigma.on("enterNode", () => {
      if (containerRef.current) {
        containerRef.current.style.cursor = "pointer"
      }
    })

    sigma.on("leaveNode", () => {
      if (containerRef.current) {
        containerRef.current.style.cursor = "grab"
      }
    })

    if (containerRef.current) {
      containerRef.current.style.cursor = "grab"
      resizeObserverRef.current = new ResizeObserver(() => {
        sigmaRef.current?.refresh()
      })
      resizeObserverRef.current.observe(containerRef.current)
    }

    return () => {
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current)
      }

      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      layoutRef.current?.kill()
      sigma.kill()
      sigmaRef.current = null
      graphRef.current = null
    }
  }, [runLayout])

  const setGraph = useCallback(
    (nextGraph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>) => {
      const sigma = sigmaRef.current
      if (!sigma) {
        return
      }

      if (layoutRef.current) {
        layoutRef.current.kill()
        layoutRef.current = null
      }

      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current)
        layoutTimeoutRef.current = null
      }

      graphRef.current = nextGraph
      sigma.setGraph(nextGraph)
      selectedNodeRef.current = null
      setSelectedNode(null)
      runLayout(nextGraph)
      sigma.getCamera().animatedReset({ duration: 500 })
    },
    [runLayout]
  )

  const focusNode = useCallback((nodeId: string) => {
    const sigma = sigmaRef.current
    const graph = graphRef.current

    if (!sigma || !graph || !graph.hasNode(nodeId)) {
      return
    }

    selectedNodeRef.current = nodeId
    setSelectedNode(nodeId)

    const node = graph.getNodeAttributes(nodeId)
    sigma.getCamera().animate({ ratio: 0.15, x: node.x, y: node.y }, { duration: 400 })
    sigma.refresh()
  }, [])

  const zoomIn = useCallback(() => {
    sigmaRef.current?.getCamera().animatedZoom({ duration: 200 })
  }, [])

  const zoomOut = useCallback(() => {
    sigmaRef.current?.getCamera().animatedUnzoom({ duration: 200 })
  }, [])

  const resetZoom = useCallback(() => {
    selectedNodeRef.current = null
    setSelectedNode(null)
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 })
    sigmaRef.current?.refresh()
  }, [])

  const startLayout = useCallback(() => {
    if (graphRef.current) {
      runLayout(graphRef.current)
    }
  }, [runLayout])

  const stopLayout = useCallback(() => {
    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current)
      layoutTimeoutRef.current = null
    }

    if (layoutRef.current && graphRef.current) {
      layoutRef.current.stop()
      layoutRef.current = null
      noverlap.assign(graphRef.current, NOVERLAP_SETTINGS)
      sigmaRef.current?.refresh()
      setIsLayoutRunning(false)
    }
  }, [])

  return {
    containerRef,
    focusNode,
    isLayoutRunning,
    resetZoom,
    selectedNode,
    setGraph,
    startLayout,
    stopLayout,
    zoomIn,
    zoomOut,
  }
}

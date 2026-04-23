import Graph from "graphology"

import type { WikiLinkGraphEdge, WikiLinkGraphNode } from "@/lib/wikilink-utils"

export interface SigmaNodeAttributes {
  x: number
  y: number
  size: number
  color: string
  label: string
  path: string | null
  hidden?: boolean
  zIndex?: number
}

export interface SigmaEdgeAttributes {
  size: number
  color: string
  relationType: "wikilink"
  type?: string
  curvature?: number
  zIndex?: number
}

export type WikiGraphTheme = {
  activeEdge: string
  activeNode: string
  danglingEdge: string
  edge: string
  node: string
}

function getNodeColor(
  _node: WikiLinkGraphNode,
  _activeFilePath: string | null,
  theme: WikiGraphTheme
) {
  return theme.node
}

function getNodeSize(node: WikiLinkGraphNode, activeFilePath: string | null) {
  const baseSize = node.isDangling ? 5.75 : 7.25
  const degreeBoost = Math.min(node.degree, 10) * 0.55
  const activeBoost = node.path && node.path === activeFilePath ? 2.5 : 0

  return baseSize + degreeBoost + activeBoost
}

export function wikiGraphToGraphology(
  nodes: WikiLinkGraphNode[],
  edges: WikiLinkGraphEdge[],
  activeFilePath: string | null,
  theme: WikiGraphTheme
) {
  const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>()
  const radius = Math.max(220, Math.sqrt(Math.max(nodes.length, 1)) * 68)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  nodes.forEach((node, index) => {
    const angle = index * goldenAngle
    const radialScale = radius * Math.sqrt((index + 1) / Math.max(nodes.length, 1))
    const jitter = 28

    graph.addNode(node.id, {
      color: getNodeColor(node, activeFilePath, theme),
      label: node.title,
      path: node.path,
      size: getNodeSize(node, activeFilePath),
      x: radialScale * Math.cos(angle) + (Math.random() - 0.5) * jitter,
      y: radialScale * Math.sin(angle) + (Math.random() - 0.5) * jitter,
      zIndex: node.path && node.path === activeFilePath ? 2 : 1,
    })
  })

  edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      return
    }

    graph.addEdgeWithKey(edge.id || `edge-${index}`, edge.source, edge.target, {
      color: edge.isDangling ? theme.danglingEdge : theme.edge,
      curvature: index % 2 === 0 ? 0.12 : -0.12,
      relationType: "wikilink",
      size: edge.isDangling ? 0.45 : Math.max(0.3, Math.min(edge.count * 0.45, 1.1)),
      type: "curved",
      zIndex: 0,
    })
  })

  return graph
}

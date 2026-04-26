import type { WikiLinkGraphEdge, WikiLinkGraphNode } from "@/lib/wikilink-utils"

export type WikiGraphTheme = {
  activeEdge: string
  activeNode: string
  background: string
  border: string
  danglingEdge: string
  danglingNode: string
  edge: string
  fontFamily: string
  foreground: string
  mutedForeground: string
  node: string
}

export interface ForceGraphNode {
  id: string
  label: string
  path: string | null
  degree: number
  isDangling: boolean
  size: number
  x?: number
  y?: number
  fx?: number
  fy?: number
  vx?: number
  vy?: number
}

export interface ForceGraphLink {
  id: string
  source: string
  target: string
  count: number
  isDangling: boolean
  width: number
}

export interface ForceGraphData {
  nodes: ForceGraphNode[]
  links: ForceGraphLink[]
  neighborsByNode: Map<string, Set<string>>
  linksByNode: Map<string, Set<string>>
}

function getNodeSize(node: WikiLinkGraphNode) {
  const baseSize = node.isDangling ? 10 : 13
  const degreeBoost = Math.min(node.degree, 15) * 0.9

  return baseSize + degreeBoost
}

export function buildForceGraphData(
  nodes: WikiLinkGraphNode[],
  edges: WikiLinkGraphEdge[]
): ForceGraphData {
  const neighborsByNode = new Map<string, Set<string>>()
  const linksByNode = new Map<string, Set<string>>()
  const validIds = new Set(nodes.map((node) => node.id))

  const graphNodes: ForceGraphNode[] = nodes.map((node) => ({
    degree: node.degree,
    id: node.id,
    isDangling: node.isDangling,
    label: node.title,
    path: node.path,
    size: getNodeSize(node),
  }))

  const graphLinks: ForceGraphLink[] = []

  edges.forEach((edge, index) => {
    if (!validIds.has(edge.source) || !validIds.has(edge.target)) {
      return
    }

    const linkId = edge.id || `edge-${index}`
    graphLinks.push({
      count: edge.count,
      id: linkId,
      isDangling: edge.isDangling,
      source: edge.source,
      target: edge.target,
      width: edge.isDangling ? 0.6 : Math.max(0.6, Math.min(edge.count * 0.6, 2.2)),
    })

    if (!neighborsByNode.has(edge.source)) {
      neighborsByNode.set(edge.source, new Set())
    }
    if (!neighborsByNode.has(edge.target)) {
      neighborsByNode.set(edge.target, new Set())
    }
    neighborsByNode.get(edge.source)!.add(edge.target)
    neighborsByNode.get(edge.target)!.add(edge.source)

    if (!linksByNode.has(edge.source)) {
      linksByNode.set(edge.source, new Set())
    }
    if (!linksByNode.has(edge.target)) {
      linksByNode.set(edge.target, new Set())
    }
    linksByNode.get(edge.source)!.add(linkId)
    linksByNode.get(edge.target)!.add(linkId)
  })

  return {
    links: graphLinks,
    linksByNode,
    neighborsByNode,
    nodes: graphNodes,
  }
}

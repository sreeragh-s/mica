import type { WorkspaceLinkMentionIndex } from '@/lib/notes/cache/notes-cache-types'

export type Mode = 'efficiency' | 'medium' | 'high'

export type ModeConfig = {
  seedCount: number
  expandedNodeCap: number
  finalContextCount: number
}

export type ExpandedGraphNode = {
  note: string
  weight: number
  hops: 1 | 2
}

export type CandidateSource = 'connected' | 'global_fallback' | 'mention'

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  efficiency: {
    seedCount: 1,
    expandedNodeCap: 3,
    finalContextCount: 3
  },
  medium: {
    seedCount: 3,
    expandedNodeCap: 6,
    finalContextCount: 6
  },
  high: {
    seedCount: 5,
    expandedNodeCap: 12,
    finalContextCount: 10
  }
}

const HIGH_COMPLEXITY_PATTERNS = [
  /\bcompare\b/i,
  /\bsummarize\b/i,
  /\brelate\b/i,
  /\bacross\b/i,
  /\bsynthesize\b/i,
  /how does .+ connect to/i
]

const FACTUAL_QUERY_PATTERNS = [
  /^(what|when|where|who|which|list)\b/i,
  /^(is|are|was|were|do|does|did|can|could|should)\b/i
]

export function classifyQueryComplexity(query: string): Mode {
  const trimmed = query.trim()
  if (!trimmed) return 'efficiency'

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  if (wordCount > 15 || HIGH_COMPLEXITY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'high'
  }

  if (wordCount <= 8 && FACTUAL_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'efficiency'
  }

  return 'medium'
}

export function getModeConfig(mode: Mode): ModeConfig {
  return MODE_CONFIG[mode]
}

function collectNeighborPaths(
  notePath: string,
  linkMentionIndex: WorkspaceLinkMentionIndex | null | undefined
): string[] {
  if (!linkMentionIndex) return []

  const neighbors = new Set<string>()
  for (const mention of linkMentionIndex.outgoingBySource.get(notePath) ?? []) {
    if (mention.target !== notePath) neighbors.add(mention.target)
  }
  for (const mention of linkMentionIndex.backlinksByTarget.get(notePath) ?? []) {
    if (mention.source !== notePath) neighbors.add(mention.source)
  }
  return Array.from(neighbors)
}

export function expandSeedConnections(
  seedNoteIds: string[],
  linkMentionIndex: WorkspaceLinkMentionIndex | null | undefined,
  cap: number
): ExpandedGraphNode[] {
  if (!linkMentionIndex || seedNoteIds.length === 0 || cap <= 0) return []

  const validPaths = linkMentionIndex.validPaths
  const seeds = new Set(seedNoteIds)
  const bestByNote = new Map<string, ExpandedGraphNode>()
  const discoveryOrder = new Map<string, number>()
  let nextOrder = 0

  const addCandidate = (note: string, hops: 1 | 2, weight: number): void => {
    if (!validPaths.has(note) || seeds.has(note)) return
    const existing = bestByNote.get(note)
    if (!existing || weight > existing.weight || (weight === existing.weight && hops < existing.hops)) {
      bestByNote.set(note, { note, weight, hops })
    }
    if (!discoveryOrder.has(note)) {
      discoveryOrder.set(note, nextOrder++)
    }
  }

  for (const seed of seedNoteIds) {
    const oneHop = collectNeighborPaths(seed, linkMentionIndex)
    for (const neighbor of oneHop) {
      addCandidate(neighbor, 1, 1)
    }
    for (const neighbor of oneHop) {
      const twoHop = collectNeighborPaths(neighbor, linkMentionIndex)
      for (const candidate of twoHop) {
        addCandidate(candidate, 2, 0.6)
      }
    }
  }

  return Array.from(bestByNote.values())
    .sort((left, right) => {
      if (right.weight !== left.weight) return right.weight - left.weight
      if (left.hops !== right.hops) return left.hops - right.hops
      return (discoveryOrder.get(left.note) ?? 0) - (discoveryOrder.get(right.note) ?? 0)
    })
    .slice(0, cap)
}

export function shouldBlendGlobalFallback(topScore: number | null | undefined): boolean {
  return topScore == null || topScore < 0.65
}


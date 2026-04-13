'use client'

import type { CSSProperties, JSX } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'

import type { SavedNote, Folder } from '@/lib/notes/notes-storage'
import type { WorkspaceLinkMentionIndex } from '@/lib/notes/graph-types'
import { cn } from '@/lib/utils'

const FOLDER_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#14b8a6', '#eab308', '#f97316', '#ec4899']

const DEFAULT_NODE_COLOR = '#6b7280'

type SimNode = d3.SimulationNodeDatum & {
  id: string
  title: string
  kind: NonNullable<SavedNote['kind']>
  folder: string
  backlinks: number
}

// ─── Force settings (live-updated without rebuilding simulation) ──────────────

type ForceSettings = {
  /** Gravity pulling all nodes toward center (0 = none, 1 = strong) */
  gravity: number
  /** Repulsion between nodes (positive = repel) */
  repulsion: number
  /** Ideal distance between linked nodes */
  linkDistance: number
  /** How strongly links enforce distance (0–1) */
  linkStrength: number
  /** Minimum distance between any two nodes */
  collide: number
}

// ─── Display settings (visual only, don't touch forces) ──────────────────────

type DisplaySettings = {
  nodeSize: number
  showLabels: boolean
  colorByFolder: boolean
  showArrows: boolean
}

const DEFAULT_FORCES: ForceSettings = {
  gravity: 0.12,
  repulsion: 280,
  linkDistance: 80,
  linkStrength: 0.5,
  collide: 28
}

const DEFAULT_DISPLAY: DisplaySettings = {
  nodeSize: 1,
  showLabels: true,
  colorByFolder: true,
  showArrows: false
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type NotesGraphViewProps = {
  notes: SavedNote[]
  folders: Folder[]
  linkMentionIndex?: WorkspaceLinkMentionIndex | null
  isMacNotelab: boolean
  macTitlebarStyles: { noDrag: CSSProperties }
  onSelectNote: (notePath: string) => void
  localNotePath?: string | null
  embedded?: boolean
}

// ─── Tiny slider row ─────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-2">
      <div className="text-muted-foreground mb-0.5 flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="text-foreground tabular-nums">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-current"
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export const NotesGraphView = memo(function NotesGraphView(
  {
    notes,
    folders,
    linkMentionIndex,
    isMacNotelab,
    macTitlebarStyles,
    onSelectNote,
    localNotePath,
    embedded
  }: NotesGraphViewProps
): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  // search / local mode
  const [search, setSearch] = useState('')
  const [localMode, setLocalMode] = useState(!!localNotePath)
  const [localCenter] = useState<string | null>(localNotePath ?? null)

  // panel state
  const [showPanel, setShowPanel] = useState(false)
  const [forces, setForces] = useState<ForceSettings>(DEFAULT_FORCES)
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY)

  // refs so D3 tick closures always read latest values without rebuilding
  const forcesRef = useRef(forces)
  forcesRef.current = forces
  const displayRef = useRef(display)
  displayRef.current = display
  const hoveredRef = useRef<string | null>(null)

  // stable refs to live D3 objects
  const simRef = useRef<d3.Simulation<SimNode, d3.SimulationLinkDatum<SimNode>> | null>(null)
  const gLinksRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const gNodesRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const nodeGRef = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null)
  const linkSelRef = useRef<d3.Selection<
    SVGLineElement,
    d3.SimulationLinkDatum<SimNode>,
    SVGGElement,
    unknown
  > | null>(null)
  const labelSelRef = useRef<d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null>(
    null
  )
  const markerRef = useRef<d3.Selection<SVGDefsElement, unknown, null, undefined> | null>(null)
  const neighbourOfRef = useRef<Map<string, Set<string>>>(new Map())
  const onSelectRef = useRef(onSelectNote)
  onSelectRef.current = onSelectNote

  const fullGraph = useMemo(() => {
    const idSet = new Set(notes.map((note) => note.path))
    const linkKeys = new Set<string>()
    const links: Array<{ source: string; target: string }> = []

    if (linkMentionIndex) {
      for (const [source, mentions] of linkMentionIndex.outgoingBySource.entries()) {
        if (!idSet.has(source)) continue
        for (const mention of mentions) {
          const target = mention.target
          if (!idSet.has(target) || target === source) continue
          const key = `${source}\0${target}`
          if (linkKeys.has(key)) continue
          linkKeys.add(key)
          links.push({ source, target })
        }
      }
    }

    const titleCount = new Map<string, number>()
    for (const note of notes) {
      const normalizedTitle = (note.title?.trim() || 'Untitled').toLowerCase()
      titleCount.set(normalizedTitle, (titleCount.get(normalizedTitle) ?? 0) + 1)
    }

    const nodes = notes.map((note) => {
      const baseTitle = (note.title?.trim() || 'Untitled').slice(0, 80)
      const isDuplicate = (titleCount.get(baseTitle.toLowerCase()) ?? 0) > 1
      let displayTitle = baseTitle
      if (isDuplicate) {
        const pathParts = note.path.replace(/\\/g, '/').split('/')
        const parentDir = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : note.folder
        const qualifier = parentDir && parentDir !== 'default' ? parentDir : note.folder
        if (qualifier && qualifier !== 'default') {
          displayTitle = `${baseTitle} (${qualifier})`
        }
      }
      return {
        id: note.path,
        title: displayTitle.slice(0, 80),
        kind: note.kind ?? 'note',
        folder: note.folder
      }
    })

    return { nodes, links }
  }, [linkMentionIndex, notes])

  const backlinkCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of fullGraph.links) {
      map.set(l.target, (map.get(l.target) ?? 0) + 1)
    }
    return map
  }, [fullGraph])

  const graph = useMemo(() => {
    let { nodes, links } = fullGraph

    if (localMode && localCenter) {
      const neighbourIds = new Set<string>([localCenter])
      for (const l of links) {
        if (l.source === localCenter) neighbourIds.add(l.target)
        if (l.target === localCenter) neighbourIds.add(l.source)
      }
      nodes = nodes.filter((n) => neighbourIds.has(n.id))
      links = links.filter((l) => neighbourIds.has(l.source) && neighbourIds.has(l.target))
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchIds = new Set(
        nodes
          .filter((n) => n.title.toLowerCase().includes(q) || n.folder.toLowerCase().includes(q))
          .map((n) => n.id)
      )
      nodes = nodes.filter((n) => matchIds.has(n.id))
      links = links.filter((l) => matchIds.has(l.source) && matchIds.has(l.target))
    }

    return { nodes, links }
  }, [fullGraph, localMode, localCenter, search])

  const resize = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setSize({
      w: Math.max(320, Math.floor(r.width)),
      h: Math.max(280, Math.floor(r.height))
    })
  }, [])

  useEffect(() => {
    resize()
    const ro = new ResizeObserver(() => resize())
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', resize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [resize])

  const folderColorIndexById = useMemo(() => {
    return new Map(folders.map((folder, idx) => [folder.folder, idx]))
  }, [folders])

  const folderColorFn = useCallback(
    (folder: string): string => {
      if (!displayRef.current.colorByFolder) return DEFAULT_NODE_COLOR
      const i = folderColorIndexById.get(folder) ?? 0
      return FOLDER_COLORS[(i >= 0 ? i : 0) % FOLDER_COLORS.length]
    },
    [folderColorIndexById]
  )

  const nodeRadius = useCallback(
    (d: SimNode): number => {
      const base = d.kind === 'drawing' ? 13 : 8
      const blBonus = d.backlinks > 0 ? Math.log2(d.backlinks + 1) * 2.5 : 0
      return (base + blBonus) * displayRef.current.nodeSize
    },
    [] // only reads ref, stable
  )

  // ── Build / rebuild simulation when graph topology or canvas size changes ──
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl || size.w < 16 || size.h < 16 || graph.nodes.length === 0) return

    const f = forcesRef.current

    const simNodes: SimNode[] = graph.nodes.map((n) => ({
      ...n,
      backlinks: backlinkCount.get(n.id) ?? 0
    }))

    const simLinks: d3.SimulationLinkDatum<SimNode>[] = graph.links.map((l) => ({
      source: l.source,
      target: l.target
    }))

    // neighbour index
    const neighbourOf = new Map<string, Set<string>>()
    for (const l of graph.links) {
      if (!neighbourOf.has(l.source)) neighbourOf.set(l.source, new Set())
      if (!neighbourOf.has(l.target)) neighbourOf.set(l.target, new Set())
      neighbourOf.get(l.source)!.add(l.target)
      neighbourOf.get(l.target)!.add(l.source)
    }
    neighbourOfRef.current = neighbourOf

    // ── SVG scaffold ──
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()

    // arrow marker
    const defs = svg.append('defs')
    markerRef.current = defs
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('class', 'fill-muted-foreground')
      .style('fill', 'currentColor')
      .style('opacity', 0.5)

    const gRoot = svg.append('g')
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => gRoot.attr('transform', event.transform))
    svg.call(zoom)
    svg.on('click', () => {
      hoveredRef.current = null
      applyHighlight()
    })

    const gLinks = gRoot.append('g')
    const gNodes = gRoot.append('g')
    gLinksRef.current = gLinks
    gNodesRef.current = gNodes

    // ── links ──
    const linkSel = gLinks
      .selectAll<SVGLineElement, d3.SimulationLinkDatum<SimNode>>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1.2)
      .attr('class', 'text-muted-foreground')
      .attr('marker-end', displayRef.current.showArrows ? 'url(#arrow)' : null)
    linkSelRef.current = linkSel

    // ── nodes ──
    const nodeG = gNodes
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        onSelectRef.current(d.id)
      })
      .on('mouseenter', (_e, d) => {
        hoveredRef.current = d.id
        applyHighlight()
      })
      .on('mouseleave', () => {
        hoveredRef.current = null
        applyHighlight()
      })
    nodeGRef.current = nodeG

    nodeG
      .append('circle')
      .attr('r', nodeRadius)
      .attr('fill', (d) => (d.kind === 'drawing' ? 'none' : folderColorFn(d.folder)))
      .attr('stroke', (d) => folderColorFn(d.folder))
      .attr('stroke-width', (d) => (d.kind === 'drawing' ? 2 : 0))
      .attr('stroke-dasharray', (d) => (d.kind === 'drawing' ? '4 3' : 'none'))

    const labelSel = nodeG
      .append('text')
      .text((d) => (d.title.length > 24 ? `${d.title.slice(0, 22)}…` : d.title))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => nodeRadius(d) + 13)
      .attr('font-size', 10)
      .attr('class', 'fill-foreground pointer-events-none select-none')
      .style('display', () => (displayRef.current.showLabels ? null : 'none'))
    labelSelRef.current = labelSel

    // ── drag ──
    nodeG.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }) as unknown as (sel: typeof nodeG) => typeof nodeG
    )

    // ── simulation ──
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, d3.SimulationLinkDatum<SimNode>>(simLinks)
          .id((d) => d.id)
          .distance(f.linkDistance)
          .strength(f.linkStrength)
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-f.repulsion))
      .force('x', d3.forceX(0).strength(f.gravity))
      .force('y', d3.forceY(0).strength(f.gravity))
      .force(
        'collide',
        d3.forceCollide<SimNode>().radius((d) => nodeRadius(d as SimNode) + f.collide)
      )
      .alphaDecay(0.025)

    simRef.current = simulation

    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d) => {
          const s = d.source as SimNode
          const t = d.target as SimNode
          const dx = (t.x ?? 0) - (s.x ?? 0)
          const dy = (t.y ?? 0) - (s.y ?? 0)
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          return (s.x ?? 0) + (dx / dist) * nodeRadius(s)
        })
        .attr('y1', (d) => {
          const s = d.source as SimNode
          const t = d.target as SimNode
          const dx = (t.x ?? 0) - (s.x ?? 0)
          const dy = (t.y ?? 0) - (s.y ?? 0)
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          return (s.y ?? 0) + (dy / dist) * nodeRadius(s)
        })
        .attr('x2', (d) => {
          const s = d.source as SimNode
          const t = d.target as SimNode
          const dx = (t.x ?? 0) - (s.x ?? 0)
          const dy = (t.y ?? 0) - (s.y ?? 0)
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const r = nodeRadius(t)
          const offset = displayRef.current.showArrows ? r + 6 : r
          return (t.x ?? 0) - (dx / dist) * offset
        })
        .attr('y2', (d) => {
          const s = d.source as SimNode
          const t = d.target as SimNode
          const dx = (t.x ?? 0) - (s.x ?? 0)
          const dy = (t.y ?? 0) - (s.y ?? 0)
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const r = nodeRadius(t)
          const offset = displayRef.current.showArrows ? r + 6 : r
          return (t.y ?? 0) - (dy / dist) * offset
        })

      nodeG.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    svg.call(zoom.transform, d3.zoomIdentity.translate(size.w / 2, size.h / 2))

    return () => {
      simulation.stop()
      simRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, size.w, size.h, folderColorFn, nodeRadius, backlinkCount])

  // ── Live-update forces without rebuilding ──
  useEffect(() => {
    const sim = simRef.current
    if (!sim) return

    const linkForce = sim.force<d3.ForceLink<SimNode, d3.SimulationLinkDatum<SimNode>>>('link')
    if (linkForce) {
      linkForce.distance(forces.linkDistance).strength(forces.linkStrength)
    }
    const chargeForce = sim.force<d3.ForceManyBody<SimNode>>('charge')
    if (chargeForce) chargeForce.strength(-forces.repulsion)

    const xForce = sim.force<d3.ForceX<SimNode>>('x')
    if (xForce) xForce.strength(forces.gravity)
    const yForce = sim.force<d3.ForceY<SimNode>>('y')
    if (yForce) yForce.strength(forces.gravity)

    const collideForce = sim.force<d3.ForceCollide<SimNode>>('collide')
    if (collideForce) collideForce.radius((d) => nodeRadius(d as SimNode) + forces.collide)

    sim.alpha(0.4).restart()
  }, [forces, nodeRadius])

  // ── Live-update visual display ──
  useEffect(() => {
    const nodeG = nodeGRef.current
    const labelSel = labelSelRef.current
    const linkSel = linkSelRef.current
    if (!nodeG || !labelSel || !linkSel) return

    nodeG
      .select<SVGCircleElement>('circle')
      .attr('fill', (d) => (d.kind === 'drawing' ? 'none' : folderColorFn(d.folder)))
      .attr('stroke', (d) => folderColorFn(d.folder))

    if (display.showLabels) {
      labelSel.style('display', null)
    } else {
      labelSel.style('display', 'none')
    }

    if (display.showArrows) {
      linkSel.attr('marker-end', 'url(#arrow)')
    } else {
      linkSel.attr('marker-end', null)
    }
  }, [display, folderColorFn])

  // ── Highlight logic ──
  function applyHighlight() {
    const nodeG = nodeGRef.current
    const linkSel = linkSelRef.current
    if (!nodeG || !linkSel) return
    const hov = hoveredRef.current
    if (!hov) {
      nodeG.style('opacity', 1)
      linkSel.attr('stroke-opacity', 0.3)
      return
    }
    const connected = neighbourOfRef.current.get(hov) ?? new Set<string>()
    nodeG.style('opacity', (d) => (d.id === hov || connected.has(d.id) ? 1 : 0.1))
    linkSel.attr('stroke-opacity', (l) => {
      const s = (l.source as SimNode).id
      const t = (l.target as SimNode).id
      return s === hov || t === hov ? 0.75 : 0.04
    })
  }

  const edgeCount = graph.links.length

  return (
    <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── header ── */}
      {embedded ? null : (
        <div
          className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3"
          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-foreground truncate text-sm font-semibold">
              {localMode && localCenter
                ? `Local graph · ${notes.find((n) => n.path === localCenter)?.title ?? '…'}`
                : 'Note graph'}
            </h2>
          </div>
          <p className="text-muted-foreground shrink-0 text-xs">
            {graph.nodes.length} notes · {edgeCount} link{edgeCount === 1 ? '' : 's'}
          </p>
          <button
            className={cn(
              'text-muted-foreground hover:text-foreground shrink-0 rounded p-1 transition-colors',
              showPanel && 'text-foreground bg-muted'
            )}
            onClick={() => setShowPanel((p) => !p)}
            title="Forces & display"
            aria-label="Forces & display"
          >
            {/* sliders icon */}
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM2 4a3.001 3.001 0 0 1 5.83-.5H14a.5.5 0 0 1 0 1H7.83A3.001 3.001 0 0 1 2 4ZM10 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM1 8.5a.5.5 0 0 1 .5-.5h5.67a3.001 3.001 0 0 1 5.66 0H14.5a.5.5 0 0 1 0 1h-1.67a3.001 3.001 0 0 1-5.66 0H1.5a.5.5 0 0 1-.5-.5ZM5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM2 12a3.001 3.001 0 0 1 5.83-.5H14.5a.5.5 0 0 1 0 1H7.83A3.001 3.001 0 0 1 2 12Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1">
        {/* ── search + local toggle ── */}
        <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-2">
          <input
            type="search"
            placeholder="Filter notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-background/90 border-border text-foreground placeholder:text-muted-foreground h-7 min-w-0 flex-1 rounded-md border px-2.5 text-xs shadow backdrop-blur-sm focus:outline-none"
          />
          {localCenter && (
            <button
              onClick={() => setLocalMode((m) => !m)}
              className={cn(
                'border-border bg-background/90 text-muted-foreground hover:text-foreground shrink-0 rounded-md border px-2 py-1 text-xs shadow backdrop-blur-sm transition-colors',
                localMode && 'bg-primary/10 text-primary border-primary/30'
              )}
            >
              {localMode ? 'Local' : 'Global'}
            </button>
          )}
        </div>

        {/* ── floating controls panel ── */}
        {showPanel && (
          <div className="bg-background/96 border-border absolute bottom-8 right-2 z-20 w-60 overflow-hidden rounded-xl border shadow-xl backdrop-blur-md">
            {/* Forces section */}
            <div className="border-border border-b px-3 pt-3 pb-2">
              <p className="text-foreground mb-2 text-[11px] font-semibold uppercase tracking-wider opacity-60">
                Forces
              </p>

              <SliderRow
                label="Gravity"
                value={forces.gravity}
                min={0}
                max={0.5}
                step={0.01}
                display={forces.gravity.toFixed(2)}
                onChange={(v) => setForces((f) => ({ ...f, gravity: v }))}
              />
              <SliderRow
                label="Repulsion"
                value={forces.repulsion}
                min={0}
                max={800}
                step={10}
                onChange={(v) => setForces((f) => ({ ...f, repulsion: v }))}
              />
              <SliderRow
                label="Link distance"
                value={forces.linkDistance}
                min={20}
                max={300}
                step={5}
                onChange={(v) => setForces((f) => ({ ...f, linkDistance: v }))}
              />
              <SliderRow
                label="Link strength"
                value={forces.linkStrength}
                min={0}
                max={1}
                step={0.05}
                display={forces.linkStrength.toFixed(2)}
                onChange={(v) => setForces((f) => ({ ...f, linkStrength: v }))}
              />
              <SliderRow
                label="Collision"
                value={forces.collide}
                min={0}
                max={80}
                step={2}
                onChange={(v) => setForces((f) => ({ ...f, collide: v }))}
              />
            </div>

            {/* Display section */}
            <div className="px-3 pt-2 pb-3">
              <p className="text-foreground mb-2 text-[11px] font-semibold uppercase tracking-wider opacity-60">
                Display
              </p>

              <SliderRow
                label="Node size"
                value={display.nodeSize}
                min={0.4}
                max={3}
                step={0.1}
                display={display.nodeSize.toFixed(1)}
                onChange={(v) => setDisplay((d) => ({ ...d, nodeSize: v }))}
              />

              <div className="mt-1 flex flex-col gap-1.5">
                {(
                  [
                    ['showLabels', 'Show labels'],
                    ['showArrows', 'Show arrows'],
                    ['colorByFolder', 'Color by folder']
                  ] as [keyof DisplaySettings, string][]
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={display[key] as boolean}
                      onChange={(e) => setDisplay((d) => ({ ...d, [key]: e.target.checked }))}
                      className="accent-current"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* folder legend */}
              {display.colorByFolder && folders.length > 0 && (
                <div className="border-border mt-3 border-t pt-2">
                  <div className="flex flex-col gap-1">
                    {folders.map((f, i) => (
                      <div key={f.folder} className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2 shrink-0 rounded-full"
                          style={{ background: FOLDER_COLORS[i % FOLDER_COLORS.length] }}
                        />
                        <span className="text-muted-foreground truncate text-xs">
                          {f.folder || '(root)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* reset */}
              <button
                className="text-muted-foreground hover:text-foreground mt-3 text-xs underline-offset-2 hover:underline"
                onClick={() => {
                  setForces(DEFAULT_FORCES)
                  setDisplay(DEFAULT_DISPLAY)
                }}
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* ── canvas ── */}
        <div
          ref={wrapRef}
          className={cn(
            'min-h-0 min-w-0 flex-1',
            graph.nodes.length === 0 && 'flex items-center justify-center'
          )}
        >
          {graph.nodes.length === 0 ? (
            <p className="text-muted-foreground px-6 text-center text-sm">
              {search.trim() ? `No notes matching "${search}".` : 'No notes to show yet.'}
            </p>
          ) : (
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              className="bg-muted/20 block max-h-full max-w-full touch-none"
              role="img"
              aria-label="Note link graph"
            />
          )}
        </div>
      </div>
    </div>
  )
})

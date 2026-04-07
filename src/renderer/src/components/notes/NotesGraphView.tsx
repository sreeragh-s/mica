"use client"

import type { CSSProperties, JSX } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as d3 from "d3"

import { buildNoteLinkGraph } from "@/lib/note-link-graph"
import type { SavedNote, WorkspaceFolder } from "@/lib/notes-storage"
import { cn } from "@/lib/utils"

const FOLDER_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#0ea5e9",
  "#14b8a6",
  "#eab308",
  "#f97316",
  "#ec4899",
]

type SimNode = d3.SimulationNodeDatum & {
  id: string
  title: string
  kind: NonNullable<SavedNote["kind"]>
  folderId: string
}

export type NotesGraphViewProps = {
  notes: SavedNote[]
  folders: WorkspaceFolder[]
  isMacNotelab: boolean
  macTitlebarStyles: { noDrag: CSSProperties }
  onSelectNote: (noteId: string) => void
  /** When true, only the canvas is rendered (use with an external split header). */
  embedded?: boolean
}

export function NotesGraphView({
  notes,
  folders,
  isMacNotelab,
  macTitlebarStyles,
  onSelectNote,
  embedded = false,
}: NotesGraphViewProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  const graph = useMemo(() => buildNoteLinkGraph(notes), [notes])

  const onSelectRef = useRef(onSelectNote)
  onSelectRef.current = onSelectNote

  const resize = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setSize({
      w: Math.max(320, Math.floor(r.width)),
      h: Math.max(280, Math.floor(r.height)),
    })
  }, [])

  useEffect(() => {
    resize()
    const ro = new ResizeObserver(() => resize())
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener("resize", resize)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", resize)
    }
  }, [resize])

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl || size.w < 16 || size.h < 16 || notes.length === 0) return

    const { nodes: rawNodes, links: rawLinks } = graph
    const simNodes: SimNode[] = rawNodes.map((n) => ({ ...n }))
    const simLinks: d3.SimulationLinkDatum<SimNode>[] = rawLinks.map((l) => ({
      source: l.source,
      target: l.target,
    }))

    const svg = d3.select(svgEl)
    svg.selectAll("*").remove()

    const gRoot = svg.append("g")
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 3])
      .on("zoom", (event) => {
        gRoot.attr("transform", event.transform)
      })
    svg.call(zoom)

    const gLinks = gRoot
      .append("g")
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.35)
      .attr("class", "text-muted-foreground")

    const gNodes = gRoot.append("g")

    const folderColor = (folderId: string): string => {
      const i = folders.findIndex((f) => f.id === folderId)
      return FOLDER_COLORS[(i >= 0 ? i : 0) % FOLDER_COLORS.length]
    }

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, d3.SimulationLinkDatum<SimNode>>(simLinks)
          .id((d) => d.id)
          .distance(96)
          .strength(0.65)
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(-420))
      .force("center", d3.forceCenter(0, 0))
      .force("collide", d3.forceCollide<SimNode>().radius(36))

    const linkSel = gLinks
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke-width", 1.5)

    const nodeG = gNodes
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation()
        onSelectRef.current(d.id)
      })

    nodeG
      .append("circle")
      .attr("r", (d) => (d.kind === "drawing" ? 14 : 12))
      .attr("fill", (d) =>
        d.kind === "drawing" ? "none" : folderColor(d.folderId)
      )
      .attr("stroke", (d) => folderColor(d.folderId))
      .attr("stroke-width", (d) => (d.kind === "drawing" ? 2.5 : 0))
      .attr("stroke-dasharray", (d) => (d.kind === "drawing" ? "4 3" : "none"))

    nodeG
      .append("text")
      .text((d) => d.title)
      .attr("text-anchor", "middle")
      .attr("dy", 28)
      .attr("font-size", 11)
      .attr("class", "fill-foreground pointer-events-none select-none")
      .each(function truncate() {
        const self = d3.select(this)
        let t = self.text() || ""
        if (t.length > 28) t = `${t.slice(0, 26)}…`
        self.text(t)
      })

    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.35).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on("drag", (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    nodeG.call(
      drag as unknown as (
        sel: typeof nodeG
      ) => typeof nodeG
    )

    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0)

      nodeG.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    const initial = d3.zoomIdentity.translate(size.w / 2, size.h / 2)
    svg.call(zoom.transform, initial)

    return () => {
      simulation.stop()
    }
  }, [graph, folders, size.w, size.h])

  const edgeCount = graph.links.length

  return (
    <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      {embedded ? null : (
        <div
          className="border-border flex h-10 shrink-0 items-center px-3"
          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
        >
          <div className="min-w-0">
            <h2 className="text-foreground truncate text-sm font-semibold">
              Note graph
            </h2>
            <p className="text-muted-foreground truncate text-xs">
              {notes.length} notes · {edgeCount} link
              {edgeCount === 1 ? "" : "s"} · drag nodes · scroll to zoom · pick a
              note in the sidebar to leave
            </p>
          </div>
        </div>
      )}
      <div
        ref={wrapRef}
        className={cn("min-h-0 min-w-0 flex-1", notes.length === 0 && "flex items-center justify-center")}
      >
        {notes.length === 0 ? (
          <p className="text-muted-foreground px-6 text-center text-sm">
            No notes to show yet.
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
  )
}

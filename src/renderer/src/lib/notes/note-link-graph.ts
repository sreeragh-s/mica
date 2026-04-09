import type { SerializedEditorState } from "lexical"

import type { SavedNote } from "@/lib/notes/notes-storage"
import { parseInternalNoteIdFromHref } from "@/lib/notes/internal-note-link"

/** Walk Lexical JSON and collect target note ids from internal note links. */
export function collectInternalNoteLinkTargets(
  serialized: SerializedEditorState | null | undefined
): string[] {
  const out = new Set<string>()

  function walk(node: unknown): void {
    if (node === null || node === undefined) return
    if (typeof node !== "object") return
    const o = node as Record<string, unknown>
    if (o.type === "link" && typeof o.url === "string") {
      const id = parseInternalNoteIdFromHref(o.url)
      if (id) out.add(id)
    }
    if (Array.isArray(o.children)) {
      for (const c of o.children) walk(c)
    }
  }

  walk(serialized?.root)
  return [...out]
}

export type NoteGraphNode = {
  id: string
  title: string
  kind: NonNullable<SavedNote["kind"]>
  folderId: string
}

export type NoteGraphLink = {
  source: string
  target: string
}

/** Nodes = all notes; edges = directed link from note A to B when A links to B. */
export function buildNoteLinkGraph(notes: SavedNote[]): {
  nodes: NoteGraphNode[]
  links: NoteGraphLink[]
} {
  const idSet = new Set(notes.map((n) => n.id))
  const linkKeys = new Set<string>()
  const links: NoteGraphLink[] = []

  for (const note of notes) {
    if (note.kind === "drawing") continue
    const targets = collectInternalNoteLinkTargets(note.content)
    for (const t of targets) {
      if (!idSet.has(t)) continue
      if (t === note.id) continue
      const key = `${note.id}\0${t}`
      if (linkKeys.has(key)) continue
      linkKeys.add(key)
      links.push({ source: note.id, target: t })
    }
  }

  const nodes: NoteGraphNode[] = notes.map((n) => ({
    id: n.id,
    title: (n.title?.trim() || "Untitled").slice(0, 80),
    kind: n.kind ?? "note",
    folderId: n.folderId,
  }))

  return { nodes, links }
}

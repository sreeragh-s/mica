import type { SavedNote, Folder } from "@/lib/notes/notes-storage"

import { serializedStateToMarkdown } from "@/lib/editor/lexical-to-markdown"
import { DEFAULT_WORKSPACE_ID } from "@/lib/notes/notes-storage"
import {
  buildMarkdownNoteBody,
  buildMarkdownWithOptionalFrontmatter,
} from '@shared/notes/note-markdown'

function slugifyNoteFilenameSegment(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return s || "note"
}

/** Slug for a workspace directory segment (ASCII, filesystem-safe). */
function slugifyWorkspaceDirSegment(displayName: string): string {
  const s = displayName
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return s || "workspace"
}

/**
 * Folder name under `data/<id>/` (relative to ~/.notelab).
 * Uses a readable slug from the display name plus a short unique suffix (not a bare UUID).
 */
export function newFolderPath(displayName: string): string {
  return slugifyWorkspaceDirSegment(displayName)
}

export function buildNoteMarkdownDocument(note: SavedNote): string {
  if (note.kind === "drawing") {
    const scene = note.excalidrawScene?.trim() ?? ""
    return scene ? `${scene}\n` : "{}\n"
  }
  const bodyMarkdown = buildMarkdownNoteBody(serializedStateToMarkdown(note.content))
  const properties = {
    ...(note.properties ?? {}),
    ...(note.coverImageSrc ? { cover_image: note.coverImageSrc } : {}),
    ...(note.titleEmoji && note.titleEmoji.trim()
      ? { title_emoji: note.titleEmoji.trim() }
      : {}),
  }
  if (!note.coverImageSrc) delete properties.cover_image
  if (!note.titleEmoji?.trim()) delete properties.title_emoji
  return buildMarkdownWithOptionalFrontmatter({
    hasFrontmatterBlock: Boolean(note.hasFrontmatterBlock),
    properties,
    body: bodyMarkdown,
  })
}

export function noteMarkdownRelativePath(_folder: string, note: SavedNote): string {
  return note.path
}

export function buildNoteFileBaseName(title: string, kind: SavedNote["kind"]): string {
  const normalized = slugifyNoteFilenameSegment(title || (kind === "drawing" ? "New drawing" : "Untitled"))
  return kind === "drawing" ? `${normalized}.excalidraw` : `${normalized}.md`
}

export function buildFolderPath(folderName: string): string {
  return slugifyWorkspaceDirSegment(folderName)
}

export function buildUniqueNoteRelativePath(
  folder: string,
  title: string,
  kind: SavedNote["kind"],
  takenRelativePaths: Iterable<string>,
  currentRelativePath?: string
): string {
  const taken = new Set(Array.from(takenRelativePaths, (value) => value.replace(/\\/g, "/")))
  const current = currentRelativePath?.replace(/\\/g, "/")
  if (current) {
    taken.delete(current)
  }
  const baseName = buildNoteFileBaseName(title, kind)
  const suffix = kind === "drawing" ? ".excalidraw" : ".md"
  const bare = baseName.endsWith(suffix) ? baseName.slice(0, -suffix.length) : baseName
  let counter = 1
  while (true) {
    const candidateBase = counter === 1 ? baseName : `${bare}-${counter}.md`
    const candidate =
      folder === DEFAULT_WORKSPACE_ID ? candidateBase : `${folder}/${candidateBase}`
    if (!taken.has(candidate)) {
      return candidate
    }
    counter += 1
  }
}

/**
 * Markdown files to write relative to the notes root (cwd).
 * Root notes go directly in cwd; workspace notes go in cwd/<workspaceId>/.
 */
export function buildMarkdownSyncPayload(
  folder: Folder,
  notes: SavedNote[]
): { relativePath: string; content: string }[] {
  const files: { relativePath: string; content: string }[] = []

  for (const n of notes) {
    files.push({
      relativePath: noteMarkdownRelativePath(folder.folder, n),
      content: buildNoteMarkdownDocument(n),
    })
  }

  return files
}

import type { SavedNote, Folder } from "@/lib/notes-storage"

import { serializedStateToMarkdown } from "@/lib/lexical-to-markdown"
import { DEFAULT_WORKSPACE_ID } from "@/lib/notes-storage"

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
export function newFolderId(displayName: string): string {
  return slugifyWorkspaceDirSegment(displayName)
}

export function buildNoteMarkdownDocument(note: SavedNote): string {
  const title = note.title.trim()
  if (note.kind === "drawing") {
    const scene = note.excalidrawScene?.trim() ?? ""
    const front = `---
updated_at: "${new Date(note.updatedAt).toISOString()}"
title: ${JSON.stringify(title)}
notelab_kind: drawing
---

`
    return front + (scene ? `${scene}\n` : "{}\n")
  }
  const body = serializedStateToMarkdown(note.content)
  const coverLine = note.coverImageSrc
    ? `cover_image: ${JSON.stringify(note.coverImageSrc)}\n`
    : ""
  const emojiLine =
    note.titleEmoji && note.titleEmoji.trim()
      ? `title_emoji: ${JSON.stringify(note.titleEmoji.trim())}\n`
      : ""
  const front = `---
updated_at: "${new Date(note.updatedAt).toISOString()}"
title: ${JSON.stringify(title)}
${coverLine}${emojiLine}---

`
  return front + (body.trim() ? `${body}\n` : "_Empty note._\n")
}

export function noteMarkdownRelativePath(_folderId: string, note: SavedNote): string {
  return note.id
}

export function buildNoteFileBaseName(title: string, kind: SavedNote["kind"]): string {
  const normalized = slugifyNoteFilenameSegment(title || (kind === "drawing" ? "New drawing" : "Untitled"))
  return `${normalized}.md`
}

export function buildFolderPath(folderName: string): string {
  return slugifyWorkspaceDirSegment(folderName)
}

export function buildUniqueNoteRelativePath(
  folderId: string,
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
  const suffix = ".md"
  const bare = baseName.endsWith(suffix) ? baseName.slice(0, -suffix.length) : baseName
  let counter = 1
  while (true) {
    const candidateBase = counter === 1 ? baseName : `${bare}-${counter}.md`
    const candidate =
      folderId === DEFAULT_WORKSPACE_ID ? candidateBase : `${folderId}/${candidateBase}`
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
      relativePath: noteMarkdownRelativePath(folder.id, n),
      content: buildNoteMarkdownDocument(n),
    })
  }

  return files
}

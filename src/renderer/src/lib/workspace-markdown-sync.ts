import type { SavedNote, WorkspaceFolder } from "@/lib/notes-storage"

import { serializedStateToMarkdown } from "@/lib/lexical-to-markdown"

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
export function newWorkspaceFolderId(displayName: string): string {
  const slug = slugifyWorkspaceDirSegment(displayName)
  const hex = crypto.randomUUID().replace(/-/g, "")
  return `${slug}--${hex.slice(0, 8)}`
}

export function buildNoteMarkdownDocument(note: SavedNote): string {
  const title = note.title.trim()
  if (note.kind === "drawing") {
    const scene = note.excalidrawScene?.trim() ?? ""
    const front = `---
notelab_note_id: "${note.id}"
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
notelab_note_id: "${note.id}"
updated_at: "${new Date(note.updatedAt).toISOString()}"
title: ${JSON.stringify(title)}
${coverLine}${emojiLine}---

`
  return front + (body.trim() ? `${body}\n` : "_Empty note._\n")
}

const DEFAULT_WORKSPACE_ID = 'default'

export function noteMarkdownRelativePath(folderId: string, note: SavedNote): string {
  const title = note.title.trim() || "Untitled"
  const fileBase = `${slugifyNoteFilenameSegment(title)}--${note.id}.md`
  if (folderId === DEFAULT_WORKSPACE_ID) {
    // Root notes live directly in the notes root (cwd)
    return fileBase
  }
  return `${folderId}/${fileBase}`
}

/**
 * Markdown files to write relative to the notes root (cwd).
 * Root notes go directly in cwd; workspace notes go in cwd/<workspaceId>/.
 */
export function buildMarkdownSyncPayload(
  folder: WorkspaceFolder,
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

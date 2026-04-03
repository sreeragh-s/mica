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
 * Folder name under `gitnotes/workspaces/<id>/`.
 * Uses a readable slug from the display name plus a short unique suffix (not a bare UUID).
 */
export function newWorkspaceFolderId(displayName: string): string {
  const slug = slugifyWorkspaceDirSegment(displayName)
  const hex = crypto.randomUUID().replace(/-/g, "")
  return `${slug}--${hex.slice(0, 8)}`
}

export function workspaceReadmeMarkdown(folderName: string): string {
  return `# ${folderName}

Synced from **GitNotes**. Each note is a Markdown file with YAML front matter in this folder.
`
}

export function buildNoteMarkdownDocument(note: SavedNote): string {
  const title = note.title.trim() || "New note"
  const body = serializedStateToMarkdown(note.content)
  const front = `---
gitnotes_note_id: "${note.id}"
updated_at: "${new Date(note.updatedAt).toISOString()}"
title: ${JSON.stringify(title)}
---

`
  return front + (body.trim() ? `${body}\n` : "_Empty note._\n")
}

export function noteMarkdownRelativePath(folderId: string, note: SavedNote): string {
  const title = note.title.trim() || "New note"
  const fileBase = `${slugifyNoteFilenameSegment(title)}--${note.id}.md`
  return `gitnotes/workspaces/${folderId}/${fileBase}`
}

/**
 * Markdown files to write under the repository root for one workspace.
 * Layout: `gitnotes/workspaces/<workspace-folder-id>/README.md` and `<slug>--<noteId>.md` files.
 * Workspace folder ids look like `my-workspace--a1b2c3d4` (name slug + unique suffix).
 */
export function buildMarkdownSyncPayload(
  folder: WorkspaceFolder,
  notes: SavedNote[]
): { relativePath: string; content: string }[] {
  const base = `gitnotes/workspaces/${folder.id}`
  const files: { relativePath: string; content: string }[] = []

  files.push({
    relativePath: `${base}/README.md`,
    content: workspaceReadmeMarkdown(folder.name),
  })

  for (const n of notes) {
    files.push({
      relativePath: noteMarkdownRelativePath(folder.id, n),
      content: buildNoteMarkdownDocument(n),
    })
  }

  return files
}

import type { SavedNote } from '@/lib/notes/notes-storage'

import { buildPropertyCatalogFromNotes } from '@/lib/notes/note-properties/property-catalog'

import {
  collectNoteLinkMentions,
  extractAliasStrings,
  extractTagStrings,
  notePlainTextForSearch,
  serializePropertiesForCache
} from './extract-note-cache-fields'
import {
  getNotesCacheDb,
  noteCacheRowId,
  type LinkMentionCacheRow,
  type NoteSearchCacheRow,
  wsTargetKey
} from './notes-cache-db'
import type {
  CachedLinkMention,
  NotesWorkspaceCacheSnapshot,
  WorkspaceLinkMentionIndex
} from './notes-cache-types'

function buildLinkIndex(notes: SavedNote[]): WorkspaceLinkMentionIndex {
  const validPaths = new Set(notes.map((n) => n.path))
  const backlinksByTarget = new Map<string, CachedLinkMention[]>()
  const outgoingBySource = new Map<string, CachedLinkMention[]>()

  for (const note of notes) {
    if (note.kind === 'drawing') continue
    for (const m of collectNoteLinkMentions(note)) {
      if (m.target === note.path) continue
      const row: CachedLinkMention = {
        source: note.path,
        target: m.target,
        contextText: m.contextText,
        linkText: m.linkText
      }
      const out = outgoingBySource.get(note.path) ?? []
      out.push(row)
      outgoingBySource.set(note.path, out)
      const inc = backlinksByTarget.get(m.target) ?? []
      inc.push(row)
      backlinksByTarget.set(m.target, inc)
    }
  }

  return { validPaths, backlinksByTarget, outgoingBySource }
}

/**
 * Replace all IndexedDB rows for `workspaceKey` with a full snapshot derived from `notes`.
 * Prunes paths that disappeared (deleted/renamed externally, or removed while the app was closed)
 * because we delete-then-rewrite the workspace partition on each run.
 */
export async function reindexNotesWorkspaceCache(
  workspaceKey: string,
  notes: SavedNote[]
): Promise<NotesWorkspaceCacheSnapshot> {
  const plainTextByPath = new Map<string, string>()
  const propertyCatalog = buildPropertyCatalogFromNotes(notes)
  const linkMentionIndex = buildLinkIndex(notes)

  const noteRows: NoteSearchCacheRow[] = []
  const mentionRows: LinkMentionCacheRow[] = []

  for (const note of notes) {
    const plain = notePlainTextForSearch(note)
    plainTextByPath.set(note.path, plain)
    const tags = extractTagStrings(note.properties)
    const aliases = extractAliasStrings(note.properties)
    noteRows.push({
      id: noteCacheRowId(workspaceKey, note.path),
      workspaceKey,
      notePath: note.path,
      folder: note.folder,
      title: note.title?.trim() || 'Untitled',
      kind: note.kind ?? 'note',
      plainText: plain,
      updatedAt: note.updatedAt,
      tagsJson: JSON.stringify(tags),
      aliasesJson: JSON.stringify(aliases),
      propertiesJson: serializePropertiesForCache(note)
    })

    if (note.kind === 'drawing') continue
    let mi = 0
    for (const m of collectNoteLinkMentions(note)) {
      mentionRows.push({
        id: `${workspaceKey}\u0000${note.path}\u0000${mi++}\u0000${m.target}`,
        workspaceKey,
        wsTarget: wsTargetKey(workspaceKey, m.target),
        source: note.path,
        target: m.target,
        contextText: m.contextText,
        linkText: m.linkText
      })
    }
  }

  const db = getNotesCacheDb()
  await db.transaction('rw', db.noteRows, db.linkMentions, async () => {
    await db.noteRows.where('workspaceKey').equals(workspaceKey).delete()
    await db.linkMentions.where('workspaceKey').equals(workspaceKey).delete()
    if (noteRows.length > 0) await db.noteRows.bulkPut(noteRows)
    if (mentionRows.length > 0) await db.linkMentions.bulkPut(mentionRows)
  })

  return {
    plainTextByPath,
    propertyCatalog,
    linkMentionIndex,
    indexedAt: Date.now()
  }
}

/** Drop every cached row for a workspace (e.g. before switching roots). */
export async function clearNotesWorkspaceCache(workspaceKey: string): Promise<void> {
  const db = getNotesCacheDb()
  await db.transaction('rw', db.noteRows, db.linkMentions, async () => {
    await db.noteRows.where('workspaceKey').equals(workspaceKey).delete()
    await db.linkMentions.where('workspaceKey').equals(workspaceKey).delete()
  })
}

export function resolveNotesWorkspaceCacheKey(dataRootPath: string | null): string | null {
  const t = dataRootPath?.trim()
  return t ? t : null
}

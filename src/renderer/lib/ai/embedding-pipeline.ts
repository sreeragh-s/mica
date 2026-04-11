/**
 * Embedding pipeline: normalize note text, then upsert a SQLite-backed document in the
 * current workspace-local index. The main process owns chunking, embedding, and retrieval.
 */

import { getApi } from '@/bridges/auth/auth-bridge'
import { createElectronLogger } from '@/lib/core/electron-log'
import { extractExcalidrawText } from '@/lib/ai/markdown-chunker'

const LOG = '[embedding-pipeline]'
const log = createElectronLogger(LOG)

type NoteKind = 'note' | 'drawing'

/** Compute SHA-256 hex hash of a string using the Web Crypto API. */
export async function computeContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function buildIndexableText(content: string, kind: NoteKind): string {
  if (kind === 'drawing') {
    return extractExcalidrawText(content)
      .map((chunk) => chunk.text.trim())
      .filter(Boolean)
      .join('\n\n')
  }
  return content.trim()
}

export type IndexNoteResult =
  | { ok: true; indexed: number; skipped: false }
  | { ok: true; indexed: 0; skipped: true; reason: 'content unchanged' | 'no indexable content' }
  | { ok: false; error: string }

/**
 * Full pipeline for a single note:
 * 1. Compute content hash.
 * 2. If hash matches stored hash, skip (content unchanged).
 * 3. Normalize the note content for indexing.
 * 4. If there is no indexable text, delete the stored document and skip.
 * 5. Ask the main process to upsert the SQLite vector document.
 */
export async function indexNote(opts: {
  workspacePath: string
  folder: string
  note: string
  title: string
  content: string
  kind: NoteKind
  storedHash?: string
}): Promise<IndexNoteResult> {
  const { workspacePath, folder, note, title, content, kind, storedHash } = opts
  const api = getApi()
  if (!api?.embeddings?.upsertNoteDocument || !api.embeddings.deleteNoteDocument) {
    log.error(`indexNote(${note}): embeddings API unavailable`)
    return { ok: false, error: 'Embeddings API unavailable' }
  }

  const contentHash = await computeContentHash(content)
  log.info(
    `indexNote(${note}): workspacePath=${workspacePath} folder=${folder} kind=${kind} title="${title.slice(0, 80)}" hash=${contentHash.slice(0, 8)}… storedHash=${storedHash?.slice(0, 8) ?? 'none'}`
  )

  // Skip if content hasn't changed.
  if (storedHash && storedHash === contentHash) {
    log.info(`indexNote(${note}): skipping because content is unchanged`)
    return { ok: true, indexed: 0, skipped: true, reason: 'content unchanged' }
  }

  const indexableText = buildIndexableText(content, kind)
  log.info(`indexNote(${note}): prepared indexable text chars=${indexableText.length}`)

  if (!indexableText) {
    log.info(`indexNote(${note}): no indexable content, deleting any previously indexed document`)
    await api.embeddings.deleteNoteDocument({ workspacePath, note })
    return { ok: true, indexed: 0, skipped: true, reason: 'no indexable content' }
  }

  const result = await api.embeddings.upsertNoteDocument({
    workspacePath,
    folder,
    note,
    title,
    kind,
    contentHash,
    text: indexableText,
    docType: kind === 'note' ? 'md' : 'txt'
  })

  if (!result.ok) {
    log.error(`indexNote(${note}): SQLite vector upsert failed`, result.error)
    return { ok: false, error: result.error }
  }

  log.info(
    `indexNote(${note}): stored ${result.indexed} chunk(s) in workspace-local SQLite vector index`
  )
  return { ok: true, indexed: result.indexed, skipped: false }
}

export type IndexingNoteStatus = {
  folder: string
  note: string
  title: string
  kind: NoteKind
  /** 'pending' = not indexed or changed. 'indexed' = up to date or no content. 'error' = last attempt failed. */
  state: 'pending' | 'indexed' | 'error' | 'indexing'
  error?: string
}

export type IndexingStatus = {
  notes: IndexingNoteStatus[]
  /** Total notes that need indexing. */
  pendingCount: number
  /** Total notes that are up to date. */
  indexedCount: number
  /** True while an indexing job is running. */
  running: boolean
}

/**
 * Build the indexing status for all notes by comparing stored hashes.
 *
 * Notes with no indexable text (empty notes, empty drawings) are always
 * marked 'indexed' — there is nothing to embed for them.
 */
export async function buildIndexingStatus(
  workspacePath: string,
  allNotes: { folder: string; note: string; title: string; content: string; kind: NoteKind }[]
): Promise<Omit<IndexingStatus, 'running'>> {
  const api = getApi()
  let storedHashes: Record<string, { contentHash: string; folder: string }> = {}

  if (api?.embeddings?.getIndexedHashes) {
    const r = await api.embeddings.getIndexedHashes({ workspacePath })
    if (r.ok) {
      storedHashes = r.hashes
      log.info(
        `buildIndexingStatus: workspacePath=${workspacePath} storedHashes=${Object.keys(storedHashes).length}`
      )
    } else {
      log.error('buildIndexingStatus: getIndexedHashes failed', r.error)
    }
  }

  const notes: IndexingNoteStatus[] = await Promise.all(
    allNotes.map(async (n) => {
      const indexableText = buildIndexableText(n.content, n.kind)
      if (!indexableText) {
        return {
          folder: n.folder,
          note: n.note,
          title: n.title,
          kind: n.kind,
          state: 'indexed' as const
        }
      }

      const stored = storedHashes[n.note]
      if (!stored) {
        return {
          folder: n.folder,
          note: n.note,
          title: n.title,
          kind: n.kind,
          state: 'pending' as const
        }
      }

      const currentHash = await computeContentHash(n.content)
      const state = stored.contentHash === currentHash ? ('indexed' as const) : ('pending' as const)
      if (state === 'pending') {
        log.info(
          `buildIndexingStatus: note=${n.note} hash mismatch stored=${stored.contentHash.slice(0, 8)}… current=${currentHash.slice(0, 8)}…`
        )
      }
      return { folder: n.folder, note: n.note, title: n.title, kind: n.kind, state }
    })
  )

  const pendingCount = notes.filter((n) => n.state === 'pending').length
  const indexedCount = notes.filter((n) => n.state === 'indexed').length
  log.info(
    `buildIndexingStatus: workspacePath=${workspacePath} indexed=${indexedCount} pending=${pendingCount} total=${notes.length}`
  )

  return { notes, pendingCount, indexedCount }
}

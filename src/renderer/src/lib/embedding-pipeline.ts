/**
 * Embedding pipeline: chunk → embed → store in LanceDB.
 *
 * Prefers local Ollama (`bge-m3`) when the bundled server is running and the model
 * is pulled; otherwise uses the cloud `/api/embeddings` (auth session).
 */

import {
  hasLocalEmbeddingModel,
  LOCAL_EMBEDDING_MODEL,
} from '@/components/ai/LocalModelSetupDialog'
import { getApi } from '@/lib/auth-bridge'
import { chunkMarkdown, extractExcalidrawText } from '@/lib/markdown-chunker'
import { serverFetchJson } from '@/lib/server-api'

/** Must match EMBEDDING_DIMENSION in server/src/embeddings.ts */
export const EMBEDDING_DIMENSION = 1024

/** Max chunks sent to server per API call (matches server MAX_TEXTS_PER_REQUEST). */
const BATCH_SIZE = 50

const LOG = '[embedding-pipeline]'

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

/**
 * Chunk note content according to note kind.
 * Returns plain text chunks ready for embedding.
 */
export function chunkNoteContent(
  content: string,
  kind: NoteKind
): string[] {
  if (!content.trim()) return []

  if (kind === 'drawing') {
    return extractExcalidrawText(content).map((c) => c.text)
  }

  return chunkMarkdown(content).map((c) => c.text)
}

/**
 * True when Notelab Ollama is up and `bge-m3` is available for indexing.
 */
async function shouldUseLocalEmbeddings(): Promise<boolean> {
  try {
    const ollama =
      typeof window !== 'undefined' ? window.api?.ollama : undefined
    if (!ollama?.getStatus || !ollama?.listModels || !ollama.embedBatch) return false
    const status = await ollama.getStatus()
    if (!status.ok || !status.running) return false
    const listed = await ollama.listModels()
    if (!listed.ok) return false
    return hasLocalEmbeddingModel(listed.models)
  } catch {
    return false
  }
}

/**
 * Embed an array of text strings via local Ollama or the server `/api/embeddings`.
 * Batches automatically if texts.length > BATCH_SIZE.
 */
async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return []

  const useLocal = await shouldUseLocalEmbeddings()
  if (useLocal) {
    const ollama = window.api?.ollama
    if (!ollama?.embedBatch) {
      console.error(LOG, 'embedTexts: local embedding unavailable')
      return null
    }
    const allEmbeddings: number[][] = []
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      console.info(LOG, `embedTexts (local Ollama): batch of ${batch.length} text(s)`)
      const result = await ollama.embedBatch({
        model: LOCAL_EMBEDDING_MODEL,
        inputs: batch,
      })
      if (!result.ok) {
        console.error(LOG, 'embedTexts: local embed failed:', result.error)
        return null
      }
      for (let j = 0; j < result.embeddings.length; j++) {
        if (result.embeddings[j].length !== EMBEDDING_DIMENSION) {
          console.error(
            LOG,
            `embedTexts: local vector dim ${result.embeddings[j].length}, expected ${EMBEDDING_DIMENSION}`
          )
          return null
        }
      }
      allEmbeddings.push(...result.embeddings)
    }
    console.info(LOG, `embedTexts: local OK — ${allEmbeddings.length} vector(s)`)
    return allEmbeddings
  }

  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    console.info(LOG, `embedTexts (server): batch of ${batch.length} text(s)`)
    const result = await serverFetchJson<{ embeddings: number[][] }>(
      '/api/embeddings',
      { method: 'POST', body: { texts: batch } }
    )
    if (!result.ok) {
      console.error(LOG, `embedTexts: server returned error (status ${result.status}):`, result.message)
      return null
    }
    console.info(LOG, `embedTexts: got ${result.data.embeddings.length} embeddings back`)
    allEmbeddings.push(...result.data.embeddings)
  }

  return allEmbeddings
}

export type IndexNoteResult =
  | { ok: true; indexed: number; skipped: false }
  | { ok: true; indexed: 0; skipped: true; reason: 'content unchanged' | 'no indexable content' }
  | { ok: false; error: string }

/**
 * Full pipeline for a single note:
 * 1. Compute content hash.
 * 2. If hash matches stored hash, skip (content unchanged).
 * 3. Chunk content.
 * 4. If no chunks (empty note), delete old embeddings and skip.
 * 5. Embed chunks (local Ollama if running, else server).
 * 6. Store in LanceDB with the hash.
 */
export async function indexNote(opts: {
  workspaceId: string
  noteId: string
  content: string
  kind: NoteKind
  storedHash?: string
}): Promise<IndexNoteResult> {
  const { workspaceId, noteId, content, kind, storedHash } = opts
  const api = getApi()
  if (!api?.embeddings) {
    console.error(LOG, `indexNote(${noteId}): Embeddings API unavailable`)
    return { ok: false, error: 'Embeddings API unavailable' }
  }

  const contentHash = await computeContentHash(content)
  console.info(LOG, `indexNote(${noteId}): hash=${contentHash.slice(0, 8)}… storedHash=${storedHash?.slice(0, 8) ?? 'none'}`)

  // Skip if content hasn't changed.
  if (storedHash && storedHash === contentHash) {
    console.info(LOG, `indexNote(${noteId}): skipping — content unchanged`)
    return { ok: true, indexed: 0, skipped: true, reason: 'content unchanged' }
  }

  const chunks = chunkNoteContent(content, kind)
  console.info(LOG, `indexNote(${noteId}): ${chunks.length} chunk(s) from kind=${kind}`)

  // If there are no indexable chunks (e.g. empty note), clean up and bail.
  if (chunks.length === 0) {
    console.info(LOG, `indexNote(${noteId}): no indexable content — deleting any old embeddings`)
    await api.embeddings.deleteNoteEmbeddings({ workspaceId, noteId })
    return { ok: true, indexed: 0, skipped: true, reason: 'no indexable content' }
  }

  const embeddings = await embedTexts(chunks)
  if (!embeddings) {
    return { ok: false, error: 'Failed to get embeddings (local Ollama or server)' }
  }

  if (embeddings.length !== chunks.length) {
    const msg = `Embedding count mismatch: got ${embeddings.length}, expected ${chunks.length}`
    console.error(LOG, `indexNote(${noteId}):`, msg)
    return { ok: false, error: msg }
  }

  const result = await api.embeddings.indexNoteEmbeddings({
    workspaceId,
    noteId,
    contentHash,
    chunks: chunks.map((text, i) => ({
      chunkIndex: i,
      text,
      vector: embeddings[i]
    }))
  })

  if (!result.ok) {
    console.error(LOG, `indexNote(${noteId}): LanceDB store failed:`, result.error)
    return { ok: false, error: result.error }
  }

  console.info(LOG, `indexNote(${noteId}): stored ${result.indexed} chunk(s) ✓`)
  return { ok: true, indexed: result.indexed, skipped: false }
}

export type IndexingNoteStatus = {
  workspaceId: string
  noteId: string
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
 * Notes with no indexable chunks (empty notes, empty drawings) are always
 * marked 'indexed' — there is nothing to embed for them.
 */
export async function buildIndexingStatus(
  allNotes: { workspaceId: string; noteId: string; title: string; content: string; kind: NoteKind }[]
): Promise<Omit<IndexingStatus, 'running'>> {
  const api = getApi()
  let storedHashes: Record<string, { contentHash: string; workspaceId: string }> = {}

  if (api?.embeddings?.getIndexedHashes) {
    const r = await api.embeddings.getIndexedHashes()
    if (r.ok) {
      storedHashes = r.hashes
      console.info(LOG, `buildIndexingStatus: ${Object.keys(storedHashes).length} notes have stored hashes`)
    } else {
      console.error(LOG, 'buildIndexingStatus: getIndexedHashes failed:', r.error)
    }
  }

  const notes: IndexingNoteStatus[] = await Promise.all(
    allNotes.map(async (n) => {
      // Notes with no indexable content are always considered indexed.
      const chunks = chunkNoteContent(n.content, n.kind)
      if (chunks.length === 0) {
        return { workspaceId: n.workspaceId, noteId: n.noteId, title: n.title, kind: n.kind, state: 'indexed' as const }
      }

      const stored = storedHashes[n.noteId]
      if (!stored) {
        return { workspaceId: n.workspaceId, noteId: n.noteId, title: n.title, kind: n.kind, state: 'pending' as const }
      }

      const currentHash = await computeContentHash(n.content)
      const state = stored.contentHash === currentHash ? 'indexed' as const : 'pending' as const
      if (state === 'pending') {
        console.info(LOG, `buildIndexingStatus: ${n.noteId} hash mismatch — stored=${stored.contentHash.slice(0, 8)}… current=${currentHash.slice(0, 8)}…`)
      }
      return { workspaceId: n.workspaceId, noteId: n.noteId, title: n.title, kind: n.kind, state }
    })
  )

  const pendingCount = notes.filter((n) => n.state === 'pending').length
  const indexedCount = notes.filter((n) => n.state === 'indexed').length
  console.info(LOG, `buildIndexingStatus: ${indexedCount} indexed, ${pendingCount} pending out of ${notes.length} total`)

  return { notes, pendingCount, indexedCount }
}

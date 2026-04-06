import { app, ipcMain } from 'electron'
import { join } from 'path'
import { connect, type Connection, type Table } from '@lancedb/lancedb'

/** Stored under userData (writable, survives updates). */
export const NOTE_EMBEDDINGS_TABLE = 'note_embeddings'

/** bge-m3 produces 1024-dimensional vectors. */
export const VECTOR_DIMENSION = 1024

let connectionPromise: Promise<Connection> | null = null

export function getLancedbDirectory(): string {
  return join(app.getPath('userData'), 'lancedb')
}

async function getConnection(): Promise<Connection> {
  if (!connectionPromise) {
    connectionPromise = connect(getLancedbDirectory())
  }
  return connectionPromise
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function toVector(value: number[] | Float32Array): Float32Array {
  return value instanceof Float32Array ? value : Float32Array.from(value)
}

/**
 * IPC uses structured clone. LanceDB `toArray()` rows may include Apache Arrow `Vector`
 * wrappers, Float32Array, BigInt, etc. — not all are cloneable. Produce plain JSON-like data.
 */
function valueToIpcPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'boolean' || t === 'string' || t === 'number') return value
  if (t === 'bigint') return value.toString()
  if (t === 'symbol' || t === 'function') return null
  if (value instanceof Date) return value.toISOString()
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as Iterable<number>)
  }
  if (Array.isArray(value)) {
    return value.map(valueToIpcPlain)
  }
  if (t === 'object') {
    const v = value as Record<string, unknown> & {
      toArray?: () => unknown
      toJSON?: () => unknown
      get?: (i: number) => unknown
      length?: number
    }
    // Apache Arrow Vector / similar columnar types
    if (typeof v.toArray === 'function') {
      try {
        return valueToIpcPlain(v.toArray())
      } catch {
        /* fall through */
      }
    }
    if (typeof v.toJSON === 'function') {
      try {
        return valueToIpcPlain(v.toJSON())
      } catch {
        /* fall through */
      }
    }
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v)) {
      out[k] = valueToIpcPlain(v[k])
    }
    return out
  }
  return String(value)
}

function serializeRowsForIpc(rows: unknown[]): Record<string, unknown>[] {
  // Arrow row objects expose a toArray() method that valueToIpcPlain would call,
  // returning a positional array instead of a keyed object. Bypass it by iterating
  // the row's own keys directly (same pattern used in getIndexedHashes above).
  const plain = rows.map((row) => {
    const r = row as Record<string, unknown>
    const obj: Record<string, unknown> = {}
    for (const k of Object.keys(r)) {
      obj[k] = valueToIpcPlain(r[k])
    }
    return obj
  })
  /** JSON round-trip guarantees a structured-cloneable plain object graph for IPC. */
  return JSON.parse(
    JSON.stringify(plain, (_key, v) => {
      if (typeof v === 'bigint') return v.toString()
      if (ArrayBuffer.isView(v)) {
        return Array.from(v as unknown as Iterable<number>)
      }
      return v
    })
  ) as Record<string, unknown>[]
}

export type EmbeddingChunkPayload = {
  /** Stable chunk id; defaults are composed in IPC from workspace + note + index. */
  id: string
  chunkIndex: number
  text: string
  vector: number[] | Float32Array
}

export type IndexNoteEmbeddingsPayload = {
  workspaceId: string
  noteId: string
  contentHash: string
  chunks: EmbeddingChunkPayload[]
}

/**
 * Opens or creates the note_embeddings table.
 * Drops and recreates if schema is outdated (missing content_hash).
 */
async function openOrCreateTable(): Promise<Table> {
  const conn = await getConnection()
  const names = await conn.tableNames()

  if (names.includes(NOTE_EMBEDDINGS_TABLE)) {
    // Check if schema has content_hash; if not, drop and recreate.
    try {
      const tbl = await conn.openTable(NOTE_EMBEDDINGS_TABLE)
      const schema = await tbl.schema()
      const hasHash = schema.fields.some((f) => f.name === 'content_hash')
      if (hasHash) return tbl
      // Schema is stale — drop and fall through to creation.
      await conn.dropTable(NOTE_EMBEDDINGS_TABLE)
    } catch {
      // If anything goes wrong inspecting the table, recreate it.
      try { await conn.dropTable(NOTE_EMBEDDINGS_TABLE) } catch { /* ignore */ }
    }
  }

  const zeros = new Float32Array(VECTOR_DIMENSION)
  await conn.createTable(
    NOTE_EMBEDDINGS_TABLE,
    [
      {
        id: '__lancedb_init__',
        workspace_id: '',
        note_id: '',
        chunk_index: 0,
        text: '',
        content_hash: '',
        vector: Array.from(zeros)
      }
    ],
    { mode: 'create', existOk: true }
  )
  const table = await conn.openTable(NOTE_EMBEDDINGS_TABLE)
  await table.delete(`id = ${sqlStringLiteral('__lancedb_init__')}`)
  return table
}

export function registerLancedbEmbeddingsIpc(): void {
  ipcMain.handle('lancedb:get-status', async () => {
    try {
      const conn = await getConnection()
      const names = await conn.tableNames()
      return {
        ok: true as const,
        dbPath: getLancedbDirectory(),
        tableExists: names.includes(NOTE_EMBEDDINGS_TABLE)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle(
    'lancedb:ensure-table',
    async () => {
      try {
        await openOrCreateTable()
        return { ok: true as const }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: message }
      }
    }
  )

  /**
   * Returns a map of noteId → { contentHash, workspaceId } for all indexed notes.
   * Used by the renderer to determine which notes are pending re-indexing.
   */
  ipcMain.handle('lancedb:get-indexed-hashes', async () => {
    try {
      const conn = await getConnection()
      const names = await conn.tableNames()
      if (!names.includes(NOTE_EMBEDDINGS_TABLE)) {
        console.log('[lancedb] get-indexed-hashes: table does not exist, returning empty')
        return { ok: true as const, hashes: {} as Record<string, { contentHash: string; workspaceId: string }> }
      }
      const table = await conn.openTable(NOTE_EMBEDDINGS_TABLE)
      // Fetch all rows — avoid .select() as API differs across LanceDB versions.
      // Deduplicate by note_id in JS; only the first chunk per note is needed for hash.
      const rows = await table.query().toArray()
      console.log(`[lancedb] get-indexed-hashes: ${rows.length} total rows in table`)
      const hashes: Record<string, { contentHash: string; workspaceId: string }> = {}
      for (const row of rows) {
        // Access fields directly — valueToIpcPlain would call row.toArray() on Arrow
        // row objects, returning an array instead of a keyed object.
        const r = row as Record<string, unknown>
        const noteId = String(r['note_id'] ?? '')
        if (noteId && !hashes[noteId]) {
          const contentHash = String(r['content_hash'] ?? '')
          hashes[noteId] = {
            contentHash,
            workspaceId: String(r['workspace_id'] ?? '')
          }
        }
      }
      console.log(`[lancedb] get-indexed-hashes: ${Object.keys(hashes).length} unique notes indexed`)
      return { ok: true as const, hashes }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[lancedb] get-indexed-hashes failed:', message)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle(
    'lancedb:index-note-embeddings',
    async (_event, payload: IndexNoteEmbeddingsPayload) => {
      try {
        const { workspaceId, noteId, contentHash, chunks } = payload
        if (!workspaceId || !noteId) {
          return { ok: false as const, error: 'workspaceId and noteId are required' }
        }
        if (!contentHash) {
          return { ok: false as const, error: 'contentHash is required' }
        }
        const table = await openOrCreateTable()

        await table.delete(
          `workspace_id = ${sqlStringLiteral(workspaceId)} AND note_id = ${sqlStringLiteral(noteId)}`
        )

        if (chunks.length === 0) {
          console.log(`[lancedb] index-note-embeddings: no chunks for ${noteId}, deleted old rows`)
          return { ok: true as const, indexed: 0 }
        }

        const rows = chunks.map((c, i) => {
          const id =
            c.id ||
            `${workspaceId}:${noteId}:${c.chunkIndex !== undefined ? c.chunkIndex : i}`
          return {
            id,
            workspace_id: workspaceId,
            note_id: noteId,
            chunk_index: c.chunkIndex ?? i,
            text: c.text,
            content_hash: contentHash,
            vector: toVector(c.vector)
          }
        })

        await table.add(rows)
        console.log(`[lancedb] index-note-embeddings: stored ${rows.length} chunks for ${noteId} hash=${contentHash.slice(0, 8)}…`)
        return { ok: true as const, indexed: rows.length }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'lancedb:vector-search',
    async (
      _event,
      payload: {
        queryVector: number[] | Float32Array
        limit?: number
        filterSql?: string
      }
    ) => {
      try {
        const conn = await getConnection()
        const names = await conn.tableNames()
        if (!names.includes(NOTE_EMBEDDINGS_TABLE)) {
          return { ok: true as const, rows: [] as Record<string, unknown>[] }
        }
        const table = await conn.openTable(NOTE_EMBEDDINGS_TABLE)
        const limit = Math.min(Math.max(payload.limit ?? 10, 1), 500)
        const base = table.vectorSearch(toVector(payload.queryVector)).limit(limit)
        const filtered = payload.filterSql?.trim()
          ? base.where(payload.filterSql.trim())
          : base
        const rows = await filtered.toArray()
        return { ok: true as const, rows: serializeRowsForIpc(rows) }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'lancedb:delete-note-embeddings',
    async (_event, payload: { workspaceId: string; noteId: string }) => {
      try {
        const { workspaceId, noteId } = payload
        if (!workspaceId || !noteId) {
          return { ok: false as const, error: 'workspaceId and noteId are required' }
        }
        const conn = await getConnection()
        const names = await conn.tableNames()
        if (!names.includes(NOTE_EMBEDDINGS_TABLE)) {
          return { ok: true as const, deleted: false }
        }
        const table = await conn.openTable(NOTE_EMBEDDINGS_TABLE)
        // Note IDs are unique app-wide; delete by note_id so we always clear chunks even if
        // workspace_id in the table ever disagrees with the sidebar folder id.
        await table.delete(`note_id = ${sqlStringLiteral(noteId)}`)
        return { ok: true as const, deleted: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle('lancedb:dump-table', async () => {
    try {
      const conn = await getConnection()
      const names = await conn.tableNames()
      if (!names.includes(NOTE_EMBEDDINGS_TABLE)) {
        return { ok: true as const, rows: [], totalRows: 0 }
      }
      const table = await conn.openTable(NOTE_EMBEDDINGS_TABLE)
      const raw = await table.query().toArray()
      // Strip vector field — too large to log usefully.
      const rows = serializeRowsForIpc(raw).map((r) => {
        const { vector: _v, ...rest } = r
        return rest
      })
      return { ok: true as const, rows, totalRows: raw.length }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle(
    'lancedb:delete-workspace-embeddings',
    async (_event, payload: { workspaceId: string }) => {
      try {
        const { workspaceId } = payload
        if (!workspaceId) {
          return { ok: false as const, error: 'workspaceId is required' }
        }
        const conn = await getConnection()
        const names = await conn.tableNames()
        if (!names.includes(NOTE_EMBEDDINGS_TABLE)) {
          return { ok: true as const, deleted: false }
        }
        const table = await conn.openTable(NOTE_EMBEDDINGS_TABLE)
        await table.delete(`workspace_id = ${sqlStringLiteral(workspaceId)}`)
        return { ok: true as const, deleted: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: message }
      }
    }
  )
}

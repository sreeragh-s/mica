import { existsSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { ipcMain, session } from 'electron'
import log from 'electron-log/main'
import { join, resolve } from 'path'
import { getExtensionPath } from '@sqliteai/sqlite-vector'

const LOG = '[sqlite-vector]'
const AUTH_PARTITION = 'persist:notelab-auth'
const LOCAL_EMBEDDING_MODEL = 'bge-m3'
const INDEX_VERSION = 1
const MAX_EMBEDDING_TEXTS_PER_REQUEST = 50
const DEFAULT_CHUNK_MAX_CHARS = 1200
const DEFAULT_CHUNK_OVERLAP_CHARS = 200
const APPROX_CHARS_PER_TOKEN = 4
const SEMANTIC_DISTANCE = 'COSINE'

type NoteKind = 'note' | 'drawing'

type SearchDocumentRow = {
  note: string
  folder: string
  title: string
  kind: NoteKind
  text: string
  score: number
  uri: string
  section_index: number
}

type FilterCondition = {
  sql: string
  params: Array<string>
}

const dbByWorkspacePath = new Map<string, DatabaseSync>()

function authBaseUrl(): string {
  const u = __APP_AUTH_URL__ ?? ''
  return u.replace(/\/$/, '')
}

function normalizeWorkspacePath(workspacePath: string): string {
  const trimmed = workspacePath.trim()
  if (!trimmed) throw new Error('workspacePath is required')
  return resolve(trimmed)
}

export function getSQLiteVectorDirectory(workspacePath: string): string {
  return join(normalizeWorkspacePath(workspacePath), '.notelab', 'sqlite-vector')
}

function getSQLiteVectorDbPath(workspacePath: string): string {
  return join(getSQLiteVectorDirectory(workspacePath), 'index.sqlite')
}

function noteDocumentUri(note: string): string {
  return `notelab://note/${encodeURIComponent(note)}`
}

function logInfo(...args: unknown[]): void {
  log.info(LOG, ...args)
}

function logWarn(...args: unknown[]): void {
  log.warn(LOG, ...args)
}

function logError(...args: unknown[]): void {
  log.error(LOG, ...args)
}

function previewText(text: string, max = 120): string {
  return text.replace(/\n/g, ' ').slice(0, max)
}

function isLocalEmbeddingModelName(name: string): boolean {
  const lowered = name.toLowerCase()
  return lowered === LOCAL_EMBEDDING_MODEL || lowered.startsWith(`${LOCAL_EMBEDDING_MODEL}:`)
}

function toFloat32Buffer(vector: number[]): Buffer {
  return Buffer.from(Float32Array.from(vector).buffer.slice(0))
}

function chunkText(text: string, maxChars = DEFAULT_CHUNK_MAX_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  const output: string[] = []
  let current = ''

  const pushCurrent = (): void => {
    const trimmed = current.trim()
    if (trimmed) output.push(trimmed)
    current = ''
  }

  const splitLargeParagraph = (paragraph: string): string[] => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    const parts: string[] = []
    let start = 0
    while (start < words.length) {
      let end = start
      let candidate = ''
      while (end < words.length) {
        const next = candidate ? `${candidate} ${words[end]}` : words[end]
        if (next.length > maxChars && candidate) break
        candidate = next
        end++
      }
      if (!candidate) {
        candidate = words[start]!.slice(0, maxChars)
        end = start + 1
      }
      parts.push(candidate.trim())
      if (end >= words.length) break
      start = Math.max(end - Math.floor(DEFAULT_CHUNK_OVERLAP_CHARS / 8), start + 1)
    }
    return parts
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      pushCurrent()
      output.push(...splitLargeParagraph(paragraph))
      continue
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > maxChars && current) {
      pushCurrent()
      current = paragraph
      continue
    }
    current = candidate
  }

  pushCurrent()
  return output
}

function truncateForTokens(text: string, maxTokens: number): string {
  const maxChars = Math.max(maxTokens, 1) * APPROX_CHARS_PER_TOKEN
  return text.length <= maxChars ? text : `${text.slice(0, maxChars).trimEnd()}...`
}

function normalizeFilterKey(key: string): 'folder' | 'note' | null {
  if (key === 'folder' || key === 'workspaceId') return 'folder'
  if (key === 'note' || key === 'notePath') return 'note'
  return null
}

function parseStringFilterValue(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value]
  if (value && typeof value === 'object' && '$eq' in value) {
    const eqValue = (value as { $eq?: unknown }).$eq
    return typeof eqValue === 'string' && eqValue.trim() ? [eqValue] : []
  }
  if (value && typeof value === 'object' && '$in' in value) {
    const inValue = (value as { $in?: unknown }).$in
    return Array.isArray(inValue)
      ? inValue.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  }
  return []
}

function buildFilterCondition(filter: Record<string, unknown> | undefined): FilterCondition {
  if (!filter) return { sql: '', params: [] }

  const clauses: string[] = []
  const params: string[] = []

  for (const [rawKey, rawValue] of Object.entries(filter)) {
    const key = normalizeFilterKey(rawKey)
    if (!key) continue

    const values = parseStringFilterValue(rawValue)
    if (values.length === 0) continue

    if (values.length === 1) {
      clauses.push(`chunks.${key} = ?`)
      params.push(values[0]!)
      continue
    }

    clauses.push(`chunks.${key} IN (${values.map(() => '?').join(', ')})`)
    params.push(...values)
  }

  return clauses.length > 0
    ? { sql: ` AND ${clauses.join(' AND ')}`, params }
    : { sql: '', params: [] }
}

function getEmbeddingDimensions(db: DatabaseSync): number | null {
  const row = db.prepare("SELECT value FROM metadata WHERE key = 'embedding_dimensions'").get() as
    | { value?: string }
    | undefined
  if (!row?.value) return null
  const value = Number(row.value)
  return Number.isFinite(value) && value > 0 ? value : null
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      note TEXT PRIMARY KEY,
      uri TEXT NOT NULL UNIQUE,
      folder TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      doc_type TEXT,
      text TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note TEXT NOT NULL REFERENCES documents(note) ON DELETE CASCADE,
      uri TEXT NOT NULL,
      folder TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      embedding BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder);
    CREATE INDEX IF NOT EXISTS idx_chunks_note ON chunks(note);
    CREATE INDEX IF NOT EXISTS idx_chunks_folder ON chunks(folder);
  `)

  db.prepare(
    `
      INSERT INTO metadata (key, value)
      VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(String(INDEX_VERSION))
}

function ensureVectorReady(db: DatabaseSync, dimensions: number): void {
  const existingDimensions = getEmbeddingDimensions(db)
  if (existingDimensions != null && existingDimensions !== dimensions) {
    throw new Error(
      `Embedding dimensions changed from ${existingDimensions} to ${dimensions}. Delete ${getSQLiteVectorDirectory(
        '.'
      )} and reindex the workspace.`
    )
  }

  db.prepare(
    `
      INSERT INTO metadata (key, value)
      VALUES ('embedding_dimensions', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(String(dimensions))

  db.prepare("SELECT vector_init('chunks', 'embedding', ?) AS initialized").get(
    `type=FLOAT32,dimension=${dimensions},distance=${SEMANTIC_DISTANCE}`
  )
}

function openWorkspaceDb(workspacePath: string): DatabaseSync {
  const normalizedPath = normalizeWorkspacePath(workspacePath)
  const existingDb = dbByWorkspacePath.get(normalizedPath)
  if (existingDb) return existingDb

  const dbPath = getSQLiteVectorDbPath(normalizedPath)
  mkdirSync(getSQLiteVectorDirectory(normalizedPath), { recursive: true })

  const db = new DatabaseSync(dbPath, { allowExtension: true })
  db.enableLoadExtension(true)
  db.loadExtension(getExtensionPath())
  db.enableLoadExtension(false)
  ensureSchema(db)
  dbByWorkspacePath.set(normalizedPath, db)
  logInfo(`opened workspace SQLite vector index workspacePath=${normalizedPath} dbPath=${dbPath}`)
  return db
}

async function listOllamaModels(): Promise<{ name: string; model?: string }[]> {
  const response = await fetch('http://127.0.0.1:11434/api/tags')
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`)
  }
  const data = (await response.json()) as { models?: { name?: string; model?: string }[] }
  return Array.isArray(data.models)
    ? data.models.filter(
        (model): model is { name: string; model?: string } => typeof model.name === 'string'
      )
    : []
}

async function createLocalEmbeddings(texts: string[]): Promise<number[][]> {
  const output: number[][] = []
  for (let i = 0; i < texts.length; i += MAX_EMBEDDING_TEXTS_PER_REQUEST) {
    const batch = texts.slice(i, i + MAX_EMBEDDING_TEXTS_PER_REQUEST)
    logInfo(
      `embedding batch via local Ollama batch=${Math.floor(i / MAX_EMBEDDING_TEXTS_PER_REQUEST) + 1} size=${batch.length} total=${texts.length} preview="${previewText(batch[0] ?? '')}"`
    )
    const response = await fetch('http://127.0.0.1:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LOCAL_EMBEDDING_MODEL, input: batch })
    })
    const body = await response.text()
    if (!response.ok) {
      let message = body
      try {
        const parsed = JSON.parse(body) as { error?: string }
        if (typeof parsed.error === 'string') message = parsed.error
      } catch {
        /* keep raw body */
      }
      throw new Error(message || `Ollama returned HTTP ${response.status}`)
    }
    const data = JSON.parse(body) as { embeddings?: number[][] }
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== batch.length) {
      throw new Error(
        `Ollama returned ${data.embeddings?.length ?? 0} embeddings for ${batch.length} text(s)`
      )
    }
    output.push(...data.embeddings)
  }
  return output
}

async function createServerEmbeddings(texts: string[]): Promise<number[][]> {
  const base = authBaseUrl()
  if (!base) {
    throw new Error('VITE_AUTH_URL is not set')
  }
  const authSession = session.fromPartition(AUTH_PARTITION)
  const origin = new URL(base).origin
  const output: number[][] = []
  for (let i = 0; i < texts.length; i += MAX_EMBEDDING_TEXTS_PER_REQUEST) {
    const batch = texts.slice(i, i + MAX_EMBEDDING_TEXTS_PER_REQUEST)
    logInfo(
      `embedding batch via server batch=${Math.floor(i / MAX_EMBEDDING_TEXTS_PER_REQUEST) + 1} size=${batch.length} total=${texts.length} preview="${previewText(batch[0] ?? '')}"`
    )
    const response = await authSession.fetch(`${base}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin
      },
      body: JSON.stringify({ texts: batch })
    })
    const body = await response.text()
    if (!response.ok) {
      let message = body
      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string; detail?: string }
        message = parsed.message ?? parsed.detail ?? parsed.error ?? body
      } catch {
        /* keep raw body */
      }
      throw new Error(message || `Embedding API returned HTTP ${response.status}`)
    }
    const data = JSON.parse(body) as { embeddings?: number[][] }
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== batch.length) {
      throw new Error(
        `Embedding API returned ${data.embeddings?.length ?? 0} embeddings for ${batch.length} text(s)`
      )
    }
    output.push(...data.embeddings)
  }
  return output
}

async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  try {
    const models = await listOllamaModels()
    if (
      models.some(
        (model) => typeof model.name === 'string' && isLocalEmbeddingModelName(model.name)
      )
    ) {
      try {
        logInfo(`using local Ollama embeddings provider texts=${texts.length}`)
        return await createLocalEmbeddings(texts)
      } catch (localError) {
        logWarn('Local embeddings failed, falling back to server', localError)
      }
    }
  } catch {
    // Ollama is optional; server fallback handles the common cloud path.
  }

  logInfo(`using remote embeddings provider texts=${texts.length}`)
  return await createServerEmbeddings(texts)
}

async function runSemanticSearch(
  db: DatabaseSync,
  query: string,
  maxChunks: number,
  filter: Record<string, unknown> | undefined
): Promise<SearchDocumentRow[]> {
  const queryEmbedding = (await createEmbeddings([query]))[0]
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return []

  ensureVectorReady(db, queryEmbedding.length)

  const filterCondition = buildFilterCondition(filter)
  const totalMatchingChunks = filterCondition.sql
    ? ((
        db
          .prepare(`SELECT COUNT(*) AS count FROM chunks WHERE 1=1${filterCondition.sql}`)
          .get(...filterCondition.params) as { count: number }
      ).count ?? 0)
    : null

  const scanLimit = Math.max(maxChunks * 4, totalMatchingChunks ?? 0, 20)
  const scanLimitInteger = Math.trunc(scanLimit)
  const resultLimitInteger = Math.trunc(maxChunks * 4)

  const rows = db
    .prepare(
      `
        SELECT
          chunks.note,
          chunks.folder,
          chunks.title,
          chunks.kind,
          chunks.uri,
          chunks.text,
          chunks.chunk_index,
          vector_results.distance
        FROM chunks
        JOIN vector_full_scan('chunks', 'embedding', ?, ?) AS vector_results
          ON chunks.id = vector_results.rowid
        WHERE 1=1${filterCondition.sql}
        ORDER BY vector_results.distance ASC
        LIMIT ?
      `
    )
    .all(
      toFloat32Buffer(queryEmbedding),
      BigInt(scanLimitInteger),
      ...filterCondition.params,
      BigInt(resultLimitInteger)
    ) as Array<{
    note: string
    folder: string
    title: string
    kind: NoteKind
    uri: string
    text: string
    chunk_index: number
    distance: number
  }>

  return rows.map((row) => ({
    note: row.note,
    folder: row.folder,
    title: row.title,
    kind: row.kind,
    text: row.text,
    score: 1 - row.distance,
    uri: row.uri,
    section_index: row.chunk_index
  }))
}

function limitRows(
  rows: SearchDocumentRow[],
  maxDocuments: number,
  maxChunks: number,
  maxSections: number,
  maxTokens: number
): SearchDocumentRow[] {
  const selected: SearchDocumentRow[] = []
  const seenDocuments = new Set<string>()
  const sectionCountByNote = new Map<string, number>()

  for (const row of rows) {
    const noteSections = sectionCountByNote.get(row.note) ?? 0
    const isNewDocument = !seenDocuments.has(row.note)

    if (isNewDocument && seenDocuments.size >= maxDocuments) continue
    if (noteSections >= maxSections) continue

    seenDocuments.add(row.note)
    sectionCountByNote.set(row.note, noteSections + 1)
    selected.push({
      ...row,
      text: truncateForTokens(row.text, maxTokens)
    })

    if (selected.length >= maxChunks) break
  }

  return selected
}

export function registerSQLiteVectorEmbeddingsIpc(): void {
  ipcMain.handle('embeddings:get-status', async (_event, payload: { workspacePath: string }) => {
    try {
      const db = openWorkspaceDb(payload.workspacePath)
      const counts = db
        .prepare(
          `
            SELECT
              (SELECT COUNT(*) FROM documents) AS documents,
              (SELECT COUNT(*) FROM chunks) AS chunks
          `
        )
        .get() as { documents: number; chunks: number }
      return {
        ok: true as const,
        indexPath: getSQLiteVectorDirectory(payload.workspacePath),
        indexExists: existsSync(getSQLiteVectorDbPath(payload.workspacePath)),
        documents: counts.documents ?? 0,
        chunks: counts.chunks ?? 0
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle('embeddings:ensure-index', async (_event, payload: { workspacePath: string }) => {
    try {
      openWorkspaceDb(payload.workspacePath)
      logInfo(
        `ensure-index workspacePath=${payload.workspacePath} indexPath=${getSQLiteVectorDirectory(payload.workspacePath)}`
      )
      return { ok: true as const }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle(
    'embeddings:get-indexed-hashes',
    async (_event, payload: { workspacePath: string }) => {
      try {
        const db = openWorkspaceDb(payload.workspacePath)
        const rows = db.prepare('SELECT note, folder, content_hash FROM documents').all() as Array<{
          note: string
          folder: string
          content_hash: string
        }>
        const hashes: Record<string, { contentHash: string; folder: string }> = {}
        for (const row of rows) {
          hashes[row.note] = {
            contentHash: row.content_hash,
            folder: row.folder
          }
        }
        return { ok: true as const, hashes }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError('get-indexed-hashes failed', message)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'embeddings:upsert-note-document',
    async (
      _event,
      payload: {
        workspacePath: string
        folder: string
        note: string
        title: string
        kind: NoteKind
        contentHash: string
        text: string
        docType?: string
      }
    ) => {
      try {
        const { workspacePath, folder, note, title, kind, contentHash, text, docType } = payload
        if (!folder || !note) {
          return { ok: false as const, error: 'folder and note are required' }
        }
        if (!contentHash) {
          return { ok: false as const, error: 'contentHash is required' }
        }

        const chunks = chunkText(text)
        if (chunks.length === 0) {
          return { ok: true as const, indexed: 0 }
        }

        logInfo(
          `upsert-note-document workspacePath=${workspacePath} indexPath=${getSQLiteVectorDirectory(workspacePath)} folder=${folder} note=${note} kind=${kind} docType=${docType ?? '(default)'} chars=${text.length} chunks=${chunks.length} hash=${contentHash.slice(0, 8)} preview="${previewText(text)}"`
        )

        const embeddings = await createEmbeddings(chunks)
        if (embeddings.length !== chunks.length) {
          return {
            ok: false as const,
            error: 'Embedding provider returned an unexpected chunk count'
          }
        }

        const db = openWorkspaceDb(workspacePath)
        ensureVectorReady(db, embeddings[0]?.length ?? 0)
        const uri = noteDocumentUri(note)
        const now = Date.now()

        db.exec('BEGIN IMMEDIATE')
        try {
          db.prepare('DELETE FROM documents WHERE note = ?').run(note)
          db.prepare(
            `
              INSERT INTO documents (
                note, uri, folder, title, kind, content_hash, doc_type, text, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          ).run(note, uri, folder, title, kind, contentHash, docType ?? null, text, now)

          const insertChunk = db.prepare(
            `
              INSERT INTO chunks (
                note, uri, folder, title, kind, text, chunk_index, token_count, embedding
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]!
            insertChunk.run(
              note,
              uri,
              folder,
              title,
              kind,
              chunk,
              i,
              Math.ceil(chunk.length / APPROX_CHARS_PER_TOKEN),
              toFloat32Buffer(embeddings[i]!)
            )
          }

          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }

        return { ok: true as const, indexed: chunks.length }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError('upsert-note-document failed', message)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'embeddings:search-documents',
    async (
      _event,
      payload: {
        workspacePath: string
        query: string
        maxDocuments?: number
        maxChunks?: number
        maxSections?: number
        maxTokens?: number
        filter?: Record<string, unknown>
      }
    ) => {
      try {
        const query = payload.query.trim()
        if (!query) return { ok: true as const, rows: [] }

        const db = openWorkspaceDb(payload.workspacePath)
        const maxDocuments = Math.min(Math.max(payload.maxDocuments ?? 5, 1), 100)
        const maxChunks = Math.min(Math.max(payload.maxChunks ?? 20, 1), 200)
        const maxSections = Math.min(Math.max(payload.maxSections ?? 1, 1), 10)
        const maxTokens = Math.min(Math.max(payload.maxTokens ?? 320, 50), 4000)

        const rawRows = await runSemanticSearch(db, query, maxChunks, payload.filter)

        const rows = limitRows(rawRows, maxDocuments, maxChunks, maxSections, maxTokens)

        logInfo(
          `search-documents workspacePath=${payload.workspacePath} query="${previewText(query, 160)}" maxDocuments=${maxDocuments} maxChunks=${maxChunks} maxSections=${maxSections} maxTokens=${maxTokens} strategy=sqlite-vector rows=${rows.length}`
        )

        return { ok: true as const, rows }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError('search-documents failed', message)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'embeddings:delete-note-document',
    async (_event, payload: { workspacePath: string; note: string }) => {
      try {
        const { workspacePath, note } = payload
        if (!note) {
          return { ok: false as const, error: 'note is required' }
        }
        const db = openWorkspaceDb(workspacePath)
        const result = db.prepare('DELETE FROM documents WHERE note = ?').run(note)
        const deleted = (result.changes ?? 0) > 0
        logInfo(
          `delete-note-document workspacePath=${workspacePath} note=${note} deleted=${deleted}`
        )
        return { ok: true as const, deleted }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError('delete-note-document failed', message)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'embeddings:delete-workspace-documents',
    async (_event, payload: { workspacePath: string; workspaceId: string }) => {
      try {
        const { workspacePath, workspaceId } = payload
        if (!workspaceId) {
          return { ok: false as const, error: 'workspaceId is required' }
        }
        const db = openWorkspaceDb(workspacePath)
        const result = db.prepare('DELETE FROM documents WHERE folder = ?').run(workspaceId)
        const deletedCount = result.changes ?? 0
        return { ok: true as const, deleted: deletedCount > 0, deletedCount }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError('delete-workspace-documents failed', message)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle('embeddings:dump-index', async (_event, payload: { workspacePath: string }) => {
    try {
      const db = openWorkspaceDb(payload.workspacePath)
      const counts = db
        .prepare(
          `
            SELECT
              (SELECT COUNT(*) FROM documents) AS totalDocuments,
              (SELECT COUNT(*) FROM chunks) AS totalChunks
          `
        )
        .get() as { totalDocuments: number; totalChunks: number }
      const documents = db
        .prepare(
          `
            SELECT uri, folder, note, title, kind, content_hash AS contentHash
            FROM documents
            ORDER BY note ASC
          `
        )
        .all()
      return {
        ok: true as const,
        indexPath: getSQLiteVectorDirectory(payload.workspacePath),
        documents,
        totalDocuments: counts.totalDocuments ?? 0,
        totalChunks: counts.totalChunks ?? 0
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logError('dump-index failed', message)
      return { ok: false as const, error: message }
    }
  })
}

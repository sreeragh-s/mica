import { readFile as readFileFromFs } from 'node:fs/promises'
import { ipcMain, session } from 'electron'
import log from 'electron-log/main'
import { join, resolve } from 'path'
import { LocalDocumentIndex } from 'vectra'
import type {
  EmbeddingsModel,
  EmbeddingsResponse,
  MetadataFilter,
  MetadataTypes,
} from 'vectra'

const LOG = '[vectra]'
const AUTH_PARTITION = 'persist:notelab-auth'
const LOCAL_EMBEDDING_MODEL = 'bge-m3'
const INDEX_VERSION = 3
const EMBEDDINGS_MAX_TOKENS = 8000
const MAX_EMBEDDING_TEXTS_PER_REQUEST = 50
const REQUIRED_INDEXED_FIELDS = [
  'documentId',
  'startPos',
  'endPos',
  'folder',
  'note',
  // Keep title inline so Vectra doesn't create one external metadata file per chunk.
  'title',
  'kind',
  'contentHash',
]

type NoteKind = 'note' | 'drawing'

type NoteDocumentMetadata = {
  folder: string
  note: string
  title: string
  kind: NoteKind
  contentHash: string
}

type SearchDocumentRow = {
  note: string
  folder: string
  title: string
  kind: NoteKind
  text: string
  score: number
  uri: string
  section_index: number
  is_bm25: boolean
}

type StoredDocumentRow = {
  documentId: string
  uri: string
  text: string
  metadata: NoteDocumentMetadata
}

type VectraCatalog = {
  version?: number
  count?: number
  idToUri?: Record<string, string>
}

const indexPromiseByWorkspacePath = new Map<string, Promise<LocalDocumentIndex>>()

function authBaseUrl(): string {
  const u = __APP_AUTH_URL__ ?? ''
  return u.replace(/\/$/, '')
}

function normalizeWorkspacePath(workspacePath: string): string {
  const trimmed = workspacePath.trim()
  if (!trimmed) throw new Error('workspacePath is required')
  return resolve(trimmed)
}

export function getVectraDirectory(workspacePath: string): string {
  return join(normalizeWorkspacePath(workspacePath), '.notelab', 'vectra')
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

function documentTypeForKind(kind: NoteKind): string {
  return kind === 'note' ? 'md' : 'txt'
}

function stringifyFilter(filter: MetadataFilter | undefined): string {
  if (!filter) return '(none)'
  try {
    return JSON.stringify(filter)
  } catch {
    return String(filter)
  }
}

function isLocalEmbeddingModelName(name: string): boolean {
  const lowered = name.toLowerCase()
  return lowered === LOCAL_EMBEDDING_MODEL || lowered.startsWith(`${LOCAL_EMBEDDING_MODEL}:`)
}

function parseMetadata(record: Record<string, MetadataTypes>): NoteDocumentMetadata | null {
  const folder = record['folder']
  const note = record['note']
  const title = record['title']
  const kind = record['kind']
  const contentHash = record['contentHash']
  if (
    typeof folder !== 'string' ||
    typeof note !== 'string' ||
    typeof title !== 'string' ||
    (kind !== 'note' && kind !== 'drawing') ||
    typeof contentHash !== 'string'
  ) {
    return null
  }
  return { folder, note, title, kind, contentHash }
}

async function readStoredDocuments(indexPath: string): Promise<StoredDocumentRow[]> {
  let rawCatalog: string
  try {
    rawCatalog = await readFileFromFs(join(indexPath, 'catalog.json'), 'utf8')
  } catch {
    return []
  }

  let catalog: VectraCatalog
  try {
    catalog = JSON.parse(rawCatalog) as VectraCatalog
  } catch (error) {
    throw new Error(
      `Error parsing Vectra catalog at ${indexPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const idToUri = catalog.idToUri ?? {}
  const rows: StoredDocumentRow[] = []
  for (const [documentId, uri] of Object.entries(idToUri)) {
    try {
      const [rawMetadata, text] = await Promise.all([
        readFileFromFs(join(indexPath, `${documentId}.json`), 'utf8'),
        readFileFromFs(join(indexPath, `${documentId}.txt`), 'utf8'),
      ])
      const parsedMetadata = JSON.parse(rawMetadata) as Record<string, MetadataTypes>
      const metadata = parseMetadata(parsedMetadata)
      if (!metadata) {
        logWarn(`skipping stored document with invalid metadata path=${indexPath} documentId=${documentId}`)
        continue
      }
      rows.push({ documentId, uri, text, metadata })
    } catch (error) {
      logWarn(
        `skipping unreadable stored document path=${indexPath} documentId=${documentId} reason=${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return rows
}

async function listOllamaModels(): Promise<{ name: string; model?: string }[]> {
  const response = await fetch('http://127.0.0.1:11434/api/tags')
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`)
  }
  const data = (await response.json()) as { models?: { name?: string; model?: string }[] }
  return Array.isArray(data.models)
    ? data.models.filter((model): model is { name: string; model?: string } => typeof model.name === 'string')
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
      body: JSON.stringify({ model: LOCAL_EMBEDDING_MODEL, input: batch }),
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
        Origin: origin,
      },
      body: JSON.stringify({ texts: batch }),
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

class NotelabEmbeddingsModel implements EmbeddingsModel {
  readonly maxTokens = EMBEDDINGS_MAX_TOKENS

  async createEmbeddings(inputs: string | string[]): Promise<EmbeddingsResponse> {
    const texts = (Array.isArray(inputs) ? inputs : [inputs]).map((text) => text.trim())
    if (texts.some((text) => text.length === 0)) {
      return { status: 'error', message: 'Embeddings require non-empty text inputs.' }
    }

    try {
      const models = await listOllamaModels()
      if (models.some((model) => typeof model.name === 'string' && isLocalEmbeddingModelName(model.name))) {
        try {
          logInfo(`using local Ollama embeddings provider texts=${texts.length}`)
          const output = await createLocalEmbeddings(texts)
          return { status: 'success', output, model: LOCAL_EMBEDDING_MODEL }
        } catch (localError) {
          logWarn('Local embeddings failed, falling back to server', localError)
        }
      }
    } catch {
      // Ollama is optional; server fallback handles the common cloud path.
    }

    try {
      logInfo(`using remote embeddings provider texts=${texts.length}`)
      const output = await createServerEmbeddings(texts)
      return { status: 'success', output, model: '@cf/baai/bge-m3' }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

function createIndexInstance(workspacePath: string): LocalDocumentIndex {
  return new LocalDocumentIndex({
    folderPath: getVectraDirectory(workspacePath),
    embeddings: new NotelabEmbeddingsModel(),
  })
}

function hasRequiredIndexedFields(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false
  return REQUIRED_INDEXED_FIELDS.every((field) => fields.includes(field))
}

async function ensureIndexReady(
  workspacePath: string,
  index: LocalDocumentIndex
): Promise<LocalDocumentIndex> {
  const normalizedPath = normalizeWorkspacePath(workspacePath)
  let activeIndex = index

  const createFreshIndex = async (): Promise<LocalDocumentIndex> => {
    const freshIndex = createIndexInstance(normalizedPath)
    await freshIndex.createIndex({
      version: INDEX_VERSION,
      deleteIfExists: true,
      metadata_config: { indexed: REQUIRED_INDEXED_FIELDS },
    })
    return freshIndex
  }

  const rebuildIndex = async (reason: string): Promise<LocalDocumentIndex> => {
    const storedDocuments = await readStoredDocuments(activeIndex.folderPath).catch((error) => {
      logWarn(
        `failed to read stored Vectra documents before rebuild path=${activeIndex.folderPath} reason=${error instanceof Error ? error.message : String(error)}`
      )
      return [] as StoredDocumentRow[]
    })

    logWarn(
      `${reason} path=${activeIndex.folderPath} targetVersion=${INDEX_VERSION} indexedFields=${JSON.stringify(REQUIRED_INDEXED_FIELDS)} storedDocuments=${storedDocuments.length}`
    )

    activeIndex = await createFreshIndex()

    for (let i = 0; i < storedDocuments.length; i++) {
      const document = storedDocuments[i]
      logInfo(
        `migrating stored document ${i + 1}/${storedDocuments.length} note=${document.metadata.note} uri=${document.uri} chars=${document.text.length}`
      )
      await activeIndex.upsertDocument(
        document.uri,
        document.text,
        documentTypeForKind(document.metadata.kind),
        document.metadata
      )
    }

    if (storedDocuments.length > 0) {
      logInfo(
        `completed Vectra rebuild path=${activeIndex.folderPath} migratedDocuments=${storedDocuments.length}`
      )
    }
    return activeIndex
  }

  if (!(await activeIndex.isIndexCreated())) {
    logInfo(`creating workspace Vectra index path=${activeIndex.folderPath}`)
    return await createFreshIndex()
  }

  try {
    const [indexStats, catalogStats] = await Promise.all([
      activeIndex.getIndexStats(),
      activeIndex.getCatalogStats()
    ])
    if (
      indexStats.version !== INDEX_VERSION ||
      !hasRequiredIndexedFields(indexStats.metadata_config?.indexed)
    ) {
      return await rebuildIndex(
        `rebuilding workspace Vectra index path=${index.folderPath} indexVersion=${indexStats.version} catalogVersion=${catalogStats.version ?? '(unknown)'} indexedFields=${JSON.stringify(indexStats.metadata_config?.indexed ?? [])}`
      )
    }
    const storedDocuments = await readStoredDocuments(activeIndex.folderPath)
    if (storedDocuments.length !== catalogStats.documents) {
      return await rebuildIndex(
        `rebuilding inconsistent workspace Vectra index path=${activeIndex.folderPath} catalogDocuments=${catalogStats.documents} readableDocuments=${storedDocuments.length}`
      )
    }
  } catch (error) {
    return await rebuildIndex(
      `rebuilding unreadable workspace Vectra index reason=${error instanceof Error ? error.message : String(error)}`
    )
  }
  return activeIndex
}

async function getWorkspaceIndex(workspacePath: string): Promise<LocalDocumentIndex> {
  const normalizedPath = normalizeWorkspacePath(workspacePath)
  let indexPromise = indexPromiseByWorkspacePath.get(normalizedPath)
  if (!indexPromise) {
    logInfo(`opening workspace Vectra index workspacePath=${normalizedPath} indexPath=${getVectraDirectory(normalizedPath)}`)
    indexPromise = (async () => {
      const index = createIndexInstance(normalizedPath)
      return await ensureIndexReady(normalizedPath, index)
    })().catch((error) => {
      indexPromiseByWorkspacePath.delete(normalizedPath)
      throw error
    })
    indexPromiseByWorkspacePath.set(normalizedPath, indexPromise)
  }
  return indexPromise
}

async function listDocumentsWithMetadata(
  index: LocalDocumentIndex
): Promise<{ documentId: string; uri: string; metadata: NoteDocumentMetadata }[]> {
  const documents = await readStoredDocuments(index.folderPath)
  return documents.map((document) => ({
    documentId: document.documentId,
    uri: document.uri,
    metadata: document.metadata,
  }))
}

export function registerVectraEmbeddingsIpc(): void {
  ipcMain.handle(
    'embeddings:get-status',
    async (_event, payload: { workspacePath: string }) => {
      try {
        const index = await getWorkspaceIndex(payload.workspacePath)
        const stats = await index.getCatalogStats()
        logInfo(
          `get-status workspacePath=${payload.workspacePath} indexPath=${getVectraDirectory(payload.workspacePath)} documents=${stats.documents} chunks=${stats.chunks}`
        )
        return {
          ok: true as const,
          indexPath: getVectraDirectory(payload.workspacePath),
          indexExists: true,
          documents: stats.documents,
          chunks: stats.chunks,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'embeddings:ensure-index',
    async (_event, payload: { workspacePath: string }) => {
      try {
        await getWorkspaceIndex(payload.workspacePath)
        logInfo(`ensure-index workspacePath=${payload.workspacePath} indexPath=${getVectraDirectory(payload.workspacePath)}`)
        return { ok: true as const }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'embeddings:get-indexed-hashes',
    async (_event, payload: { workspacePath: string }) => {
      try {
        const index = await getWorkspaceIndex(payload.workspacePath)
        const rows = await listDocumentsWithMetadata(index)
        const hashes: Record<string, { contentHash: string; folder: string }> = {}
        for (const row of rows) {
          hashes[row.metadata.note] = {
            contentHash: row.metadata.contentHash,
            folder: row.metadata.folder,
          }
        }
        logInfo(`get-indexed-hashes workspacePath=${payload.workspacePath} count=${Object.keys(hashes).length}`)
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
        logInfo(
          `upsert-note-document workspacePath=${workspacePath} indexPath=${getVectraDirectory(workspacePath)} folder=${folder} note=${note} kind=${kind} docType=${docType ?? '(default)'} chars=${text.length} hash=${contentHash.slice(0, 8)} preview="${previewText(text)}"`
        )
        const index = await getWorkspaceIndex(workspacePath)
        await index.upsertDocument(
          noteDocumentUri(note),
          text,
          docType ?? documentTypeForKind(kind),
          {
            folder,
            note,
            title,
            kind,
            contentHash,
          }
        )
        const chunks = await index.listItemsByMetadata({
          note: { $eq: note },
        })
        logInfo(`upsert-note-document stored folder=${folder} note=${note} chunks=${chunks.length}`)
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
        filter?: MetadataFilter
        isBm25?: boolean
      }
    ) => {
      try {
        const index = await getWorkspaceIndex(payload.workspacePath)
        const maxDocuments = Math.min(Math.max(payload.maxDocuments ?? 5, 1), 100)
        const maxChunks = Math.min(Math.max(payload.maxChunks ?? 20, 1), 200)
        const maxSections = Math.min(Math.max(payload.maxSections ?? 1, 1), 10)
        const maxTokens = Math.min(Math.max(payload.maxTokens ?? 320, 50), 4000)
        const results = await index.queryDocuments(payload.query, {
          maxDocuments,
          maxChunks,
          filter: payload.filter,
          isBm25: payload.isBm25 ?? false,
        })
        logInfo(
          `search-documents workspacePath=${payload.workspacePath} query="${previewText(payload.query, 160)}" maxDocuments=${maxDocuments} maxChunks=${maxChunks} maxSections=${maxSections} maxTokens=${maxTokens} isBm25=${payload.isBm25 ?? false} filter=${stringifyFilter(payload.filter)} documentsReturned=${results.length}`
        )
        const rows: SearchDocumentRow[] = []
        for (const result of results) {
          const rawMetadata = await result.loadMetadata().catch(() => null)
          if (!rawMetadata) continue
          const metadata = parseMetadata(rawMetadata)
          if (!metadata) continue
          const sections = await result.renderSections(maxTokens, maxSections, true)
          sections.forEach((section, indexInDocument) => {
            rows.push({
              note: metadata.note,
              folder: metadata.folder,
              title: metadata.title,
              kind: metadata.kind,
              text: section.text,
              score: section.score,
              uri: result.uri,
              section_index: indexInDocument,
              is_bm25: section.isBm25,
            })
          })
        }
        rows.sort((left, right) => right.score - left.score)
        logInfo(
          `search-documents renderedRows=${rows.length} topResults=${rows.slice(0, 5).map((row) => `${row.note}:${row.score.toFixed(4)}`).join(', ')}`
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
        const index = await getWorkspaceIndex(workspacePath)
        const existed = Boolean(await index.getDocumentId(noteDocumentUri(note)))
        if (existed) {
          await index.deleteDocument(noteDocumentUri(note))
        }
        logInfo(`delete-note-document workspacePath=${workspacePath} note=${note} deleted=${existed}`)
        return { ok: true as const, deleted: existed }
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
        const index = await getWorkspaceIndex(workspacePath)
        const rows = await listDocumentsWithMetadata(index)
        let deletedCount = 0
        for (const row of rows) {
          if (row.metadata.folder !== workspaceId) continue
          await index.deleteDocument(row.uri)
          deletedCount++
        }
        logInfo(`delete-workspace-documents workspacePath=${workspacePath} workspaceId=${workspaceId} deletedCount=${deletedCount}`)
        return { ok: true as const, deleted: deletedCount > 0, deletedCount }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError('delete-workspace-documents failed', message)
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'embeddings:dump-index',
    async (_event, payload: { workspacePath: string }) => {
      try {
        const index = await getWorkspaceIndex(payload.workspacePath)
        const stats = await index.getCatalogStats()
        const rows = await listDocumentsWithMetadata(index)
        const documents = rows.map((row) => ({
          uri: row.uri,
          ...row.metadata,
        }))
        logInfo(
          `dump-index workspacePath=${payload.workspacePath} indexPath=${getVectraDirectory(payload.workspacePath)} documents=${stats.documents} chunks=${stats.chunks}`
        )
        return {
          ok: true as const,
          indexPath: getVectraDirectory(payload.workspacePath),
          documents,
          totalDocuments: stats.documents,
          totalChunks: stats.chunks,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError('dump-index failed', message)
        return { ok: false as const, error: message }
      }
    }
  )
}

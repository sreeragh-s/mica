# Note Indexing — Implementation Guide

Semantic indexing of notes and drawings using `@cf/baai/bge-m3` (1024-dim) on Cloudflare Workers AI, stored locally in LanceDB via the Electron main process.

---

## Architecture overview

```
Renderer (React)
  │
  ├─ markdown-chunker.ts      Header-aware text splitter
  ├─ embedding-pipeline.ts    Orchestrates chunk → embed → store
  │
  ▼  window.api.auth.fetch (IPC, session cookies)
Backend (Cloudflare Worker)
  │
  └─ POST /api/embeddings     Validates session → bge-m3 → returns number[][]
  
  window.api.embeddings.* (IPC)
  ▼
Main process
  └─ lancedb-embeddings.ts    Stores/queries vectors in ~/.../lancedb/
```

---

## Files changed / created

### Backend (`backend/`)

| File | Change |
|------|--------|
| `wrangler.jsonc` | Added `"ai": { "binding": "AI" }` |
| `src/env.d.ts` | Added `AI: Ai` to `Cloudflare.Env` |
| `src/embeddings.ts` | **New** — `POST /api/embeddings` handler |
| `src/index.ts` | Routed `/api/embeddings` |

### Electron main (`<notelab.io repo>/src/main/`)

| File | Change |
|------|--------|
| `lancedb-embeddings.ts` | Schema adds `content_hash`; auto-migrates; new IPCs: `lancedb:get-indexed-hashes`, `lancedb:delete-workspace-embeddings`; `indexNoteEmbeddings` now takes `contentHash` |

### Preload / types

| File | Change |
|------|--------|
| `src/preload/index.ts` | `ensureTable()` (no args), `getIndexedHashes()`, `deleteWorkspaceEmbeddings()`, updated `indexNoteEmbeddings` |
| `src/preload/index.d.ts` | Mirrors above |
| `src/renderer/src/lib/auth-bridge.ts` | Mirrors above |

### Renderer (`<notelab.io repo>/src/renderer/src/`)

| File | Change |
|------|--------|
| `lib/markdown-chunker.ts` | **New** — header-aware splitter + Excalidraw text extractor |
| `lib/embedding-pipeline.ts` | **New** — `computeContentHash`, `indexNote`, `buildIndexingStatus` |
| `components/notes/notes-app-types.ts` | Added `'indexing'` to `SettingsSection` |
| `components/notes/useNotesApp.ts` | Indexing state + `refreshIndexingStatus` / `runIndexPending` / `runReindexAll`; delete-note and delete-workspace hooks |
| `components/notes/EmbeddingsSettingsView.tsx` | **New** — settings panel UI |
| `components/notes/NotesSidebar.tsx` | Added "Indexing" tab |
| `components/notes/NotesMainArea.tsx` | Routes `settingsSection === 'indexing'` |

---

## How to initialize

### 1. Backend — enable the AI binding

In `backend/wrangler.jsonc` the `"ai"` binding is already added. No extra sign-up is needed; Workers AI is enabled on any Cloudflare account. For local dev with `wrangler dev`, Workers AI runs remotely (requires `--remote` or an active internet connection).

```bash
cd backend
npx wrangler dev --remote   # AI binding requires remote execution
```

### 2. Backend — deploy (production)

```bash
cd backend
npx wrangler deploy
```

The `/api/embeddings` endpoint is now live. It requires an authenticated session cookie — unauthenticated requests return `401`.

### 3. Electron — first launch after schema change

On the first launch after updating, the main process detects that the existing `note_embeddings` LanceDB table lacks the `content_hash` column and **drops and recreates it automatically**. Existing embeddings (if any) are lost; just re-index from Settings → Indexing.

No manual migration is needed.

### 4. notelab.io — environment variable

The Electron renderer calls the backend via `VITE_AUTH_URL`. Make sure your app’s `.env` (or `.env.local`) has:

```
VITE_AUTH_URL=https://your-worker.workers.dev
```

For local dev pointing at a local worker tunnel:

```
VITE_AUTH_URL=https://your-tunnel.trycloudflare.com
```

---

## How to run

### Development

```bash
# Terminal 1 — backend (remote AI binding required)
cd backend
npx wrangler dev --remote

# Terminal 2 — Electron app (from this repo’s root directory)
npm install          # rebuilds native deps (LanceDB) for Electron ABI
npm run dev
```

### Indexing notes

1. Sign in with GitHub (Settings → Account).
2. Open **Settings → Indexing**.
3. Click **Refresh** to see which notes are pending.
4. Click **Index Pending** to embed only new/changed notes, or **Reindex All** to force re-embed everything.

Progress is shown per-note with status icons:

| Icon | Meaning |
|------|---------|
| Clock | Pending (not yet indexed or content changed) |
| Spinning loader | Currently being embedded |
| Green check | Up to date |
| Red circle | Error during last attempt |

### Automatic cleanup

- **Delete a note** → its embeddings are deleted from LanceDB automatically.
- **Delete a workspace** → all embeddings for that workspace are deleted automatically.

---

## Chunking strategy

Markdown notes use a two-stage splitter:

1. **Header boundaries** (H1 / H2 / H3) — each section becomes a candidate chunk with the header breadcrumb prepended (e.g. `"Introduction > Setup"`).
2. **Recursive character split** — sections longer than **1500 chars** are further split at paragraph → newline → sentence boundaries with a **150-char overlap**.

Excalidraw drawings index only `type: "text"` elements joined with double newlines, then apply the same character split.

The breadcrumb prefix means each chunk is self-contained for retrieval — a chunk under `"## API Reference > Authentication"` carries that context even without the surrounding document.

---

## API reference — `POST /api/embeddings`

**Auth:** session cookie (Better Auth, same partition as the rest of the app).

**Request body:**
```json
{ "texts": ["chunk 1 text", "chunk 2 text"] }
```
- Max 50 texts per request.
- Batching is handled automatically by `embedding-pipeline.ts`.

**Response:**
```json
{
  "embeddings": [[0.12, -0.34, ...], ...],
  "dimension": 1024
}
```

**Errors:**
- `401` — not signed in
- `400` — invalid input (empty array, non-strings, > 50 texts)
- `500` — Workers AI failure

---

## LanceDB schema

Table: `note_embeddings`

| Column | Type | Description |
|--------|------|-------------|
| `id` | string | `workspaceId:noteId:chunkIndex` |
| `workspace_id` | string | Workspace the note belongs to |
| `note_id` | string | Note ID |
| `chunk_index` | int | Position of chunk within the note |
| `text` | string | Raw chunk text (for retrieval display) |
| `content_hash` | string | SHA-256 hex of full note content at index time |
| `vector` | float32[1024] | bge-m3 embedding |

The `content_hash` is used to skip re-embedding notes whose content hasn't changed since the last index run.

---

## Future: vector search for AI chat

The IPC `window.api.embeddings.vectorSearch` is already wired and ready. When AI chat is implemented, the query flow will be:

```ts
// 1. Embed the query (same backend endpoint)
const res = await backendFetchJson<{ embeddings: number[][] }>(
  '/api/embeddings',
  { method: 'POST', body: { texts: [queryText] } }
)
const queryVector = res.data.embeddings[0]

// 2. Search LanceDB
const results = await window.api.embeddings.vectorSearch({
  queryVector,
  limit: 8,
  filterSql: `workspace_id = '${workspaceId}'`   // optional workspace scope
})
// results.rows: [{ note_id, text, chunk_index, _distance, ... }]
```

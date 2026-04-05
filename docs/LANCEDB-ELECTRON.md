# LanceDB in notelab.io (Electron)

This app stores local vector embeddings with [LanceDB](https://lancedb.github.io/lancedb/) **only in the Electron main process**. The renderer (React) never imports `@lancedb/lancedb`; it calls a small IPC surface exposed on `window.api.embeddings`.

## Why main-only

- LanceDB’s Node SDK uses native binaries (Rust/N-API). Those must match Electron’s Node ABI, not the system `node` used for development.
- The renderer is a sandboxed Chromium context: native addons and heavy disk I/O belong in main.

## On-disk location

The database directory is:

`{app.getPath('userData')}/lancedb`

On macOS this is typically under `~/Library/Application Support/notelab.io/lancedb`. It is user-writable and survives app updates.

## IPC API (preload → main)

| Method | Purpose |
|--------|---------|
| `embeddings.getStatus()` | Returns `dbPath` and whether the `note_embeddings` table exists. |
| `embeddings.ensureTable({ vectorDimension })` | Creates the table if missing. Call once you know your embedding size (e.g. 384, 768, 1536). |
| `embeddings.indexNoteEmbeddings({ workspaceId, noteId, vectorDimension, chunks })` | Replaces all rows for that note, then inserts new chunks. Each chunk: `chunkIndex`, `text`, `vector` (and optional `id`). |
| `embeddings.vectorSearch({ queryVector, limit?, filterSql? })` | Nearest-neighbor search; optional LanceDB SQL `filterSql` (e.g. workspace scoping). |
| `embeddings.deleteNoteEmbeddings({ workspaceId, noteId })` | Removes all embeddings for one note. |

Schema (main process): `id`, `workspace_id`, `note_id`, `chunk_index`, `text`, `vector`.

## Renderer usage pattern

1. **Embed** query text in the renderer (WebGPU/WASM model, or remote API), producing a `number[]` or `Float32Array`.
2. **Search** via IPC:

```ts
import { getEmbeddingsApi } from '@/lib/lancedb-embeddings-bridge'

const api = getEmbeddingsApi()
if (!api) return

const ensured = await api.ensureTable({ vectorDimension: 384 })
if (!ensured.ok) { /* handle */ }

const res = await api.vectorSearch({ queryVector: vec, limit: 8 })
if (res.ok) {
  console.log(res.rows)
}
```

3. **Index** after you chunk a note and embed each chunk:

```ts
await api.indexNoteEmbeddings({
  workspaceId,
  noteId,
  vectorDimension: 384,
  chunks: [
    { chunkIndex: 0, text: '…', vector: embedding0 },
    { chunkIndex: 1, text: '…', vector: embedding1 },
  ],
})
```

## Native modules and Electron

If you see `ERR_DLOPEN_FAILED` or ABI mismatch errors, the LanceDB native addon was built for the wrong runtime.

- This project runs **`electron-builder install-app-deps`** on `postinstall`, which rebuilds native dependencies for the pinned Electron version.
- If you add native modules or switch Electron versions, run `npm install` again from the project root, or use [`electron-rebuild`](https://github.com/electron/rebuild) against the same Electron version as `package.json`.

## Build note (electron-vite)

`@lancedb/lancedb` is listed as an **external** dependency for the main process bundle so the loader resolves the package (and its platform-specific `.node` binaries) from `node_modules` at runtime, consistent with other native addons like `electron-liquid-glass`.

## Source files

- Main: `src/main/lancedb-embeddings.ts` — connect, table lifecycle, IPC handlers.
- Registration: `src/main/index.ts` — `registerLancedbEmbeddingsIpc()`.
- Preload: `src/preload/index.ts` — `api.embeddings`.
- Types: `src/preload/index.d.ts`, `src/renderer/src/lib/auth-bridge.ts`.
- Renderer helper: `src/renderer/src/lib/lancedb-embeddings-bridge.ts`.

# Vectra in notelab.io (Electron)

This app stores note embeddings with [Vectra](https://stevenic.github.io/vectra/) in the Electron main process. The renderer never imports Vectra directly; it calls the preload bridge on `window.api.embeddings`.

## Why main-only

- The renderer already depends on main-process IPC for authenticated fetches, workspace filesystem access, and local Ollama.
- Keeping the index in main lets the app use one workspace-scoped storage path regardless of whether embeddings come from local Ollama or the remote `/api/embeddings` endpoint.

## On-disk location

Each workspace keeps its own Vectra index under:

`<workspaceRoot>/.notelab/vectra`

This keeps the embeddings alongside the workspace instead of in global app data.

## IPC API

| Method                                                                                                           | Purpose                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `embeddings.getStatus({ workspacePath })`                                                                        | Returns the Vectra index path and current document/chunk counts.                      |
| `embeddings.ensureIndex({ workspacePath })`                                                                      | Creates or validates the workspace-local Vectra index.                                |
| `embeddings.getIndexedHashes({ workspacePath })`                                                                 | Returns `noteId -> { contentHash, workspaceId }` for incremental reindex checks.      |
| `embeddings.upsertNoteDocument({ workspacePath, workspaceId, noteId, title, kind, contentHash, text, docType })` | Replaces the indexed representation of one note.                                      |
| `embeddings.searchDocuments({ workspacePath, query, filter, ... })`                                              | Runs Vectra `queryDocuments()` and returns rendered text sections plus note metadata. |
| `embeddings.deleteNoteDocument({ workspacePath, noteId })`                                                       | Deletes one note from the workspace index.                                            |
| `embeddings.deleteWorkspaceDocuments({ workspacePath, workspaceId })`                                            | Deletes all indexed notes for one workspace folder.                                   |
| `embeddings.dumpIndex({ workspacePath })`                                                                        | Dumps document metadata for debugging.                                                |

## Retrieval model

- Storage and retrieval use `LocalDocumentIndex`.
- Document metadata includes `workspaceId`, `noteId`, `title`, `kind`, and `contentHash`.
- Filtering uses Vectra metadata filters instead of SQL strings.
- Query embedding happens in main through a small `EmbeddingsModel` adapter:
  - local Ollama `bge-m3` when present
  - authenticated `/api/embeddings` fallback otherwise

## Source files

- Main: `src/main/vectra-embeddings.ts`
- Registration: `src/main/index.ts`
- Preload bridge: `src/preload/index.ts`
- Shared renderer types: `src/preload/index.d.ts`, `src/renderer/src/lib/auth-bridge.ts`
- Renderer helper: `src/renderer/src/lib/embeddings-bridge.ts`

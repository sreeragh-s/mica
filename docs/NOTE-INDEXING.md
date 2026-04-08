# Note Indexing — Vectra Guide

Semantic indexing of notes and drawings uses `bge-m3` embeddings and a workspace-local Vectra `LocalDocumentIndex`.

## Architecture overview

```text
Renderer (React)
  └─ embedding-pipeline.ts
       normalize note content
       compare content hashes
       call window.api.embeddings.*

Electron preload
  └─ exposes window.api.embeddings

Main process
  └─ vectra-embeddings.ts
       <workspaceRoot>/.notelab/vectra
       LocalDocumentIndex
       local Ollama or /api/embeddings

Server (Cloudflare Worker)
  └─ POST /api/embeddings
       authenticated bge-m3 fallback
```

## Storage model

- Every workspace keeps its own index at `<workspaceRoot>/.notelab/vectra`.
- Notes are stored as Vectra documents, not raw chunk rows.
- Metadata stored with each document:
  - `workspaceId`
  - `noteId`
  - `title`
  - `kind`
  - `contentHash`

## Indexing flow

1. The renderer computes a SHA-256 `contentHash` from the full note content.
2. If the stored hash matches, the note is skipped.
3. Notes are normalized before indexing:
   - markdown notes use the raw markdown body
   - drawings index extracted Excalidraw text only
4. The renderer asks main to `upsertNoteDocument(...)`.
5. Main lets Vectra chunk, embed, and store the note.

## Retrieval flow

1. The chat hook sends the raw query text to main.
2. Main calls Vectra `queryDocuments()` for the active workspace.
3. Results are filtered with metadata filters such as:
   - `{ workspaceId: { $eq: ... } }`
   - `{ noteId: { $in: [...] } }`
4. Main renders top sections and sends them back to the renderer as chat sources.

## Embedding providers

The main process chooses embeddings in this order:

1. Local Ollama `bge-m3` if it is installed and running.
2. Authenticated `POST /api/embeddings` fallback through the app's auth session.

This keeps retrieval and indexing on the same embedding model regardless of where the vectors are generated.

## Operational notes

- Deleting a note deletes its indexed document.
- Deleting a workspace folder deletes all documents whose metadata matches that `workspaceId`.
- Reindexing does not migrate old app-global stores; it rebuilds the new workspace-local Vectra index from note contents.

## Useful files

- `src/main/vectra-embeddings.ts`
- `src/preload/index.ts`
- `src/renderer/src/lib/embedding-pipeline.ts`
- `src/renderer/src/hooks/useNotesChat.ts`
- `src/renderer/src/components/notes/useNotesApp.ts`

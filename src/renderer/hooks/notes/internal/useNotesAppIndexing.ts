import { useCallback, useRef, type MutableRefObject } from 'react'

import {
  buildIndexingStatus,
  indexNote,
  type IndexingNoteStatus
} from '@/lib/ai/embedding-pipeline'
import { getApi } from '@/bridges/auth/auth-bridge'
import { useNotesStore } from '@/stores/notes/useNotesStore'

import { summarizeIndexingCounts } from './shared'

type UseNotesAppIndexingArgs = {
  dataRootRef: MutableRefObject<string | null>
}

export function useNotesAppIndexing({ dataRootRef }: UseNotesAppIndexingArgs) {
  const { indexingStatus, setIndexingStatus } = useNotesStore()
  /** Used to abort an in-progress indexing run when a new one starts. */
  const indexingAbortRef = useRef(false)

  /** Load all notes from disk and compare hashes to determine pending status. */
  const refreshIndexingStatus = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readNotelabIndex) return
    const idx = await api.workspace.readNotelabIndex({ cwd })
    if (!idx.ok) return
    const allNotes = idx.notes.map((n) => ({
      folder: n.folder,
      note: n.note,
      title: n.title,
      content: n.markdownBody,
      kind: n.kind
    }))
    const status = await buildIndexingStatus(cwd, allNotes)
    setIndexingStatus((prev) => ({ ...status, running: prev.running }))
  }, [dataRootRef])

  /** Index only notes that are new or have changed content. */
  const runIndexPending = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readNotelabIndex) return
    indexingAbortRef.current = false

    const idx = await api.workspace.readNotelabIndex({ cwd })
    if (!idx.ok) {
      return
    }

    const allNotes = idx.notes.map((note) => ({
      folder: note.folder,
      note: note.note,
      title: note.title,
      content: note.markdownBody,
      kind: note.kind
    }))
    const nextStatus = await buildIndexingStatus(cwd, allNotes)
    setIndexingStatus({ ...nextStatus, running: true })

    const pendingNoteIds = new Set(
      nextStatus.notes.filter((note) => note.state === 'pending').map((note) => note.note)
    )
    if (pendingNoteIds.size === 0) {
      setIndexingStatus((prev) => ({ ...prev, running: false }))
      return
    }

    await api.embeddings?.ensureIndex?.({ workspacePath: cwd })

    const hashRes = await api.embeddings?.getIndexedHashes?.({ workspacePath: cwd })
    const storedHashes = hashRes?.ok ? hashRes.hashes : {}

    const toIndex = idx.notes.filter((note) => pendingNoteIds.has(note.note))

    for (const n of toIndex) {
      if (indexingAbortRef.current) break
      setIndexingStatus((prev) => ({
        running: prev.running,
        ...(() => {
          const notes = prev.notes.map((ns) =>
            ns.note === n.note ? { ...ns, state: 'indexing' as const, error: undefined } : ns
          )
          return {
            notes,
            ...summarizeIndexingCounts(notes)
          }
        })()
      }))
      const result = await indexNote({
        workspacePath: cwd,
        folder: n.folder,
        note: n.note,
        title: n.title,
        content: n.markdownBody,
        kind: n.kind,
        storedHash: storedHashes[n.note]?.contentHash
      })
      setIndexingStatus((prev) => ({
        running: prev.running,
        ...(() => {
          const nextState: IndexingNoteStatus['state'] = result.ok ? 'indexed' : 'error'
          const notes = prev.notes.map((ns) =>
            ns.note === n.note
              ? {
                  ...ns,
                  state: nextState,
                  ...(result.ok ? { error: undefined } : { error: result.error })
                }
              : ns
          )
          return {
            notes,
            ...summarizeIndexingCounts(notes)
          }
        })()
      }))
    }

    setIndexingStatus((prev) => ({ ...prev, running: false }))
  }, [dataRootRef])

  /** Force re-embed all notes regardless of stored hashes. */
  const runReindexAll = useCallback(async () => {
    const api = getApi()
    const cwd = dataRootRef.current
    if (!cwd || !api?.workspace?.readNotelabIndex) return
    indexingAbortRef.current = false
    setIndexingStatus((prev) => ({ ...prev, running: true }))

    const idx = await api.workspace.readNotelabIndex({ cwd })
    if (!idx.ok) {
      setIndexingStatus((prev) => ({ ...prev, running: false }))
      return
    }

    await api.embeddings?.ensureIndex?.({ workspacePath: cwd })

    const updated: Record<string, IndexingNoteStatus['state']> = {}

    for (const n of idx.notes) {
      if (indexingAbortRef.current) break
      setIndexingStatus((prev) => ({
        ...prev,
        notes: prev.notes.map((ns) => (ns.note === n.note ? { ...ns, state: 'indexing' } : ns))
      }))
      // Pass no storedHash to force re-embed
      const result = await indexNote({
        workspacePath: cwd,
        folder: n.folder,
        note: n.note,
        title: n.title,
        content: n.markdownBody,
        kind: n.kind
      })
      updated[n.note] = result.ok ? 'indexed' : 'error'
      // Notes with no indexable content are treated as 'indexed' (buildIndexingStatus handles them)
    }

    setIndexingStatus((prev) => ({
      ...prev,
      running: false,
      notes: prev.notes.map((ns) =>
        updated[ns.note] !== undefined ? { ...ns, state: updated[ns.note]! } : ns
      ),
      pendingCount: 0,
      indexedCount: prev.notes.filter((ns) => updated[ns.note] === 'indexed').length
    }))
  }, [dataRootRef])

  return {
    indexingStatus,
    refreshIndexingStatus,
    runIndexPending,
    runReindexAll
  }
}

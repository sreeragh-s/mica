import { useCallback, useEffect, useRef, useState } from 'react'

import type { SavedNote } from '@/lib/notes/notes-storage'
import type {
  NotesPropertyCatalog,
  NotesWorkspaceCacheSnapshot,
  WorkspaceLinkMentionIndex
} from '@/lib/notes/cache/notes-cache-types'
import {
  clearNotesWorkspaceCache,
  reindexNotesWorkspaceCache,
  resolveNotesWorkspaceCacheKey
} from '@/lib/notes/cache/sync-notes-cache'

const DEBOUNCE_MS = 520

export function useWorkspaceNotesCache(
  dataRootPath: string | null,
  notes: SavedNote[]
): {
  workspaceKey: string | null
  notesSearchPlainTextByPath: ReadonlyMap<string, string> | null
  notesPropertyCatalog: NotesPropertyCatalog | null
  notesLinkMentionIndex: WorkspaceLinkMentionIndex | null
  notesCacheIndexedAt: number | null
  reindexNotesWorkspaceCacheNow: () => Promise<void>
  clearWorkspaceCache: () => Promise<void>
} {
  const workspaceKey = resolveNotesWorkspaceCacheKey(dataRootPath)
  const [snapshot, setSnapshot] = useState<{
    workspaceKey: string
    data: NotesWorkspaceCacheSnapshot
  } | null>(null)
  const genRef = useRef(0)
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  const runIndex = useCallback(async (key: string, noteList: SavedNote[]) => {
    const gen = ++genRef.current
    try {
      const next = await reindexNotesWorkspaceCache(key, noteList)
      if (gen !== genRef.current) return
      setSnapshot({ workspaceKey: key, data: next })
    } catch (e) {
      console.error('[notelab] notes cache reindex failed', e)
    }
  }, [])

  const runIndexRef = useRef(runIndex)
  runIndexRef.current = runIndex

  useEffect(() => {
    if (!workspaceKey) {
      genRef.current += 1
      return
    }
    const t = window.setTimeout(() => {
      void runIndexRef.current(workspaceKey, notesRef.current)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
    // runIndexRef.current is stable via ref — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey, notes])

  const reindexNotesWorkspaceCacheNow = useCallback(async () => {
    const key = resolveNotesWorkspaceCacheKey(dataRootPath)
    if (!key) return
    await runIndex(key, notesRef.current)
  }, [dataRootPath, runIndex])

  const clearWorkspaceCache = useCallback(async () => {
    const key = resolveNotesWorkspaceCacheKey(dataRootPath)
    if (!key) return
    await clearNotesWorkspaceCache(key)
    await runIndex(key, notesRef.current)
  }, [dataRootPath, runIndex])

  const active =
    workspaceKey && snapshot && snapshot.workspaceKey === workspaceKey ? snapshot.data : null

  return {
    workspaceKey,
    notesSearchPlainTextByPath: active?.plainTextByPath ?? null,
    notesPropertyCatalog: active !== null ? active.propertyCatalog : null,
    notesLinkMentionIndex: active?.linkMentionIndex ?? null,
    notesCacheIndexedAt: active?.indexedAt ?? null,
    reindexNotesWorkspaceCacheNow,
    clearWorkspaceCache
  }
}

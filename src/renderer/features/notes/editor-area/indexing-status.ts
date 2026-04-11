import type { NotesAppViewModel } from '@/features/notes/app-state/useNotesApp'

export function countIndexingStates(notes: NotesAppViewModel['indexingStatus']['notes']): {
  totalCount: number
  pendingCount: number
  indexingCount: number
  indexedCount: number
  errorCount: number
} {
  let pendingCount = 0
  let indexingCount = 0
  let indexedCount = 0
  let errorCount = 0

  for (const note of notes) {
    if (note.state === 'pending') pendingCount++
    else if (note.state === 'indexing') indexingCount++
    else if (note.state === 'indexed') indexedCount++
    else if (note.state === 'error') errorCount++
  }

  return { totalCount: notes.length, pendingCount, indexingCount, indexedCount, errorCount }
}

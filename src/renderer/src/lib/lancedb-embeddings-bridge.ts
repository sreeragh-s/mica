import type { GitNotesApi } from '@/lib/auth-bridge'

/** Main-process LanceDB embedding store exposed via preload (`window.api.embeddings`). */
export function getEmbeddingsApi(): GitNotesApi['embeddings'] | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { api?: GitNotesApi }
  return w.api?.embeddings ?? null
}

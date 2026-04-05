import type { NotelabApi } from '@/lib/auth-bridge'

/** Main-process LanceDB embedding store exposed via preload (`window.api.embeddings`). */
export function getEmbeddingsApi(): NotelabApi['embeddings'] | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { api?: NotelabApi }
  return w.api?.embeddings ?? null
}

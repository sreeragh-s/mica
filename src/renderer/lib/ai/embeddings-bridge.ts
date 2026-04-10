import type { NotelabApi } from '@/lib/auth/auth-bridge'

/** Main-process embeddings store exposed via preload (`window.api.embeddings`). */
export function getEmbeddingsApi(): NotelabApi['embeddings'] | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { api?: NotelabApi }
  return w.api?.embeddings ?? null
}

import type { NotelabApi } from '@/bridges/auth/auth-bridge'
import { getRendererApi } from '@/bridges/auth/auth-bridge'

export function getOllamaApi(): NotelabApi['ollama'] | null {
  return getRendererApi()?.ollama ?? null
}

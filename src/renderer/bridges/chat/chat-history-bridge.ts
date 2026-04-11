import type { NotelabApi } from '@/bridges/auth/auth-bridge'
import { getRendererApi } from '@/bridges/auth/auth-bridge'

export function getChatHistoryApi(): NotelabApi['chatHistory'] | null {
  return getRendererApi()?.chatHistory ?? null
}

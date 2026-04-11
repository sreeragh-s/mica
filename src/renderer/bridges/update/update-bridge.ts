import type { NotelabApi } from '@/bridges/auth/auth-bridge'
import { getRendererApi } from '@/bridges/auth/auth-bridge'

export function getUpdaterApi(): NotelabApi['updater'] | null {
  return getRendererApi()?.updater ?? null
}

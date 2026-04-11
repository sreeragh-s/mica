import type { NotelabApi } from '@/bridges/auth/auth-bridge'
import { getRendererApi } from '@/bridges/auth/auth-bridge'

export function getWorkspaceApi(): NotelabApi['workspace'] | null {
  return getRendererApi()?.workspace ?? null
}

export function getLogApi(): NotelabApi['log'] | null {
  return getRendererApi()?.log ?? null
}

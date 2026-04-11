import { getApi } from '@/lib/auth/auth-bridge'

function baseUrl(): string {
  const u = import.meta.env.VITE_AUTH_URL?.trim() ?? ''
  return u.replace(/\/$/, '')
}

export async function serverFetchJson<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const api = getApi()
  const b = baseUrl()
  if (!b) {
    return { ok: false, status: 0, message: 'VITE_AUTH_URL is not set' }
  }
  const url = `${b}${path.startsWith('/') ? path : `/${path}`}`
  const body = init?.body != null ? JSON.stringify(init.body) : undefined
  const r = await api?.auth?.fetch?.(url, {
    method: init?.method ?? 'GET',
    body
  })
  if (!r) {
    return { ok: false, status: 0, message: 'Auth API unavailable' }
  }
  if (!r.ok) {
    let message = r.body
    try {
      const j = JSON.parse(r.body) as { error?: string; message?: string; reason?: string }
      message = j.message ?? j.reason ?? j.error ?? r.body
    } catch {
      /* raw */
    }
    return { ok: false, status: r.status, message }
  }
  try {
    const data = JSON.parse(r.body) as T
    return { ok: true, data }
  } catch {
    return { ok: false, status: r.status, message: r.body }
  }
}

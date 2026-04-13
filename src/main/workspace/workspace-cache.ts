import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

interface CacheEntry {
  content: string
  updatedAtMs: number
  mtimeMs: number
}

const MAX_CACHE_SIZE = 50
const cache = new Map<string, CacheEntry>()
const accessOrder: string[] = []

function evictIfNeeded(): void {
  while (accessOrder.length > MAX_CACHE_SIZE) {
    const oldest = accessOrder.shift()
    if (oldest) {
      cache.delete(oldest)
    }
  }
}

function updateAccess(key: string): void {
  const idx = accessOrder.indexOf(key)
  if (idx !== -1) {
    accessOrder.splice(idx, 1)
  }
  accessOrder.push(key)
}

export async function readNoteTextWithCache(
  cwd: string,
  relativePath: string
): Promise<{ content: string; updatedAtMs: number }> {
  const key = `${cwd}:${relativePath}`
  const cached = cache.get(key)

  if (cached) {
    try {
      const fileStat = await stat(join(cwd, relativePath))
      if (fileStat.mtimeMs === cached.mtimeMs) {
        updateAccess(key)
        return { content: cached.content, updatedAtMs: cached.updatedAtMs }
      }
    } catch {
      cache.delete(key)
    }
  }

  const filePath = join(cwd, relativePath)
  const [content, fileStat] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)])

  cache.set(key, {
    content,
    updatedAtMs: Date.now(),
    mtimeMs: fileStat.mtimeMs
  })
  accessOrder.push(key)
  evictIfNeeded()

  return { content, updatedAtMs: fileStat.mtimeMs }
}

export function invalidateNoteCache(cwd: string, relativePath: string): void {
  const key = `${cwd}:${relativePath}`
  cache.delete(key)
  const idx = accessOrder.indexOf(key)
  if (idx !== -1) {
    accessOrder.splice(idx, 1)
  }
}

export function invalidateWorkspaceCache(cwd: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${cwd}:`)) {
      cache.delete(key)
    }
  }
  for (let i = accessOrder.length - 1; i >= 0; i--) {
    if (accessOrder[i].startsWith(`${cwd}:`)) {
      accessOrder.splice(i, 1)
    }
  }
}

export function clearAllNoteCache(): void {
  cache.clear()
  accessOrder.length = 0
}

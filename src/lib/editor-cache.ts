type CachedContentEntry = {
  content: string
  path: string
}

type CachedParsedEntry = {
  blocks: unknown[]
  path: string
  sourceContent: string
}

const CONTENT_CACHE_LIMIT = 48
const PARSED_CACHE_LIMIT = 16

const contentCache = new Map<string, CachedContentEntry>()
const parsedCache = new Map<string, CachedParsedEntry>()

function cloneBlocks(blocks: unknown[]): unknown[] {
  if (typeof structuredClone === "function") {
    return structuredClone(blocks)
  }
  return JSON.parse(JSON.stringify(blocks)) as unknown[]
}

function trimCache<T>(cache: Map<string, T>, limit: number) {
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) return
    cache.delete(oldestKey)
  }
}

export function cacheEditorContent(path: string, content: string) {
  if (contentCache.has(path)) {
    contentCache.delete(path)
  }
  contentCache.set(path, { path, content })
  trimCache(contentCache, CONTENT_CACHE_LIMIT)
}

export function getCachedEditorContent(path: string): string | null {
  const entry = contentCache.get(path)
  if (!entry) return null
  contentCache.delete(path)
  contentCache.set(path, entry)
  return entry.content
}

export function cacheParsedEditorBlocks(path: string, sourceContent: string, blocks: unknown[]) {
  if (parsedCache.has(path)) {
    parsedCache.delete(path)
  }
  parsedCache.set(path, {
    path,
    sourceContent,
    blocks: cloneBlocks(blocks),
  })
  trimCache(parsedCache, PARSED_CACHE_LIMIT)
}

export function readParsedEditorBlocks(path: string, sourceContent: string): unknown[] | null {
  const entry = parsedCache.get(path)
  if (!entry || entry.sourceContent !== sourceContent) return null
  parsedCache.delete(path)
  parsedCache.set(path, entry)
  return cloneBlocks(entry.blocks)
}

export function moveEditorCachePath(previousPath: string, nextPath: string) {
  const contentEntry = contentCache.get(previousPath)
  if (contentEntry) {
    contentCache.delete(previousPath)
    contentCache.set(nextPath, { ...contentEntry, path: nextPath })
  }

  const parsedEntry = parsedCache.get(previousPath)
  if (parsedEntry) {
    parsedCache.delete(previousPath)
    parsedCache.set(nextPath, { ...parsedEntry, path: nextPath })
  }
}

export function clearEditorCache(path?: string) {
  if (!path) {
    contentCache.clear()
    parsedCache.clear()
    return
  }

  contentCache.delete(path)
  parsedCache.delete(path)
}

import { watch, type WatchEventType } from 'node:fs'
import { relative } from 'node:path'
import { BrowserWindow } from 'electron'
import { invalidateNoteCache } from './workspace-cache'

type FileChangeCallback = (eventType: WatchEventType, relativePath: string) => void

interface WatcherEntry {
  path: string
  watcher: ReturnType<typeof watch>
  callbacks: Set<FileChangeCallback>
  debounceTimer: NodeJS.Timeout | null
  pendingEvents: Map<string, WatchEventType>
}

const watchers = new Map<string, WatcherEntry>()
const DEBOUNCE_MS = 150

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

function sendFileChangeEvent(cwd: string, eventType: WatchEventType, relativePath: string): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('workspace:file-changed', {
    cwd,
    eventType,
    relativePath
  })
}

export function startWatching(cwd: string, callback?: FileChangeCallback): string {
  if (watchers.has(cwd)) {
    const entry = watchers.get(cwd)!
    if (callback) {
      entry.callbacks.add(callback)
    }
    return cwd
  }

  const pendingEvents = new Map<string, WatchEventType>()
  let debounceTimer: NodeJS.Timeout | null = null

  const flushEvents = (): void => {
    if (pendingEvents.size === 0) return

    for (const [relativePath, eventType] of pendingEvents) {
      sendFileChangeEvent(cwd, eventType, relativePath)
    }

    const entry = watchers.get(cwd)
    if (entry) {
      for (const cb of entry.callbacks) {
        for (const [relativePath, evt] of pendingEvents) {
          cb(evt, relativePath)
        }
      }
    }

    pendingEvents.clear()
    debounceTimer = null
  }

  const handleEvent = (eventType: WatchEventType, filename: string | null): void => {
    if (!filename) return

    const relativePath = relative(cwd, filename).replace(/\\/g, '/')
    if (!relativePath || relativePath.startsWith('..')) return

    invalidateNoteCache(cwd, relativePath)
    pendingEvents.set(relativePath, eventType)

    if (!debounceTimer) {
      debounceTimer = setTimeout(flushEvents, DEBOUNCE_MS)
    }
  }

  const watcher = watch(cwd, { recursive: true }, handleEvent)

  watcher.on('error', (err) => {
    console.error('[FileWatcher] Error:', err.message)
  })

  const entry: WatcherEntry = {
    path: cwd,
    watcher,
    callbacks: new Set(callback ? [callback] : []),
    debounceTimer,
    pendingEvents
  }

  watchers.set(cwd, entry)
  console.log('[FileWatcher] Started watching:', cwd)

  return cwd
}

export function stopWatching(cwd: string): void {
  const entry = watchers.get(cwd)
  if (!entry) return

  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer)
  }

  entry.watcher.close()
  watchers.delete(cwd)
  console.log('[FileWatcher] Stopped watching:', cwd)
}

export function stopAllWatchers(): void {
  for (const [cwd] of watchers) {
    stopWatching(cwd)
  }
}

export function isWatching(cwd: string): boolean {
  return watchers.has(cwd)
}

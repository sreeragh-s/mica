/**
 * In-app update checker.
 *
 * Polls NOTELAB_SERVER_URL/api/app/latest-version on a schedule, compares
 * the response version against the running app version, and broadcasts
 * update state to all renderer windows via IPC.
 *
 * Expected API response shape:
 *   { version: "1.0.5", download_url: "https://..." }
 *
 * IPC channels (main → renderer):
 *   notelab:update-available  — { version: string, downloadUrl: string }
 *   notelab:update-state      — { status: 'idle'|'available'|'downloading'|'ready'|'error', ... }
 *
 * IPC channels (renderer → main, via ipcMain.handle):
 *   update:check              — trigger an immediate check
 *   update:download-and-install — open the download URL in the system browser
 *                                 (actual in-process download is not feasible for DMG/zip;
 *                                  instead we open the download link and ask the user to restart)
 */

import { app, ipcMain, BrowserWindow, shell } from 'electron'
import { net } from 'electron'
import log from 'electron-log/main'

declare const __APP_SERVER_URL__: string

    
type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; downloadUrl: string }
  | { status: 'error'; message: string }

let currentState: UpdateState = { status: 'idle' }
let checkInterval: ReturnType<typeof setInterval> | null = null

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

function broadcastState(state: UpdateState): void {
  currentState = state
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('notelab:update-state', state)
    }
  }
}

function semverGt(a: string, b: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [aMaj, aMin, aPatch] = parse(a)
  const [bMaj, bMin, bPatch] = parse(b)
  if (aMaj !== bMaj) return aMaj > bMaj
  if (aMin !== bMin) return aMin > bMin
  return aPatch > bPatch
}

async function checkForUpdates(): Promise<void> {
  const serverUrl = __APP_SERVER_URL__
  if (!serverUrl) return

  const endpoint = `${serverUrl}/api/app/latest-version`

  try {
    log.info('[updater] Checking for updates at', endpoint)
    const request = net.fetch(endpoint, {
      headers: { 'User-Agent': `notelab/${app.getVersion()}` },
    })
    const res = await request
    if (!res.ok) {
      log.warn('[updater] Update check failed, status:', res.status)
      return
    }
    const data = (await res.json()) as { version?: string; download_url?: string }
    const remoteVersion = data.version
    const downloadUrl = data.download_url

    if (!remoteVersion || !downloadUrl) {
      log.warn('[updater] Invalid update response:', data)
      return
    }

    const currentVersion = app.getVersion()
    log.info(`[updater] current=${currentVersion} remote=${remoteVersion}`)

    if (semverGt(remoteVersion, currentVersion)) {
      log.info('[updater] Update available:', remoteVersion)
      broadcastState({ status: 'available', version: remoteVersion, downloadUrl })
    } else {
      if (currentState.status !== 'idle') {
        broadcastState({ status: 'idle' })
      }
    }
  } catch (err) {
    log.warn('[updater] Update check error:', err)
    // Don't broadcast error state for network failures — silent fail
  }
}

export function registerUpdaterIpc(): void {
  ipcMain.handle('update:check', async () => {
    await checkForUpdates()
    return currentState
  })

  ipcMain.handle('update:get-state', () => {
    return currentState
  })

  // Open the download URL in the system browser, then prompt the user to restart.
  // (DMG/zip installs can't be done in-process without elevated privileges.)
  ipcMain.handle('update:open-download', async (_event, downloadUrl: string) => {
    try {
      await shell.openExternal(downloadUrl)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  // Start periodic background checks (after a short delay so the app is ready)
  setTimeout(() => {
    void checkForUpdates()
  }, 10_000)

  checkInterval = setInterval(() => {
    void checkForUpdates()
  }, CHECK_INTERVAL_MS)

  app.on('before-quit', () => {
    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }
  })
}

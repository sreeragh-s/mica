import { create } from "zustand"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

export type UpdaterStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string }

type UpdaterStore = {
  status: UpdaterStatus
  setStatus: (status: UpdaterStatus) => void
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  status: { phase: "idle" },
  setStatus: (status) => set({ status }),
}))

let armed = false
let pendingUpdate: Update | null = null

async function runCheckOnce() {
  const { setStatus } = useUpdaterStore.getState()
  setStatus({ phase: "checking" })
  try {
    const update = await check()
    if (!update) {
      setStatus({ phase: "idle" })
      return
    }
    pendingUpdate = update
    setStatus({ phase: "available", version: update.version })
  } catch (err) {
    setStatus({
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Schedule a single update check for this app launch.
 *
 * Online → check now. Offline → check the moment connectivity returns,
 * exactly once. Quitting and relaunching re-arms naturally because this
 * module re-initializes.
 */
export function armUpdateCheck() {
  if (armed) return
  armed = true

  if (typeof navigator === "undefined") return
  if (navigator.onLine) {
    void runCheckOnce()
    return
  }
  window.addEventListener("online", () => void runCheckOnce(), { once: true })
}

export async function applyUpdate() {
  if (!pendingUpdate) return
  const { setStatus } = useUpdaterStore.getState()
  let total = 0
  let downloaded = 0
  try {
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0
        setStatus({ phase: "downloading", percent: 0 })
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength
        const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0
        setStatus({ phase: "downloading", percent })
      } else if (event.event === "Finished") {
        setStatus({ phase: "ready", version: pendingUpdate?.version ?? "" })
      }
    })
    await relaunch()
  } catch (err) {
    setStatus({
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

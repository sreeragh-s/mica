import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import { getUpdaterApi } from '@/bridges/update/update-bridge'

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; downloadUrl: string }
  | { status: 'error'; message: string }

export function UpdateBanner(): JSX.Element | null {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    const updaterApi = getUpdaterApi()
    if (!updaterApi) return

    // Get current state on mount
    void updaterApi.getState().then((s) => {
      setUpdateState(s as UpdateState)
    })

    // Listen for state changes pushed from main
    const cleanup = updaterApi.onStateChange((state) => {
      setUpdateState(state as UpdateState)
      // Reset dismissed when a new version arrives
      if (state.status === 'available') setDismissed(false)
    })

    return cleanup
  }, [])

  if (dismissed || updateState.status !== 'available') return null

  const { version, downloadUrl } = updateState

  async function handleDownload(): Promise<void> {
    const updaterApi = getUpdaterApi()
    if (!updaterApi) return
    setOpening(true)
    await updaterApi.openDownload(downloadUrl)
    setOpening(false)
  }

  return (
    <div className="bg-primary text-primary-foreground flex items-center justify-between gap-3 px-4 py-2 text-sm">
      <span>
        <strong>notelab {version}</strong> is available.{' '}
        <span className="opacity-75">Download and reinstall to update.</span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => void handleDownload()}
          disabled={opening}
          className="rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 disabled:opacity-50"
        >
          {opening ? 'Opening…' : 'Download update'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded px-2 py-1 text-xs opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/**
 * useOllama — manages local Ollama server state in the renderer.
 *
 * Exposes:
 *   - status: running / downloaded / version
 *   - localModels: list of pulled models
 *   - downloadOllama(): start binary download (with progress)
 *   - startOllama(): start the server
 *   - stopOllama(): stop the server
 *   - refreshModels(): re-fetch installed models
 *   - pullModel(name, callbacks): pull a model with streaming progress
 *   - deleteModel(name): remove a model
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type OllamaLocalModel = {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details?: {
    format?: string
    family?: string
    parameter_size?: string
    quantization_level?: string
  }
}

export type OllamaStatus = {
  running: boolean
  downloaded: boolean
  version: string | null
}

export type UseOllamaResult = {
  status: OllamaStatus | null
  statusLoading: boolean
  localModels: OllamaLocalModel[]
  modelsLoading: boolean
  downloadProgress: number | null // 0–100 while downloading, null otherwise
  downloadMessage: string
  refreshStatus: () => Promise<void>
  refreshModels: () => Promise<void>
  downloadOllama: () => void
  startOllama: () => Promise<{ ok: boolean; error?: string }>
  stopOllama: () => Promise<{ ok: boolean; error?: string }>
  pullModel: (
    modelName: string,
    callbacks?: {
      onProgress?: (status: string, completed: number, total: number) => void
      onEnd?: () => void
      onError?: (message: string) => void
    }
  ) => () => void
  deleteModel: (modelName: string) => Promise<{ ok: boolean; error?: string }>
}

export function useOllama(): UseOllamaResult {
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [localModels, setLocalModels] = useState<OllamaLocalModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [downloadMessage, setDownloadMessage] = useState('')

  const cleanupRef = useRef<(() => void) | null>(null)

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true)
    const res = await window.api.ollama.getStatus()
    if (res.ok) {
      setStatus({ running: res.running, downloaded: res.downloaded, version: res.version })
    }
    setStatusLoading(false)
  }, [])

  const refreshModels = useCallback(async () => {
    setModelsLoading(true)
    const res = await window.api.ollama.listModels()
    if (res.ok) {
      setLocalModels(res.models as OllamaLocalModel[])
    } else {
      setLocalModels([])
    }
    setModelsLoading(false)
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // When Ollama is running, fetch models
  useEffect(() => {
    if (status?.running) {
      void refreshModels()
    } else {
      setLocalModels([])
    }
  }, [status?.running, refreshModels])

  const downloadOllama = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    setDownloadProgress(0)
    setDownloadMessage('Starting download…')
    const cleanup = window.api.ollama.download({
      onProgress: (percent, message) => {
        setDownloadProgress(percent)
        setDownloadMessage(message)
      },
      onEnd: (_version) => {
        setDownloadProgress(null)
        setDownloadMessage('')
        void refreshStatus()
      },
      onError: (msg) => {
        setDownloadProgress(null)
        setDownloadMessage('')
        console.error('[useOllama] download error:', msg)
        void refreshStatus()
      }
    })
    cleanupRef.current = cleanup
  }, [refreshStatus])

  const startOllama = useCallback(async () => {
    const res = await window.api.ollama.start()
    if (res.ok) {
      await refreshStatus()
      if (status?.running || res.alreadyRunning) {
        await refreshModels()
      }
    }
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  }, [refreshStatus, refreshModels, status])

  const stopOllama = useCallback(async () => {
    const res = await window.api.ollama.stop()
    await refreshStatus()
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  }, [refreshStatus])

  const pullModel = useCallback(
    (
      modelName: string,
      callbacks?: {
        onProgress?: (status: string, completed: number, total: number) => void
        onEnd?: () => void
        onError?: (message: string) => void
      }
    ) => {
      const cleanup = window.api.ollama.pullModel(modelName, {
        onProgress: (s, c, t) => callbacks?.onProgress?.(s, c, t),
        onEnd: () => {
          void refreshModels()
          callbacks?.onEnd?.()
        },
        onError: (msg) => callbacks?.onError?.(msg)
      })
      return cleanup
    },
    [refreshModels]
  )

  const deleteModel = useCallback(
    async (modelName: string) => {
      const res = await window.api.ollama.deleteModel(modelName)
      if (res.ok) await refreshModels()
      return res.ok ? { ok: true } : { ok: false, error: res.error }
    },
    [refreshModels]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  return {
    status,
    statusLoading,
    localModels,
    modelsLoading,
    downloadProgress,
    downloadMessage,
    refreshStatus,
    refreshModels,
    downloadOllama,
    startOllama,
    stopOllama,
    pullModel,
    deleteModel
  }
}

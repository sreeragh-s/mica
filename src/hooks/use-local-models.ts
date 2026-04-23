import * as React from "react"
import {
  fetchOllamaStatus,
  getConfiguredLocalModels,
  loadSelectedLocalModelIds,
  LOCAL_MODEL_SETTINGS_EVENT,
  saveSelectedLocalModelIds,
  type OllamaStatus,
} from "@/lib/local-models"

const EMPTY_OLLAMA_STATUS: OllamaStatus = {
  installed: false,
  running: false,
  models: [],
  error: null,
}

export function useLocalModels() {
  const [selectedModelIds, setSelectedModelIds] = React.useState<string[]>(() =>
    loadSelectedLocalModelIds(),
  )
  const [ollamaStatus, setOllamaStatus] = React.useState<OllamaStatus>(EMPTY_OLLAMA_STATUS)
  const [isLoading, setIsLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const status = await fetchOllamaStatus()
      setOllamaStatus(status)
    } catch (error) {
      setOllamaStatus({
        installed: false,
        running: false,
        models: [],
        error: error instanceof Error ? error.message : "Failed to load Ollama models.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    const syncSelectedModels = () => {
      setSelectedModelIds(loadSelectedLocalModelIds())
    }

    window.addEventListener("storage", syncSelectedModels)
    window.addEventListener(LOCAL_MODEL_SETTINGS_EVENT, syncSelectedModels)

    return () => {
      window.removeEventListener("storage", syncSelectedModels)
      window.removeEventListener(LOCAL_MODEL_SETTINGS_EVENT, syncSelectedModels)
    }
  }, [])

  const configuredModels = React.useMemo(
    () => getConfiguredLocalModels(ollamaStatus, selectedModelIds),
    [ollamaStatus, selectedModelIds],
  )

  const setSelectedIds = React.useCallback((nextSelectedModelIds: string[]) => {
    saveSelectedLocalModelIds(nextSelectedModelIds)
    setSelectedModelIds(loadSelectedLocalModelIds())
  }, [])

  const toggleModel = React.useCallback(
    (modelName: string, aliases: string[] = []) => {
      const candidateIds = new Set([modelName, ...aliases].filter(Boolean))
      const isSelected = selectedModelIds.some(id => candidateIds.has(id))
      const nextIds = isSelected
        ? selectedModelIds.filter(id => !candidateIds.has(id))
        : [...selectedModelIds.filter(id => !candidateIds.has(id)), modelName]
      setSelectedIds(nextIds)
    },
    [selectedModelIds, setSelectedIds],
  )

  return {
    configuredModels,
    isLoading,
    ollamaStatus,
    refresh,
    selectedModelIds,
    setSelectedIds,
    toggleModel,
  }
}

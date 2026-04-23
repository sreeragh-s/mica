import { invoke } from "@tauri-apps/api/core"

export const LOCAL_MODEL_SETTINGS_STORAGE_KEY = "local-model-settings"
export const LOCAL_MODEL_SETTINGS_EVENT = "local-model-settings-changed"

export type OllamaModel = {
  id: string
  name: string
  digest?: string | null
  size?: string | null
  modifiedAt?: string | null
}

export type OllamaStatus = {
  installed: boolean
  running: boolean
  models: OllamaModel[]
  error?: string | null
}

type StoredLocalModelSettings = {
  selectedModelIds?: string[]
}

export function loadSelectedLocalModelIds(): string[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_MODEL_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as StoredLocalModelSettings
    if (!Array.isArray(parsed.selectedModelIds)) {
      return []
    }

    return parsed.selectedModelIds.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )
  } catch {
    return []
  }
}

export function saveSelectedLocalModelIds(selectedModelIds: string[]) {
  if (typeof window === "undefined") {
    return
  }

  const nextValue = Array.from(new Set(selectedModelIds.map(value => value.trim()).filter(Boolean)))
  window.localStorage.setItem(
    LOCAL_MODEL_SETTINGS_STORAGE_KEY,
    JSON.stringify({ selectedModelIds: nextValue }),
  )
  window.dispatchEvent(new CustomEvent(LOCAL_MODEL_SETTINGS_EVENT, { detail: nextValue }))
}

export async function fetchOllamaStatus() {
  const result = await invoke<OllamaStatus>("get_ollama_status")
  return {
    ...result,
    models: result.models.map(model => ({
      ...model,
      id: model.name,
      name: model.name,
      digest: model.id || null,
    })),
  } satisfies OllamaStatus
}

export function getConfiguredLocalModels(status: OllamaStatus, selectedModelIds: string[]) {
  const selectedIds = new Set(selectedModelIds)
  return status.models.filter(
    model =>
      selectedIds.has(model.id) || selectedIds.has(model.name) || selectedIds.has(model.digest ?? ""),
  )
}

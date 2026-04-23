"use client"

import { open } from "@tauri-apps/plugin-dialog"

const WORKSPACE_KEY = "workspace"
const RECENT_WORKSPACES_KEY = "recent-workspaces"
const MAX_RECENT_WORKSPACES = 6

function normalizeWorkspaceStoragePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "")
}

export function getWorkspaceName(path: string) {
  const parts = path.replace(/\\/g, "/").split("/")
  return parts[parts.length - 1] || path
}

export function getCurrentWorkspace() {
  return localStorage.getItem(WORKSPACE_KEY)
}

export function getWorkspaceScopedStorageKey(baseKey: string, workspace?: string | null) {
  if (!workspace) {
    return baseKey
  }

  return `${baseKey}:${encodeURIComponent(normalizeWorkspaceStoragePath(workspace))}`
}

export function getRecentWorkspaces() {
  const raw = localStorage.getItem(RECENT_WORKSPACES_KEY)

  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

export function setCurrentWorkspace(path: string) {
  localStorage.setItem(WORKSPACE_KEY, path)

  const nextRecent = [path, ...getRecentWorkspaces().filter((item) => item !== path)].slice(
    0,
    MAX_RECENT_WORKSPACES
  )

  localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(nextRecent))
  window.dispatchEvent(new CustomEvent("workspace-changed"))
}

export async function openWorkspacePicker(defaultPath?: string) {
  const selected = await open({
    directory: true,
    multiple: false,
    ...(defaultPath ? { defaultPath } : {}),
  })

  if (selected && typeof selected === "string") {
    setCurrentWorkspace(selected)
    return selected
  }

  return null
}

/** Pick a folder without persisting it yet (for onboarding). */
export async function pickWorkspaceFolder(defaultPath?: string) {
  const selected = await open({
    directory: true,
    multiple: false,
    ...(defaultPath ? { defaultPath } : {}),
  })

  if (selected && typeof selected === "string") {
    return selected
  }

  return null
}

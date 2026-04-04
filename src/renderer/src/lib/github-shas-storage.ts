import {
  loadGithubContentShas as loadFromConfig,
  mergeGithubContentShas as mergeFromConfig,
  saveGithubContentShas as saveToConfig,
} from "./gitnotes-app-config"

export function loadGithubContentShas(): Record<string, string> {
  return loadFromConfig()
}

export function saveGithubContentShas(map: Record<string, string>): void {
  saveToConfig(map)
}

export function mergeGithubContentShas(
  patch: Record<string, string | undefined>
): void {
  mergeFromConfig(patch)
}

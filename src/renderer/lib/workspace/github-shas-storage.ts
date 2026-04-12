import {
  loadGithubContentShas as loadFromConfig,
} from '../config/notelab-app-config-read'
import {
  mergeGithubContentShas as mergeFromConfig,
  saveGithubContentShas as saveToConfig
} from '../config/notelab-app-config-write'

export function loadGithubContentShas(): Record<string, string> {
  return loadFromConfig()
}

export function saveGithubContentShas(map: Record<string, string>): void {
  saveToConfig(map)
}

export function mergeGithubContentShas(patch: Record<string, string | undefined>): void {
  mergeFromConfig(patch)
}

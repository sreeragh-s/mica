import { invoke } from "@tauri-apps/api/core"
import { mkdir } from "@tauri-apps/plugin-fs"

export type GitCheckResult = {
  installed: boolean
  version: string | null
}

export type GitIdentity = {
  name: string | null
  email: string | null
}

export type GhCheckResult = {
  installed: boolean
  version: string | null
  authenticated: boolean
  /** Package manager driver available for one-click install, if any. */
  installer: string | null
}

export type GhPublishResult = {
  remoteUrl: string | null
  branch: string
}

export type GhVisibility = "public" | "private" | "internal"

export type GhAuthCodePayload = {
  code: string
  url: string
}

export type GhAuthDonePayload = {
  success: boolean
  error: string | null
}

export function checkGitInstallation(): Promise<GitCheckResult> {
  return invoke("check_git_installation")
}

export function getGitGlobalIdentity(): Promise<GitIdentity> {
  return invoke("get_git_global_identity")
}

export function setGitGlobalIdentity(name: string, email: string): Promise<void> {
  return invoke("set_git_global_identity", { name, email })
}

export function checkGhInstallation(): Promise<GhCheckResult> {
  return invoke("check_gh_installation")
}

export function installGhCli(): Promise<GhCheckResult> {
  return invoke("install_gh_cli")
}

export function startGhAuthLogin(): Promise<void> {
  return invoke("start_gh_auth_login")
}

export function ghPublishBranch(
  path: string,
  branchName: string,
  visibility: GhVisibility,
  repoName?: string,
): Promise<GhPublishResult> {
  return invoke("gh_publish_branch", {
    path,
    branchName,
    visibility,
    repoName: repoName ?? null,
  })
}

export function getDefaultWorkspacePath(): Promise<string> {
  return invoke("get_default_workspace_path")
}

export function ensureDirectoryExists(path: string): Promise<void> {
  return mkdir(path, { recursive: true })
}

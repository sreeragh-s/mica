/**
 * Git utility helpers — pure functions that query or inspect git state
 * without registering any IPC handlers.
 */

import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { runGit, runGitResult } from './git-runner'

const LOG = '[notelab-workspace]'

// ---------------------------------------------------------------------------
// Path / status parsing
// ---------------------------------------------------------------------------

/**
 * Undo Git's C-style quoting used in `git status --porcelain` (without `-z`)
 * for paths that contain spaces or special characters.
 * See: https://git-scm.com/docs/git-status#_short_format
 */
function unquoteGitCStylePath(s: string): string {
  const t = s.trim()
  if (t.length < 2 || t[0] !== '"') return t

  let out = ''
  let i = 1
  while (i < t.length) {
    const c = t[i++]
    if (c === '"') return out
    if (c === '\\' && i < t.length) {
      const esc = t[i++]
      switch (esc) {
        case 'n':
          out += '\n'
          break
        case 't':
          out += '\t'
          break
        case 'r':
          out += '\r'
          break
        case '\\':
          out += '\\'
          break
        case '"':
          out += '"'
          break
        default:
          if (esc >= '0' && esc <= '7') {
            let code = parseInt(esc, 8)
            let digits = 1
            while (digits < 3 && i < t.length && t[i] >= '0' && t[i] <= '7') {
              code = code * 8 + parseInt(t[i++], 8)
              digits++
            }
            out += String.fromCharCode(code & 0xff)
            break
          }
          out += esc
      }
    } else {
      out += c
    }
  }
  return t
}

export function parseGitStatusPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  const renameSeparator = ' -> '
  const renameIndex = trimmed.lastIndexOf(renameSeparator)
  const pathPart =
    renameIndex === -1 ? trimmed : trimmed.slice(renameIndex + renameSeparator.length).trim()
  return unquoteGitCStylePath(pathPart)
}

export function pathStillHasGitStatus(cwd: string, filePath: string): boolean {
  const r = runGitResult(['status', '--porcelain', '--untracked-files=all', '--', filePath], cwd)
  return !r.ok || r.stdout.trim().length > 0
}

export function isInsideRepoRoot(repoRoot: string, absolutePath: string): boolean {
  const rel = relative(repoRoot, absolutePath)
  return rel !== '' && !rel.startsWith('..') && !rel.includes(`..${sep}`)
}

// ---------------------------------------------------------------------------
// Remote helpers
// ---------------------------------------------------------------------------

export function hasGitOrigin(cwd: string): boolean {
  try {
    runGit(['remote', 'get-url', 'origin'], cwd)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Branch helpers
// ---------------------------------------------------------------------------

export function getCurrentBranchName(
  cwd: string
): { ok: true; branch: string } | { ok: false; error: string } {
  const branchR = runGitResult(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  if (!branchR.ok) return { ok: false, error: branchR.error }
  const branch = branchR.stdout.trim()
  if (!branch || branch === 'HEAD') {
    return { ok: false, error: 'detached_head' }
  }
  return { ok: true, branch }
}

// ---------------------------------------------------------------------------
// Rebase helpers
// ---------------------------------------------------------------------------

export function isRebaseInProgress(cwd: string): boolean {
  const rebaseMergePath = join(cwd, '.git', 'rebase-merge')
  const rebaseApplyPath = join(cwd, '.git', 'rebase-apply')
  return existsSync(rebaseMergePath) || existsSync(rebaseApplyPath)
}

/** True if the current branch already tracks a remote branch. */
export function currentBranchHasUpstream(cwd: string): boolean {
  const r = runGitResult(['rev-parse', '--abbrev-ref', '@{u}'], cwd)
  return r.ok
}

/**
 * If the branch has no upstream but `origin/<branch>` exists (e.g. after a pull), set tracking
 * so future `git pull` / `git push` work without extra args.
 */
export function setUpstreamToOriginIfPossible(cwd: string, branch: string): void {
  if (currentBranchHasUpstream(cwd)) return
  const remoteRef = runGitResult(['rev-parse', '--verify', `refs/remotes/origin/${branch}`], cwd)
  if (!remoteRef.ok) return
  const r = runGitResult(['branch', '--set-upstream-to', `origin/${branch}`, branch], cwd)
  if (!r.ok) {
    console.warn(LOG, 'could not set upstream', r.error)
  } else {
    console.info(LOG, 'branch', branch, 'tracks', `origin/${branch}`)
  }
}

// ---------------------------------------------------------------------------
// Rebase argument builders
// ---------------------------------------------------------------------------

export function gitRebaseContinueArgs(authorName: string, authorEmail: string): string[] {
  return [
    '-c',
    'core.editor=true',
    '-c',
    `user.name=${authorName}`,
    '-c',
    `user.email=${authorEmail}`,
    'rebase',
    '--continue'
  ]
}

export function gitRebaseSkipArgs(authorName: string, authorEmail: string): string[] {
  return [
    '-c',
    'core.editor=true',
    '-c',
    `user.name=${authorName}`,
    '-c',
    `user.email=${authorEmail}`,
    'rebase',
    '--skip'
  ]
}

/** After resolving conflicts, a replayed commit can become empty; `rebase --continue` then fails until you skip. */
export function shouldTryRebaseSkipAfterContinueFailure(errorText: string): boolean {
  const m = errorText.toLowerCase()
  return (
    m.includes('nothing to commit') ||
    m.includes('cherry-pick is now empty') ||
    m.includes('rebase --skip') ||
    m.includes('did you forget to use') ||
    (m.includes('no changes') &&
      (m.includes('git add') || m.includes('patch') || m.includes('stage')))
  )
}

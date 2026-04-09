/**
 * Git IPC handlers — registered via `registerGitIpc()`.
 *
 * All `workspace:git-*` IPC channels live here. For pure git utilities,
 * see `./git-utils.ts` and `./git-runner.ts`.
 */

import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  runGit,
  runGitResult,
  runLoggedGitResult,
  summarizeGitLogText,
} from './git-runner'
import {
  parseGitStatusPath,
  pathStillHasGitStatus,
  hasGitOrigin,
  getCurrentBranchName,
  isRebaseInProgress,
  currentBranchHasUpstream,
  setUpstreamToOriginIfPossible,
  isInsideRepoRoot,
  gitRebaseContinueArgs,
  gitRebaseSkipArgs,
  shouldTryRebaseSkipAfterContinueFailure,
} from './git-utils'

const LOG = '[notelab-workspace]'

export function registerGitIpc(): void {
  ipcMain.handle(
    'workspace:git-status',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<
      | { ok: true; dirty: boolean; porcelain: string; remoteUrl: string | null }
      | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      const r = runGitResult(['status', '--porcelain'], cwd)
      if (!r.ok) return { ok: false, error: r.error }
      const porcelain = r.stdout.trim()
      const remoteR = runGitResult(['remote', 'get-url', 'origin'], cwd)
      const remoteUrl = remoteR.ok ? remoteR.stdout.trim() || null : null
      return { ok: true, dirty: porcelain.length > 0, porcelain, remoteUrl }
    }
  )

  ipcMain.handle(
    'workspace:git-commit',
    async (
      _evt,
      payload: { cwd: string; message: string; authorName: string; authorEmail: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const message = payload.message?.trim() ?? ''
      const authorName = payload.authorName?.trim() || 'notelab.io'
      const authorEmail = payload.authorEmail?.trim() || 'notes@notelab.io'
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!message) {
        return { ok: false, error: 'empty_message' }
      }
      const commit = runGitResult(
        [
          '-c',
          `user.name=${authorName}`,
          '-c',
          `user.email=${authorEmail}`,
          'commit',
          '-m',
          message,
        ],
        cwd
      )
      if (!commit.ok) {
        const err = commit.error.toLowerCase()
        if (
          err.includes('nothing to commit') ||
          err.includes('nothing added to commit')
        ) {
          return { ok: false, error: 'nothing_to_commit' }
        }
        const headCheck = runGitResult(['rev-parse', '--verify', 'HEAD'], cwd)
        if (headCheck.ok) {
          console.info(LOG, 'commit succeeded despite non-zero exit (warnings):', commit.error, cwd)
          return { ok: true }
        }
        return { ok: false, error: commit.error }
      }
      console.info(LOG, 'commit', cwd)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'workspace:git-pull',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!hasGitOrigin(cwd)) {
        return {
          ok: false,
          error:
            'No remote named origin. Connect a GitHub repo first from Source Control.',
        }
      }
      if (isRebaseInProgress(cwd)) {
        console.warn(LOG, 'pull --rebase blocked; rebase already in progress', { cwd })
        return { ok: false, error: 'rebase_in_progress' }
      }
      const br = getCurrentBranchName(cwd)
      if (!br.ok) return { ok: false, error: br.error }
      const { branch } = br
      console.info(LOG, 'pull --rebase requested', {
        cwd,
        branch,
        hasUpstream: currentBranchHasUpstream(cwd),
      })
      let r = runLoggedGitResult(['pull', '--rebase'], cwd, 'pull --rebase')
      if (
        !r.ok &&
        /no tracking information|no upstream|Set the remote/i.test(r.error)
      ) {
        console.info(LOG, 'pull --rebase retrying with explicit upstream', { cwd, branch })
        r = runLoggedGitResult(['pull', '--rebase', 'origin', branch], cwd, 'pull --rebase origin/<branch>')
      }
      if (!r.ok && isRebaseInProgress(cwd)) {
        console.warn(LOG, 'pull --rebase left repository in rebase state', { cwd, branch })
        return { ok: false, error: 'rebase_conflicts' }
      }
      if (!r.ok) return { ok: false, error: r.error }
      setUpstreamToOriginIfPossible(cwd, branch)
      console.info(LOG, 'pull --rebase complete', {
        cwd,
        branch,
        output: summarizeGitLogText(r.stdout) ?? undefined,
      })
      return { ok: true, stdout: r.stdout }
    }
  )

  ipcMain.handle(
    'workspace:git-push',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!hasGitOrigin(cwd)) {
        return {
          ok: false,
          error:
            'No remote named origin. Add your GitHub URL in Settings → GitHub & Git and click "Apply remote to ~/.notelab".',
        }
      }
      if (isRebaseInProgress(cwd)) {
        return { ok: false, error: 'rebase_in_progress' }
      }
      const br = getCurrentBranchName(cwd)
      if (!br.ok) return { ok: false, error: br.error }
      const { branch } = br
      const r = runGitResult(['push', '-u', 'origin', branch], cwd)
      if (!r.ok) return { ok: false, error: r.error }
      console.info(LOG, 'push', cwd, branch)
      return { ok: true, stdout: r.stdout }
    }
  )

  /** Returns parsed per-file status entries from git status --porcelain. */
  ipcMain.handle(
    'workspace:git-file-statuses',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<
      | {
          ok: true
          files: { path: string; x: string; y: string; staged: boolean; conflicted: boolean }[]
          hasConflicts: boolean
          isRebasing: boolean
        }
      | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      const r = runGitResult(['status', '--porcelain'], cwd)
      if (!r.ok) return { ok: false, error: r.error }
      const lines = r.stdout.split('\n').filter((l) => l.length > 0)
      const conflictXY = new Set(['AA', 'DD', 'UU', 'AU', 'UA', 'DU', 'UD'])
      const files = lines.map((line) => {
        const x = line[0] ?? ' '
        const y = line[1] ?? ' '
        const path = parseGitStatusPath(line.slice(3))
        const conflicted = conflictXY.has(`${x}${y}`) || x === 'U' || y === 'U'
        const staged = x !== ' ' && x !== '?' && !conflicted
        return { path, x, y, staged, conflicted }
      })
      const hasConflicts = files.some((f) => f.conflicted)
      const rebasing = isRebaseInProgress(cwd)
      if (rebasing || hasConflicts) {
        console.info(LOG, 'git-file-statuses rebase snapshot', {
          cwd,
          isRebasing: rebasing,
          hasConflicts,
          fileCount: files.length,
          conflictedFiles: files.filter((file) => file.conflicted).map((file) => file.path),
        })
      }
      return { ok: true, files, hasConflicts, isRebasing: rebasing }
    }
  )

  /** Returns the unified diff for a single file. */
  ipcMain.handle(
    'workspace:git-diff-file',
    async (
      _evt,
      payload: { cwd: string; path: string; staged?: boolean }
    ): Promise<{ ok: true; diff: string } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const filePath = payload.path?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!filePath) return { ok: false, error: 'missing_path' }
      const args = payload.staged
        ? ['diff', '--cached', '--', filePath]
        : ['diff', 'HEAD', '--', filePath]
      const r = runGitResult(args, cwd)
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true, diff: r.stdout }
    }
  )

  /** Returns the raw content of a conflicted file with conflict markers. */
  ipcMain.handle(
    'workspace:git-conflict-file',
    async (
      _evt,
      payload: { cwd: string; path: string }
    ): Promise<
      | { ok: true; content: string; ours: string; theirs: string; base: string }
      | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      const filePath = payload.path?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!filePath) return { ok: false, error: 'missing_path' }
      const absPath = join(cwd, filePath)
      if (!isInsideRepoRoot(cwd, absPath)) {
        return { ok: false, error: 'path_outside_repo' }
      }
      if (!existsSync(absPath)) return { ok: false, error: 'file_not_found' }
      console.info(LOG, 'git-conflict-file requested', { cwd, path: filePath })
      const content = readFileSync(absPath, 'utf8')
      const oursLines: string[] = []
      const theirsLines: string[] = []
      const baseLines: string[] = []
      let section: 'ours' | 'base' | 'theirs' | 'outside' = 'outside'
      for (const line of content.split('\n')) {
        if (line.startsWith('<<<<<<<')) { section = 'ours'; continue }
        if (line.startsWith('|||||||')) { section = 'base'; continue }
        if (line.startsWith('=======')) { section = 'theirs'; continue }
        if (line.startsWith('>>>>>>>')) { section = 'outside'; continue }
        if (section === 'ours') oursLines.push(line)
        else if (section === 'base') baseLines.push(line)
        else if (section === 'theirs') theirsLines.push(line)
      }
      return {
        ok: true,
        content,
        ours: oursLines.join('\n'),
        theirs: theirsLines.join('\n'),
        base: baseLines.join('\n'),
      }
    }
  )

  /** Resolve a conflict by accepting ours or theirs for a given file, then stage it. */
  ipcMain.handle(
    'workspace:git-accept-resolution',
    async (
      _evt,
      payload: { cwd: string; path: string; resolution: 'ours' | 'theirs' | 'content'; content?: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const filePath = payload.path?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!filePath) return { ok: false, error: 'missing_path' }
      const absPath = join(cwd, filePath)
      if (!isInsideRepoRoot(cwd, absPath)) {
        return { ok: false, error: 'path_outside_repo' }
      }
      console.info(LOG, 'git-accept-resolution requested', {
        cwd,
        path: filePath,
        resolution: payload.resolution,
      })
      if (payload.resolution === 'ours' || payload.resolution === 'theirs') {
        const checkoutArg = payload.resolution === 'ours' ? '--ours' : '--theirs'
        const r = runLoggedGitResult(['checkout', checkoutArg, '--', filePath], cwd, `checkout ${checkoutArg}`)
        if (!r.ok) return { ok: false, error: r.error }
      } else if (payload.resolution === 'content' && payload.content !== undefined) {
        writeFileSync(absPath, payload.content, 'utf8')
      } else {
        return { ok: false, error: 'invalid_resolution' }
      }
      const stage = runLoggedGitResult(['add', '--', filePath], cwd, 'add resolved file')
      if (!stage.ok) return { ok: false, error: stage.error }
      return { ok: true }
    }
  )

  /** Stage a single file (git add). */
  ipcMain.handle(
    'workspace:git-stage-file',
    async (
      _evt,
      payload: { cwd: string; path: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const filePath = payload.path?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!filePath) return { ok: false, error: 'missing_path' }
      const r = runGitResult(['add', '--', filePath], cwd)
      if (!r.ok) {
        const absPath = resolve(cwd, filePath)
        if (
          r.error.includes('did not match any files') &&
          !existsSync(absPath) &&
          !pathStillHasGitStatus(cwd, filePath)
        ) {
          return { ok: true }
        }
        return { ok: false, error: r.error }
      }
      return { ok: true }
    }
  )

  /** Unstage a single file (git restore --staged). */
  ipcMain.handle(
    'workspace:git-unstage-file',
    async (
      _evt,
      payload: { cwd: string; path: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const filePath = payload.path?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!filePath) return { ok: false, error: 'missing_path' }
      const r = runGitResult(['restore', '--staged', '--', filePath], cwd)
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true }
    }
  )

  /** Discard unstaged changes for a file (git restore). */
  ipcMain.handle(
    'workspace:git-discard-file',
    async (
      _evt,
      payload: { cwd: string; path: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const filePath = payload.path?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!filePath) return { ok: false, error: 'missing_path' }
      const r = runGitResult(['restore', '--', filePath], cwd)
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true }
    }
  )

  /** Abort an in-progress rebase. */
  ipcMain.handle(
    'workspace:git-abort-rebase',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      console.info(LOG, 'rebase --abort requested', { cwd })
      const r = runLoggedGitResult(['rebase', '--abort'], cwd, 'rebase --abort')
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true }
    }
  )

  /** Continue a rebase after all conflicts are resolved. */
  ipcMain.handle(
    'workspace:git-continue-rebase',
    async (
      _evt,
      payload: { cwd: string; authorName: string; authorEmail: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      const authorName = payload.authorName?.trim() || 'notelab.io'
      const authorEmail = payload.authorEmail?.trim() || 'notes@notelab.io'
      console.info(LOG, 'rebase --continue requested', { cwd })
      const continueArgs = gitRebaseContinueArgs(authorName, authorEmail)
      let r = runLoggedGitResult(continueArgs, cwd, 'rebase --continue')
      let finishedViaSkip = false
      if (
        !r.ok &&
        shouldTryRebaseSkipAfterContinueFailure(r.error)
      ) {
        console.info(LOG, 'rebase --continue suggests skip; trying rebase --skip', {
          cwd,
          priorError: summarizeGitLogText(r.error) ?? r.error,
        })
        r = runLoggedGitResult(
          gitRebaseSkipArgs(authorName, authorEmail),
          cwd,
          'rebase --skip'
        )
        finishedViaSkip = r.ok
      }
      if (!r.ok) return { ok: false, error: r.error }
      console.info(
        LOG,
        finishedViaSkip ? 'rebase --skip completed' : 'rebase --continue completed',
        {
          cwd,
          output: summarizeGitLogText(r.stdout) ?? undefined,
        }
      )
      return { ok: true }
    }
  )

  ipcMain.handle(
    'workspace:set-git-remote',
    async (
      _evt,
      payload: { cwd: string; url: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = typeof payload.cwd === 'string' ? payload.cwd.trim() : ''
      const url = typeof payload.url === 'string' ? payload.url.trim() : ''
      if (!cwd) return { ok: false, error: 'missing_cwd' }
      if (!url) return { ok: false, error: 'empty_url' }
      try {
        if (hasGitOrigin(cwd)) {
          runGit(['remote', 'set-url', 'origin', url], cwd)
        } else {
          runGit(['remote', 'add', 'origin', url], cwd)
        }
        console.info(LOG, 'remote origin set', cwd)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'set-remote failed', msg)
        return { ok: false, error: msg }
      }
    }
  )
}

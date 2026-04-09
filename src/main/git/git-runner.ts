/**
 * Low-level Git runner utilities.
 *
 * Wraps `execFileSync` / `spawnSync` so callers get structured
 * `{ ok, stdout } | { ok, error }` results instead of thrown exceptions.
 */

import { execFileSync, spawnSync } from 'node:child_process'

const LOG = '[notelab-workspace]'

// ---------------------------------------------------------------------------
// Core runners
// ---------------------------------------------------------------------------

export function runGit(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

/**
 * Uses spawnSync so stderr/stdout are always available on failure. execFileSync's thrown Error
 * often omits Git's output in Electron, leaving only `Command failed: git ...`.
 */
export function runGitResult(
  args: string[],
  cwd: string
): { ok: true; stdout: string } | { ok: false; error: string } {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
  if (r.error) {
    return { ok: false, error: r.error.message || String(r.error) }
  }
  const stdout = `${r.stdout ?? ''}`
  const stderr = `${r.stderr ?? ''}`
  if (r.status === 0) {
    return { ok: true, stdout }
  }
  const parts = [stderr.trim(), stdout.trim()].filter(Boolean)
  const combined = parts.join('\n').trim()
  const meta =
    r.status != null
      ? `status ${r.status}`
      : r.signal
        ? `signal ${r.signal}`
        : 'unknown failure'
  return {
    ok: false,
    error: combined || `git exited (${meta})`,
  }
}

// ---------------------------------------------------------------------------
// Logged runner (adds timing + summary)
// ---------------------------------------------------------------------------

function summarizeGitLogText(text: string, maxLength = 280): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const singleLine = trimmed.replace(/\s+/g, ' ')
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength)}...`
}

export { summarizeGitLogText }

export function runLoggedGitResult(
  args: string[],
  cwd: string,
  label: string
): { ok: true; stdout: string } | { ok: false; error: string } {
  const startedAt = Date.now()
  console.info(LOG, 'git start', label, { cwd, args })
  const result = runGitResult(args, cwd)
  const durationMs = Date.now() - startedAt
  if (result.ok) {
    console.info(LOG, 'git success', label, {
      cwd,
      durationMs,
      output: summarizeGitLogText(result.stdout) ?? undefined,
    })
  } else {
    console.warn(LOG, 'git failure', label, {
      cwd,
      durationMs,
      error: summarizeGitLogText(result.error) ?? result.error,
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Git binary check
// ---------------------------------------------------------------------------

export function checkGitBinary():
  | { ok: true; version: string }
  | { ok: false; error: string } {
  try {
    const stdout = execFileSync('git', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const version = stdout.trim().split(/\n/)[0]?.trim() ?? stdout.trim()
    return { ok: true, version }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error:
        msg.includes('ENOENT') || msg.includes('not found')
          ? 'Git is not installed or not on your PATH.'
          : msg,
    }
  }
}

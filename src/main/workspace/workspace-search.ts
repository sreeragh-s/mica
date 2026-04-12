import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

type WorkspaceSearchHit = {
  notePath: string
  lineNumber: number
  lineText: string
}

type WorkspaceSearchResult =
  | { ok: true; hits: WorkspaceSearchHit[]; engine: 'git-grep' | 'ripgrep' }
  | { ok: false; error: string }

const NOTE_GLOBS = ['*.md', '*.excalidraw', '*/*.md', '*/*.excalidraw']

function runCommand(
  bin: string,
  args: string[],
  cwd: string
): { ok: true; stdout: string } | { ok: false; error: string; status: number | null } {
  const r = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  })
  if (r.error) {
    return { ok: false, error: r.error.message || String(r.error), status: r.status }
  }
  const stdout = `${r.stdout ?? ''}`
  const stderr = `${r.stderr ?? ''}`.trim()
  if (r.status === 0) return { ok: true, stdout }
  if (r.status === 1) return { ok: true, stdout: '' }
  return {
    ok: false,
    error: stderr || stdout.trim() || `${bin} exited with status ${r.status ?? 'unknown'}`,
    status: r.status
  }
}

function parseSearchOutput(stdout: string, limit: number): WorkspaceSearchHit[] {
  const hits: WorkspaceSearchHit[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) continue
    const first = line.indexOf(':')
    const second = first === -1 ? -1 : line.indexOf(':', first + 1)
    if (first === -1 || second === -1) continue
    const notePath = line.slice(0, first).replace(/\\/g, '/')
    const lineNumber = Number.parseInt(line.slice(first + 1, second), 10)
    if (!notePath || !Number.isFinite(lineNumber)) continue
    hits.push({
      notePath,
      lineNumber,
      lineText: line.slice(second + 1).trim()
    })
    if (hits.length >= limit) break
  }
  return hits
}

export function searchWorkspaceNotes(
  cwd: string,
  query: string,
  limit = 20
): WorkspaceSearchResult {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return { ok: true, hits: [], engine: existsSync(join(cwd, '.git')) ? 'git-grep' : 'ripgrep' }
  }

  const isGitWorkspace = existsSync(join(cwd, '.git'))
  if (isGitWorkspace) {
    const gitArgs = [
      'grep',
      '--untracked',
      '-I',
      '-i',
      '-F',
      '-n',
      '-m',
      '1',
      trimmedQuery,
      '--',
      ...NOTE_GLOBS
    ]
    const gitResult = runCommand('git', gitArgs, cwd)
    if (!gitResult.ok) return { ok: false, error: gitResult.error }
    return {
      ok: true,
      hits: parseSearchOutput(gitResult.stdout, limit),
      engine: 'git-grep'
    }
  }

  const rgArgs = [
    '--hidden',
    '--no-heading',
    '--color',
    'never',
    '--line-number',
    '--with-filename',
    '--ignore-case',
    '--fixed-strings',
    '--max-count',
    '1',
    '--glob',
    '*.md',
    '--glob',
    '*.excalidraw',
    '--glob',
    '*/*.md',
    '--glob',
    '*/*.excalidraw',
    '--glob',
    '!.git/**',
    '--glob',
    '!.notelab/**',
    trimmedQuery,
    '.'
  ]
  const rgResult = runCommand('rg', rgArgs, cwd)
  if (!rgResult.ok) return { ok: false, error: rgResult.error }
  return {
    ok: true,
    hits: parseSearchOutput(rgResult.stdout, limit),
    engine: 'ripgrep'
  }
}

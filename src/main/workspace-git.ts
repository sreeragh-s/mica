import { ipcMain, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

const LOG = '[gitnotes-workspace]'
const MODE_FILE = '.gitnotes-mode'

function allowWorkspaceFs(cwd: string): boolean {
  const root = cwd?.trim() ?? ''
  if (!root) return false
  if (existsSync(join(root, '.git'))) return true
  if (existsSync(join(root, MODE_FILE))) return true
  return false
}

function isInsideRepoRoot(repoRoot: string, absolutePath: string): boolean {
  const rel = relative(repoRoot, absolutePath)
  return rel !== '' && !rel.startsWith('..') && !rel.includes(`..${sep}`)
}

function assertSafeRelativePath(cwd: string, rel: string): string {
  const norm = rel.replace(/\\/g, '/')
  if (norm.includes('..') || norm.startsWith('/')) {
    throw new Error('Invalid relative path')
  }
  const abs = resolve(cwd, rel)
  if (!isInsideRepoRoot(cwd, abs)) {
    throw new Error('Path escapes repository root')
  }
  return abs
}

function checkGitBinary():
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

function runGit(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

function runGitResult(
  args: string[],
  cwd: string
): { ok: true; stdout: string } | { ok: false; error: string } {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, stdout }
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string }
    const stderr =
      typeof err.stderr === "string"
        ? err.stderr
        : err.stderr != null
          ? err.stderr.toString("utf8")
          : ""
    return {
      ok: false,
      error: stderr.trim() || err.message || String(e),
    }
  }
}

function hasGitOrigin(cwd: string): boolean {
  try {
    runGit(['remote', 'get-url', 'origin'], cwd)
    return true
  } catch {
    return false
  }
}

function getCurrentBranchName(
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

/** True if the current branch already tracks a remote branch. */
function currentBranchHasUpstream(cwd: string): boolean {
  const r = runGitResult(['rev-parse', '--abbrev-ref', '@{u}'], cwd)
  return r.ok
}

/**
 * If the branch has no upstream but `origin/<branch>` exists (e.g. after a pull), set tracking
 * so future `git pull` / `git push` work without extra args.
 */
function setUpstreamToOriginIfPossible(cwd: string, branch: string): void {
  if (currentBranchHasUpstream(cwd)) return
  const remoteRef = runGitResult(
    ['rev-parse', '--verify', `refs/remotes/origin/${branch}`],
    cwd
  )
  if (!remoteRef.ok) return
  const r = runGitResult(
    ['branch', '--set-upstream-to', `origin/${branch}`, branch],
    cwd
  )
  if (!r.ok) {
    console.warn(LOG, 'could not set upstream', r.error)
  } else {
    console.info(LOG, 'branch', branch, 'tracks', `origin/${branch}`)
  }
}

function syncMarkdownFilesToDisk(
  cwd: string,
  workspaceId: string,
  files: { relativePath: string; content: string }[],
  pruneOrphanNoteFiles = true
): void {
  const writtenRel = new Set<string>()
  for (const f of files) {
    const abs = assertSafeRelativePath(cwd, f.relativePath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.content, 'utf8')
    writtenRel.add(f.relativePath.replace(/\\/g, '/'))
  }

  if (!pruneOrphanNoteFiles) return

  const wsDir = join(cwd, 'gitnotes', 'workspaces', workspaceId)
  if (!existsSync(wsDir)) return
  const prefix = `gitnotes/workspaces/${workspaceId}/`.replace(/\\/g, '/')
  for (const ent of readdirSync(wsDir, { withFileTypes: true })) {
    if (!ent.isFile() || ent.name === 'README.md') continue
    if (!ent.name.endsWith('.md')) continue
    const rel = `${prefix}${ent.name}`
    if (!writtenRel.has(rel)) {
      unlinkSync(join(wsDir, ent.name))
      console.info(LOG, 'removed stale note file', ent.name)
    }
  }
}

function parseGitnotesNoteFile(content: string): {
  id: string
  title: string
  updatedAtMs: number
  body: string
  kind: 'note' | 'drawing'
} | null {
  if (!content.startsWith('---')) return null
  const endFm = content.indexOf('\n---', 3)
  if (endFm === -1) return null
  const fm = content.slice(3, endFm).trim()
  const body = content.slice(endFm + 4).replace(/^\n+/, '')
  const idM = /^gitnotes_note_id:\s*["']?([^"'\s]+)/m.exec(fm)
  if (!idM) return null
  const id = idM[1]!
  let title = 'New note'
  const titleLine = /^title:\s*(.+)$/m.exec(fm)
  if (titleLine) {
    const raw = titleLine[1]!.trim()
    try {
      title = JSON.parse(raw) as string
    } catch {
      title = raw.replace(/^["']|["']$/g, '')
    }
  }
  let kind: 'note' | 'drawing' = 'note'
  const kindLine = /^gitnotes_kind:\s*(drawing|note)\s*$/m.exec(fm)
  if (kindLine && kindLine[1] === 'drawing') kind = 'drawing'

  let updatedAtMs = Date.now()
  const upM = /^updated_at:\s*["']?([^"'\s]+)/m.exec(fm)
  if (upM) {
    const t = Date.parse(upM[1]!)
    if (!Number.isNaN(t)) updatedAtMs = t
  }
  return { id, title, updatedAtMs, body, kind }
}

function writeGitnotesFile(
  cwd: string,
  relativePath: string,
  content: string
): void {
  const abs = assertSafeRelativePath(cwd, relativePath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

function deleteNoteFilesForId(
  cwd: string,
  workspaceId: string,
  noteId: string
): void {
  const wsDir = join(cwd, 'gitnotes', 'workspaces', workspaceId)
  if (!existsSync(wsDir)) return
  const suffix = `--${noteId}.md`
  const legacy = `${noteId}.md`
  for (const ent of readdirSync(wsDir, { withFileTypes: true })) {
    if (!ent.isFile() || ent.name === 'README.md') continue
    if (ent.name.endsWith(suffix) || ent.name === legacy) {
      unlinkSync(join(wsDir, ent.name))
      console.info(LOG, 'deleted note file', ent.name)
    }
  }
}

function readGitnotesIndexImpl(cwd: string): {
  workspaces: { id: string; name: string }[]
  notes: {
    workspaceId: string
    noteId: string
    title: string
    updatedAtMs: number
    markdownBody: string
    kind: 'note' | 'drawing'
  }[]
} {
  const workspaces: { id: string; name: string }[] = []
  const notes: {
    workspaceId: string
    noteId: string
    title: string
    updatedAtMs: number
    markdownBody: string
    kind: 'note' | 'drawing'
  }[] = []
  const root = join(cwd, 'gitnotes', 'workspaces')
  if (!existsSync(root)) return { workspaces, notes }
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    const id = ent.name
    const wsPath = join(root, id)
    let name = id.slice(0, 8)
    const readme = join(wsPath, 'README.md')
    if (existsSync(readme)) {
      const first = readFileSync(readme, 'utf8').split(/\r?\n/)[0] ?? ''
      if (first.startsWith('# ')) name = first.slice(2).trim() || name
    }
    workspaces.push({ id, name })
    for (const f of readdirSync(wsPath, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.md') || f.name === 'README.md')
        continue
      const full = join(wsPath, f.name)
      const content = readFileSync(full, 'utf8')
      const parsed = parseGitnotesNoteFile(content)
      if (!parsed) continue
      notes.push({
        workspaceId: id,
        noteId: parsed.id,
        title: parsed.title,
        updatedAtMs: parsed.updatedAtMs,
        markdownBody: parsed.body,
        kind: parsed.kind,
      })
    }
  }
  return { workspaces, notes }
}

export function registerWorkspaceGitIpc(): void {
  ipcMain.handle(
    'workspace:check-git',
    async (): Promise<
      | { ok: true; version: string }
      | { ok: false; error: string }
    > => {
      return checkGitBinary()
    }
  )

  ipcMain.handle(
    'workspace:ensure-data-root',
    async (): Promise<
      | {
          ok: true
          path: string
          gitAvailable: boolean
          filesystemOnly: boolean
        }
      | { ok: false; error: string }
    > => {
      try {
        const root = join(homedir(), '.gitnotes')
        mkdirSync(root, { recursive: true })
        const gitDir = join(root, '.git')
        const gitCheck = checkGitBinary()
        const gitAvailable = gitCheck.ok
        let filesystemOnly = false

        if (gitAvailable) {
          if (!existsSync(gitDir)) {
            runGit(['init'], root)
            runGit(['branch', '-M', 'main'], root)
          }
          const modePath = join(root, MODE_FILE)
          if (existsSync(modePath)) {
            unlinkSync(modePath)
          }
        } else {
          filesystemOnly = true
          const modePath = join(root, MODE_FILE)
          writeFileSync(
            modePath,
            JSON.stringify({
              allowFilesystemWithoutGit: true,
              syncMode: 'no_git',
            }),
            'utf8'
          )
        }

        const readmePath = join(root, 'README.md')
        if (!existsSync(readmePath)) {
          writeFileSync(
            readmePath,
            '# GitNotes\n\nYour workspaces and notes are stored under `gitnotes/workspaces/`.\n',
            'utf8'
          )
        }
        console.info(LOG, 'data root', root, { gitAvailable, filesystemOnly })
        return { ok: true, path: root, gitAvailable, filesystemOnly }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'ensure-data-root failed', msg)
        return {
          ok: false,
          error:
            msg.includes('ENOENT') || msg.includes('not found')
              ? 'Could not create the data folder. Check permissions.'
              : msg,
        }
      }
    }
  )

  ipcMain.handle(
    'workspace:set-sync-mode',
    async (
      _evt,
      payload: { cwd: string; syncMode: 'git' | 'github_api' | 'local' }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = typeof payload.cwd === 'string' ? payload.cwd.trim() : ''
      const syncMode = payload.syncMode
      if (!cwd || !syncMode) return { ok: false, error: 'missing_args' }
      try {
        const modePath = join(cwd, MODE_FILE)
        writeFileSync(
          modePath,
          JSON.stringify({
            allowFilesystemWithoutGit: true,
            syncMode,
          }),
          'utf8'
        )
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle('workspace:open-external', async (_evt, url: string) => {
    const u = typeof url === 'string' ? url.trim() : ''
    if (!u) return
    await shell.openExternal(u)
  })

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

  ipcMain.handle(
    'workspace:sync-markdown',
    async (
      _evt,
      payload: {
        cwd: string
        workspaceId: string
        files: { relativePath: string; content: string }[]
        pruneOrphanNoteFiles?: boolean
      }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const workspaceId = payload.workspaceId?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (!workspaceId) {
        return { ok: false, error: 'missing_workspace' }
      }
      try {
        syncMarkdownFilesToDisk(
          cwd,
          workspaceId,
          payload.files ?? [],
          payload.pruneOrphanNoteFiles !== false
        )
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'sync-markdown', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:read-gitnotes-index',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<
      | {
          ok: true
          workspaces: { id: string; name: string }[]
          notes: {
            workspaceId: string
            noteId: string
            title: string
            updatedAtMs: number
            markdownBody: string
            kind: 'note' | 'drawing'
          }[]
        }
      | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      try {
        const { workspaces, notes } = readGitnotesIndexImpl(cwd)
        return { ok: true, workspaces, notes }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'read-gitnotes-index', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:write-note-file',
    async (
      _evt,
      payload: { cwd: string; relativePath: string; content: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const rel = typeof payload.relativePath === 'string' ? payload.relativePath : ''
      const content = typeof payload.content === 'string' ? payload.content : ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (!rel.trim()) {
        return { ok: false, error: 'missing_path' }
      }
      try {
        writeGitnotesFile(cwd, rel, content)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'write-note-file', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:delete-note-files',
    async (
      _evt,
      payload: { cwd: string; workspaceId: string; noteId: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const workspaceId = payload.workspaceId?.trim() ?? ''
      const noteId = payload.noteId?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (!workspaceId || !noteId) {
        return { ok: false, error: 'missing_ids' }
      }
      try {
        deleteNoteFilesForId(cwd, workspaceId, noteId)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'delete-note-files', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:git-status',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<
      | { ok: true; dirty: boolean; porcelain: string }
      | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      const r = runGitResult(['status', '--porcelain'], cwd)
      if (!r.ok) return { ok: false, error: r.error }
      const porcelain = r.stdout.trim()
      return { ok: true, dirty: porcelain.length > 0, porcelain }
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
      const authorName = payload.authorName?.trim() || 'GitNotes'
      const authorEmail = payload.authorEmail?.trim() || 'gitnotes@local'
      if (!cwd || !existsSync(join(cwd, '.git'))) {
        return { ok: false, error: 'not_a_git_repo' }
      }
      if (!message) {
        return { ok: false, error: 'empty_message' }
      }
      const add = runGitResult(['add', '-A'], cwd)
      if (!add.ok) return { ok: false, error: add.error }
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
      const br = getCurrentBranchName(cwd)
      if (!br.ok) return { ok: false, error: br.error }
      const { branch } = br
      let r = runGitResult(['pull', '--rebase'], cwd)
      if (
        !r.ok &&
        /no tracking information|no upstream|Set the remote/i.test(r.error)
      ) {
        r = runGitResult(['pull', '--rebase', 'origin', branch], cwd)
      }
      if (!r.ok) return { ok: false, error: r.error }
      setUpstreamToOriginIfPossible(cwd, branch)
      console.info(LOG, 'pull --rebase', cwd)
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
            'No remote named origin. Add your GitHub URL in Settings → GitHub & Git and click “Apply remote to ~/.gitnotes”.',
        }
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
}

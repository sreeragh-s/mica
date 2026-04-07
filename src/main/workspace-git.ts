import { dialog, ipcMain, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

const LOG = '[notelab-workspace]'
/** Git + markdown live under ~/.notelab (legacy name was ~/.notelab.io). */
const NOTELAB_HOME_DIR = '.notelab'
const LEGACY_NOTELAB_HOME_DIR = '.notelab.io'
/** Markdown and workspace folders live under `notelab/<workspaceId>/` relative to the root. */
const DATA_DIR = 'notelab'
/** Virtual inbox id; root notes live directly in `notelab/`, not in a subfolder. */
const DEFAULT_WORKSPACE_ID = 'default'
const MODE_FILE = '.notelab-mode'
/** App settings JSON: <dataRoot>/notelab.config (data root is ~/.notelab). */
const APP_CONFIG_FILENAME = 'notelab.config'

/** Renames ~/.notelab.io → ~/.notelab when the new path does not exist yet. */
function migrateNotelabHomeDirIfNeeded(): void {
  const home = homedir()
  const next = join(home, NOTELAB_HOME_DIR)
  const prev = join(home, LEGACY_NOTELAB_HOME_DIR)
  if (existsSync(next)) return
  if (!existsSync(prev)) return
  renameSync(prev, next)
  console.info(LOG, 'migrated data root', prev, '→', next)
}

/**
 * Validates that the given path is an absolute path that exists on disk.
 * Previously restricted to ~/.notelab; now allows any user-chosen workspace root.
 */
function assertNotelabDataRoot(cwd: string): boolean {
  const root = cwd?.trim() ?? ''
  if (!root) return false
  const abs = resolve(root)
  if (!abs.startsWith('/') && !abs.match(/^[A-Za-z]:\\/)) return false
  return existsSync(abs)
}

function appConfigFilePath(cwd: string): string {
  return join(cwd, APP_CONFIG_FILENAME)
}

/**
 * One-time move from legacy `notelab.io/workspaces/<id>/` to `data/<id>/`.
 */
function migrateLegacyDataLayout(root: string): void {
  const legacyWs = join(root, 'notelab.io', 'workspaces')
  if (!existsSync(legacyWs)) return
  const dataRoot = join(root, DATA_DIR)
  mkdirSync(dataRoot, { recursive: true })
  for (const ent of readdirSync(legacyWs, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    const src = join(legacyWs, ent.name)
    const dst = join(dataRoot, ent.name)
    if (existsSync(dst)) {
      console.warn(LOG, 'skip migrate workspace', ent.name, 'data path exists')
      continue
    }
    renameSync(src, dst)
    console.info(LOG, 'migrated workspace', ent.name, '→', DATA_DIR)
  }
  try {
    if (existsSync(legacyWs) && readdirSync(legacyWs).length === 0) {
      rmSync(legacyWs, { recursive: true })
      const legacyApp = join(root, 'notelab.io')
      if (existsSync(legacyApp) && readdirSync(legacyApp).length === 0) {
        rmSync(legacyApp, { recursive: true })
      }
    }
  } catch (e) {
    console.warn(LOG, 'legacy path cleanup', e)
  }
}

function allowWorkspaceFs(cwd: string): boolean {
  const root = cwd?.trim() ?? ''
  if (!root) return false
  if (!existsSync(root)) return false
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

  const isRoot = workspaceId === DEFAULT_WORKSPACE_ID
  // cwd is the notes root; workspace notes live in <cwd>/<workspaceId>/
  const scanDir = isRoot ? cwd : join(cwd, workspaceId)
  if (!existsSync(scanDir)) return
  const prefix = isRoot ? '' : `${workspaceId}/`
  for (const ent of readdirSync(scanDir, { withFileTypes: true })) {
    // For root: only prune .md files (not subdirectories which are workspaces)
    if (isRoot && !ent.isFile()) continue
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue
    const rel = `${prefix}${ent.name}`
    if (!writtenRel.has(rel)) {
      unlinkSync(join(scanDir, ent.name))
      console.info(LOG, 'removed stale note file', ent.name)
    }
  }
}

function parseNotelabNoteFile(content: string): {
  id: string
  title: string
  updatedAtMs: number
  body: string
  kind: 'note' | 'drawing'
  coverImageSrc?: string
  titleEmoji?: string
} | null {
  if (!content.startsWith('---')) return null
  const endFm = content.indexOf('\n---', 3)
  if (endFm === -1) return null
  const fm = content.slice(3, endFm).trim()
  const body = content.slice(endFm + 4).replace(/^\n+/, '')
  const idM = /^notelab_note_id:\s*["']?([^"'\s]+)/m.exec(fm)
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
  const kindLine = /^notelab_kind:\s*(drawing|note)\s*$/m.exec(fm)
  if (kindLine && kindLine[1] === 'drawing') kind = 'drawing'

  let updatedAtMs = Date.now()
  const upM = /^updated_at:\s*["']?([^"'\s]+)/m.exec(fm)
  if (upM) {
    const t = Date.parse(upM[1]!)
    if (!Number.isNaN(t)) updatedAtMs = t
  }
  let coverImageSrc: string | undefined
  const coverM = /^cover_image:\s*(.+)$/m.exec(fm)
  if (coverM) {
    const raw = coverM[1]!.trim()
    try {
      coverImageSrc = JSON.parse(raw) as string
    } catch {
      coverImageSrc = raw.replace(/^["']|["']$/g, '')
    }
  }
  let titleEmoji: string | undefined
  const emojiM = /^title_emoji:\s*(.+)$/m.exec(fm)
  if (emojiM) {
    const raw = emojiM[1]!.trim()
    try {
      titleEmoji = JSON.parse(raw) as string
    } catch {
      titleEmoji = raw.replace(/^["']|["']$/g, '')
    }
  }
  return { id, title, updatedAtMs, body, kind, coverImageSrc, titleEmoji }
}

function writeNotelabFile(
  cwd: string,
  relativePath: string,
  content: string
): void {
  const abs = assertSafeRelativePath(cwd, relativePath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

function normalizeRelativePathForCompare(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
}

/**
 * Removes on-disk note files for `noteId`. If `exceptRelativePath` is set, that
 * path is skipped (used when we will overwrite the same file — avoids noisy
 * delete+rewrite logs and redundant unlinks).
 */
function deleteNoteFilesForId(
  cwd: string,
  workspaceId: string,
  noteId: string,
  exceptRelativePath?: string
): void {
  const isRoot = workspaceId === DEFAULT_WORKSPACE_ID
  // cwd is the notes root; root notes live directly in cwd, workspace notes in cwd/<workspaceId>/
  const wsDir = isRoot ? cwd : join(cwd, workspaceId)
  if (!existsSync(wsDir)) return
  const exceptNorm = exceptRelativePath
    ? normalizeRelativePathForCompare(exceptRelativePath)
    : null
  const suffix = `--${noteId}.md`
  const legacy = `${noteId}.md`
  const relBase = isRoot ? '' : `${workspaceId}/`
  for (const ent of readdirSync(wsDir, { withFileTypes: true })) {
    if (!ent.isFile()) continue
    if (ent.name.endsWith(suffix) || ent.name === legacy) {
      const rel = `${relBase}${ent.name}`
      if (exceptNorm && normalizeRelativePathForCompare(rel) === exceptNorm) {
        continue
      }
      unlinkSync(join(wsDir, ent.name))
      console.info(LOG, 'deleted note file', ent.name)
    }
  }
}

function readNotelabIndexImpl(cwd: string): {
  workspaces: { id: string; name: string }[]
  notes: {
    workspaceId: string
    noteId: string
    title: string
    updatedAtMs: number
    markdownBody: string
    kind: 'note' | 'drawing'
    coverImageSrc?: string
    titleEmoji?: string
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
    coverImageSrc?: string
    titleEmoji?: string
  }[] = []
  // cwd is the notes root directly — .md files at root level are inbox notes, subdirs are workspaces
  if (!existsSync(cwd)) return { workspaces, notes }

  function pushNote(workspaceId: string, filePath: string): void {
    const content = readFileSync(filePath, 'utf8')
    const parsed = parseNotelabNoteFile(content)
    if (!parsed) return
    notes.push({
      workspaceId,
      noteId: parsed.id,
      title: parsed.title,
      updatedAtMs: parsed.updatedAtMs,
      markdownBody: parsed.body,
      kind: parsed.kind,
      ...(parsed.coverImageSrc !== undefined ? { coverImageSrc: parsed.coverImageSrc } : {}),
      ...(parsed.titleEmoji !== undefined && parsed.titleEmoji !== ''
        ? { titleEmoji: parsed.titleEmoji }
        : {}),
    })
  }

  for (const ent of readdirSync(cwd, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith('.md')) {
      // Root-level .md files belong to the default (inbox) workspace
      pushNote(DEFAULT_WORKSPACE_ID, join(cwd, ent.name))
    } else if (ent.isDirectory()) {
      const id = ent.name
      // Skip hidden dirs and git internals
      if (id.startsWith('.')) continue
      const wsPath = join(cwd, id)
      // Derive workspace name from the directory name slug (before the -- suffix)
      const name = id.includes('--') ? id.slice(0, id.lastIndexOf('--')).replace(/-/g, ' ') : id
      workspaces.push({ id, name: name || id })
      for (const f of readdirSync(wsPath, { withFileTypes: true })) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue
        pushNote(id, join(wsPath, f.name))
      }
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
    async (
      _evt,
      payload?: { path?: string }
    ): Promise<
      | {
          ok: true
          /** The notes root — where note files and git repo live. */
          path: string
          /** Always ~/.notelab — where notelab.config is stored. */
          configRoot: string
          gitAvailable: boolean
          filesystemOnly: boolean
          gitInitialized: boolean
        }
      | { ok: false; error: string }
    > => {
      try {
        migrateNotelabHomeDirIfNeeded()
        const requestedPath = payload?.path?.trim()
        const defaultRoot = join(homedir(), NOTELAB_HOME_DIR)
        // Config always lives in ~/.notelab
        const configRoot = defaultRoot
        mkdirSync(configRoot, { recursive: true })

        let notesRoot: string
        if (requestedPath && requestedPath.length > 0 && resolve(requestedPath) !== resolve(defaultRoot)) {
          // User-chosen directory: use it directly as the notes root (no DATA_DIR subfolder)
          notesRoot = requestedPath
          mkdirSync(notesRoot, { recursive: true })
        } else {
          // Default ~/.notelab: notes live in the DATA_DIR subfolder
          notesRoot = join(defaultRoot, DATA_DIR)
          mkdirSync(notesRoot, { recursive: true })
          migrateLegacyDataLayout(defaultRoot)
        }

        const gitDir = join(notesRoot, '.git')
        const gitCheck = checkGitBinary()
        const gitAvailable = gitCheck.ok
        const gitInitialized = existsSync(gitDir)
        const filesystemOnly = !gitInitialized

        // Ensure a mode file exists when there's no git repo so allowWorkspaceFs passes
        if (!gitInitialized) {
          const modePath = join(notesRoot, MODE_FILE)
          if (!existsSync(modePath)) {
            writeFileSync(
              modePath,
              JSON.stringify({ allowFilesystemWithoutGit: true, syncMode: 'local' }),
              'utf8'
            )
          }
        } else {
          const modePath = join(notesRoot, MODE_FILE)
          if (existsSync(modePath)) unlinkSync(modePath)
        }

        console.info(LOG, 'data root', notesRoot, { configRoot, gitAvailable, gitInitialized, filesystemOnly })
        return { ok: true, path: notesRoot, configRoot, gitAvailable, filesystemOnly, gitInitialized }
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

  /** Opens a native folder picker and returns the chosen path. */
  ipcMain.handle(
    'workspace:pick-directory',
    async (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose workspace folder',
        buttonLabel: 'Select Folder',
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, cancelled: true }
      }
      return { ok: true, path: result.filePaths[0]! }
    }
  )

  /** Initialize a git repository in the given directory. */
  ipcMain.handle(
    'workspace:init-git',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(cwd)) return { ok: false, error: 'directory_not_found' }
      if (existsSync(join(cwd, '.git'))) return { ok: true } // Already initialized
      try {
        runGit(['init'], cwd)
        runGit(['branch', '-M', 'main'], cwd)
        // Remove mode file now that git is initialized
        const modePath = join(cwd, MODE_FILE)
        if (existsSync(modePath)) unlinkSync(modePath)
        console.info(LOG, 'git init', cwd)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'init-git failed', msg)
        return { ok: false, error: msg }
      }
    }
  )

  /**
   * Migrate workspace data from one root to another.
   * Copies notelab/ and notelab.config. Does not delete the source.
   */
  ipcMain.handle(
    'workspace:migrate-workspace',
    async (
      _evt,
      payload: { fromCwd: string; toCwd: string }
    ): Promise<{ ok: true; copiedFiles: number } | { ok: false; error: string }> => {
      const from = payload.fromCwd?.trim() ?? ''
      const to = payload.toCwd?.trim() ?? ''
      if (!from || !to) return { ok: false, error: 'missing_args' }
      if (!existsSync(from)) return { ok: false, error: 'source_not_found' }
      try {
        mkdirSync(to, { recursive: true })
        let copiedFiles = 0

        // Copy notelab.config
        const configSrc = join(from, APP_CONFIG_FILENAME)
        if (existsSync(configSrc)) {
          copyFileSync(configSrc, join(to, APP_CONFIG_FILENAME))
          copiedFiles++
        }

        // Copy notelab/ directory recursively
        const dataSrc = join(from, DATA_DIR)
        if (existsSync(dataSrc)) {
          const copyDir = (src: string, dst: string): void => {
            mkdirSync(dst, { recursive: true })
            for (const ent of readdirSync(src, { withFileTypes: true })) {
              const srcPath = join(src, ent.name)
              const dstPath = join(dst, ent.name)
              if (ent.isDirectory()) {
                copyDir(srcPath, dstPath)
              } else if (ent.isFile()) {
                copyFileSync(srcPath, dstPath)
                copiedFiles++
              }
            }
          }
          copyDir(dataSrc, join(to, DATA_DIR))
        }

        // Ensure mode file exists in destination (no git yet after migration)
        const modePath = join(to, MODE_FILE)
        if (!existsSync(join(to, '.git')) && !existsSync(modePath)) {
          writeFileSync(
            modePath,
            JSON.stringify({ allowFilesystemWithoutGit: true, syncMode: 'local' }),
            'utf8'
          )
        }

        console.info(LOG, 'migrated workspace', from, '→', to, `(${copiedFiles} files)`)
        return { ok: true, copiedFiles }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'migrate-workspace failed', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:read-app-config',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<
      { ok: true; content: string | null } | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !assertNotelabDataRoot(cwd)) {
        return { ok: false, error: 'invalid_data_root' }
      }
      try {
        const primary = appConfigFilePath(cwd)
        if (existsSync(primary)) {
          const content = readFileSync(primary, 'utf8')
          return { ok: true, content: content.trim() ? content : null }
        }
        return { ok: true, content: null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'read-app-config', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:write-app-config',
    async (
      _evt,
      payload: { cwd: string; config: unknown }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !assertNotelabDataRoot(cwd)) {
        return { ok: false, error: 'invalid_data_root' }
      }
      try {
        const path = appConfigFilePath(cwd)
        const body = `${JSON.stringify(payload.config, null, 2)}\n`
        writeFileSync(path, body, 'utf8')
        console.debug(LOG, 'write-app-config', path)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'write-app-config', msg)
        return { ok: false, error: msg }
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
    'workspace:read-notelab-index',
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
            coverImageSrc?: string
            titleEmoji?: string
          }[]
        }
      | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      try {
        const { workspaces, notes } = readNotelabIndexImpl(cwd)
        return { ok: true, workspaces, notes }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'read-notelab-index', msg)
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
        writeNotelabFile(cwd, rel, content)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'write-note-file', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:delete-workspace-folder',
    async (
      _evt,
      payload: { cwd: string; workspaceId: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const workspaceId = payload.workspaceId?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (
        !workspaceId ||
        workspaceId === DEFAULT_WORKSPACE_ID ||
        workspaceId.includes('..') ||
        /[/\\]/.test(workspaceId)
      ) {
        return { ok: false, error: 'invalid_workspace' }
      }
      // cwd is the notes root; workspace folders live directly in cwd
      const workspacesRoot = resolve(cwd)
      const resolvedWs = resolve(workspacesRoot, workspaceId)
      if (dirname(resolvedWs) !== workspacesRoot) {
        return { ok: false, error: 'invalid_workspace' }
      }
      if (!existsSync(resolvedWs)) {
        return { ok: false, error: 'missing_workspace' }
      }
      rmSync(resolvedWs, { recursive: true, force: true })
      console.info(LOG, 'deleted workspace folder', workspaceId)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'workspace:delete-note-files',
    async (
      _evt,
      payload: {
        cwd: string
        workspaceId: string
        noteId: string
        exceptRelativePath?: string
      }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const workspaceId = payload.workspaceId?.trim() ?? ''
      const noteId = payload.noteId?.trim() ?? ''
      const exceptRel =
        typeof payload.exceptRelativePath === 'string'
          ? payload.exceptRelativePath.trim()
          : undefined
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (!workspaceId || !noteId) {
        return { ok: false, error: 'missing_ids' }
      }
      try {
        deleteNoteFilesForId(cwd, workspaceId, noteId, exceptRel)
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
      const authorName = payload.authorName?.trim() || 'notelab.io'
      const authorEmail = payload.authorEmail?.trim() || 'notes@notelab.io'
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
            'No remote named origin. Add your GitHub URL in Settings → GitHub & Git and click “Apply remote to ~/.notelab”.',
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
        const path = line.slice(3).trim().replace(/ -> .+$/, '')
        const xy = `${x}${y}`.replace(/ /g, '')
        const conflicted = conflictXY.has(`${x}${y}`) || x === 'U' || y === 'U'
        const staged = x !== ' ' && x !== '?' && !conflicted
        return { path, x, y, staged, conflicted }
      })
      const hasConflicts = files.some((f) => f.conflicted)
      const rebaseMergePath = join(cwd, '.git', 'rebase-merge')
      const rebaseApplyPath = join(cwd, '.git', 'rebase-apply')
      const isRebasing = existsSync(rebaseMergePath) || existsSync(rebaseApplyPath)
      return { ok: true, files, hasConflicts, isRebasing }
    }
  )

  /** Returns the unified diff for a single file (unstaged changes by default, staged if requested). */
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
      const content = readFileSync(absPath, 'utf8')
      // Extract ours and theirs from conflict markers
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
      if (payload.resolution === 'ours' || payload.resolution === 'theirs') {
        const checkoutArg = payload.resolution === 'ours' ? '--ours' : '--theirs'
        const r = runGitResult(['checkout', checkoutArg, '--', filePath], cwd)
        if (!r.ok) return { ok: false, error: r.error }
      } else if (payload.resolution === 'content' && payload.content !== undefined) {
        writeFileSync(absPath, payload.content, 'utf8')
      } else {
        return { ok: false, error: 'invalid_resolution' }
      }
      const stage = runGitResult(['add', '--', filePath], cwd)
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
      if (!r.ok) return { ok: false, error: r.error }
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
      const r = runGitResult(['rebase', '--abort'], cwd)
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
      const r = runGitResult(
        ['-c', `user.name=${authorName}`, '-c', `user.email=${authorEmail}`, 'rebase', '--continue'],
        cwd
      )
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true }
    }
  )
}

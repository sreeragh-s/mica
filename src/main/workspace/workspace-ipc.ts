/**
 * Workspace IPC handlers — filesystem operations, config, and data root management.
 *
 * All `workspace:*` IPC channels that are NOT git-specific live here.
 * Git-specific channels are in `../git/git-ipc.ts`.
 */

import { dialog, ipcMain, shell } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  DEFAULT_WORKSPACE_ID,
  deleteNoteFile,
  readNotelabIndexImpl,
  renameWorkspacePath,
  syncMarkdownFilesToDisk,
  writeNotelabFile
} from './workspace-fs'
import { checkGitBinary, runGit } from '../git/git-runner'

const LOG = '[notelab-workspace]'

/** Unified app config stored in the system config directory. */
const APP_CONFIG_FILENAME = 'notelab.json'
const WORKSPACE_CONFIG_DIRNAME = '.notelab'
/** System-level config directory, independent of the user's notes workspace. */
const SYSTEM_CONFIG_DIR = join(homedir(), '.notelab')

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assertNotelabDataRoot(cwd: string): boolean {
  const root = cwd?.trim() ?? ''
  if (!root) return false
  const abs = resolve(root)
  if (!abs.startsWith('/') && !abs.match(/^[A-Za-z]:\\/)) return false
  return existsSync(abs)
}

function appConfigFilePath(cwd: string): string {
  const resolvedCwd = resolve(cwd)
  const resolvedSystemConfigDir = resolve(SYSTEM_CONFIG_DIR)
  if (resolvedCwd === resolvedSystemConfigDir) {
    return join(cwd, APP_CONFIG_FILENAME)
  }
  return join(cwd, WORKSPACE_CONFIG_DIRNAME, APP_CONFIG_FILENAME)
}

function legacyAppConfigFilePath(cwd: string): string {
  const resolvedCwd = resolve(cwd)
  const resolvedSystemConfigDir = resolve(SYSTEM_CONFIG_DIR)
  if (resolvedCwd === resolvedSystemConfigDir) {
    return join(cwd, WORKSPACE_CONFIG_DIRNAME, APP_CONFIG_FILENAME)
  }
  return join(cwd, APP_CONFIG_FILENAME)
}

function allowWorkspaceFs(cwd: string): boolean {
  const root = cwd?.trim() ?? ''
  if (!root) return false
  return existsSync(root)
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkspaceIpc(): void {
  ipcMain.handle(
    'workspace:check-git',
    async (): Promise<{ ok: true; version: string } | { ok: false; error: string }> => {
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
          path: string
          configRoot: string
          gitAvailable: boolean
          filesystemOnly: boolean
          gitInitialized: boolean
        }
      | { ok: false; error: string }
    > => {
      try {
        const requestedPath = payload?.path?.trim()
        const documentsDir = join(homedir(), 'Documents')
        const defaultRoot = join(documentsDir, 'notelab')

        const notesRoot = resolve(
          requestedPath && requestedPath.length > 0 ? requestedPath : defaultRoot
        )
        mkdirSync(notesRoot, { recursive: true })
        mkdirSync(SYSTEM_CONFIG_DIR, { recursive: true })

        const gitCheck = checkGitBinary()
        const gitAvailable = gitCheck.ok
        const gitInitialized = existsSync(join(notesRoot, '.git'))
        const filesystemOnly = !gitInitialized

        console.info(LOG, 'workspace root', notesRoot, 'config root', SYSTEM_CONFIG_DIR, {
          gitAvailable,
          gitInitialized,
          filesystemOnly
        })
        return {
          ok: true,
          path: notesRoot,
          configRoot: SYSTEM_CONFIG_DIR,
          gitAvailable,
          filesystemOnly,
          gitInitialized
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'ensure-data-root failed', msg)
        return {
          ok: false,
          error:
            msg.includes('ENOENT') || msg.includes('not found')
              ? 'Could not create the data folder. Check permissions.'
              : msg
        }
      }
    }
  )

  ipcMain.handle(
    'workspace:pick-directory',
    async (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose workspace',
        buttonLabel: 'Select Folder'
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, cancelled: true }
      }
      return { ok: true, path: result.filePaths[0]! }
    }
  )

  ipcMain.handle(
    'workspace:init-git',
    async (
      _evt,
      payload: { cwd: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !existsSync(cwd)) return { ok: false, error: 'directory_not_found' }
      if (existsSync(join(cwd, '.git'))) return { ok: true }
      try {
        runGit(['init'], cwd)
        runGit(['branch', '-M', 'main'], cwd)
        const gitignorePath = join(cwd, '.gitignore')
        const existingGitignore = existsSync(gitignorePath)
          ? readFileSync(gitignorePath, 'utf8')
          : ''
        const normalizedGitignore = existingGitignore.replace(/\r\n/g, '\n')
        const gitignoreEntries = new Set(
          normalizedGitignore
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        )
        const requiredGitignoreEntries = ['.notelab', '.DS_Store', 'Thumbs.db', '*.swp']
        const missingGitignoreEntries = requiredGitignoreEntries.filter(
          (entry) => !gitignoreEntries.has(entry)
        )
        if (missingGitignoreEntries.length > 0) {
          const prefix =
            normalizedGitignore.length === 0 || normalizedGitignore.endsWith('\n')
              ? normalizedGitignore
              : `${normalizedGitignore}\n`
          writeFileSync(gitignorePath, `${prefix}${missingGitignoreEntries.join('\n')}\n`, 'utf8')
        }
        console.info(LOG, 'git init', cwd)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'init-git failed', msg)
        return { ok: false, error: msg }
      }
    }
  )

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

        for (const entry of readdirSync(from, { withFileTypes: true })) {
          if (entry.name === APP_CONFIG_FILENAME || entry.name.startsWith('.')) continue
          if (entry.isDirectory() || entry.isFile()) {
            copyDir(join(from, entry.name), join(to, entry.name))
          }
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
    ): Promise<{ ok: true; content: string | null } | { ok: false; error: string }> => {
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
        const legacy = legacyAppConfigFilePath(cwd)
        if (existsSync(legacy)) {
          const content = readFileSync(legacy, 'utf8')
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
        mkdirSync(dirname(path), { recursive: true })
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

  ipcMain.handle('workspace:open-external', async (_evt, url: string) => {
    const u = typeof url === 'string' ? url.trim() : ''
    if (!u) return
    await shell.openExternal(u)
  })

  ipcMain.handle(
    'workspace:sync-markdown',
    async (
      _evt,
      payload: {
        cwd: string
        folder: string
        files: { relativePath: string; content: string }[]
        pruneOrphanNoteFiles?: boolean
      }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const folder = payload.folder?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (!folder) {
        return { ok: false, error: 'missing_folder' }
      }
      try {
        syncMarkdownFilesToDisk(
          cwd,
          folder,
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
          folders: { folder: string; name: string }[]
          notes: {
            folder: string
            note: string
            title: string
            updatedAtMs: number
            markdownBody: string
            kind: 'note' | 'drawing'
            coverImageSrc?: string
            titleEmoji?: string
            properties?: Record<string, string | string[]>
            hasFrontmatterBlock?: boolean
          }[]
        }
      | { ok: false; error: string }
    > => {
      const cwd = payload.cwd?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      try {
        const { folders, notes } = await readNotelabIndexImpl(cwd)
        return { ok: true, folders, notes }
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
    'workspace:delete-folder',
    async (
      _evt,
      payload: { cwd: string; folder: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const folder = payload.folder?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (
        !folder ||
        folder === DEFAULT_WORKSPACE_ID ||
        folder.includes('..') ||
        /[/\\]/.test(folder)
      ) {
        return { ok: false, error: 'invalid_folder' }
      }
      const workspaceRoot = resolve(cwd)
      const resolvedFolder = resolve(workspaceRoot, folder)
      if (dirname(resolvedFolder) !== workspaceRoot) {
        return { ok: false, error: 'invalid_folder' }
      }
      if (!existsSync(resolvedFolder)) {
        return { ok: false, error: 'missing_folder' }
      }
      rmSync(resolvedFolder, { recursive: true, force: true })
      console.info(LOG, 'deleted folder', folder)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'workspace:create-folder',
    async (
      _evt,
      payload: { cwd: string; folder: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const folder = payload.folder?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) return { ok: false, error: 'not_a_workspace' }
      if (!folder || folder.includes('..') || /[/\\]/.test(folder)) {
        return { ok: false, error: 'invalid_folder' }
      }
      try {
        mkdirSync(join(cwd, folder), { recursive: true })
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:delete-note-file',
    async (
      _evt,
      payload: {
        cwd: string
        note: string
      }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const note = payload.note?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (!note) {
        return { ok: false, error: 'missing_note' }
      }
      try {
        deleteNoteFile(cwd, note)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'delete-note-file', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'workspace:rename-path',
    async (
      _evt,
      payload: { cwd: string; from: string; to: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const cwd = payload.cwd?.trim() ?? ''
      const from = payload.from?.trim() ?? ''
      const to = payload.to?.trim() ?? ''
      if (!cwd || !allowWorkspaceFs(cwd)) {
        return { ok: false, error: 'not_a_workspace' }
      }
      if (!from || !to) {
        return { ok: false, error: 'missing_path' }
      }
      try {
        renameWorkspacePath(cwd, from, to)
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'rename-path', msg)
        return { ok: false, error: msg }
      }
    }
  )
}

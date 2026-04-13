import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import {
  parseOptionalFrontmatter,
  type NotePropertyMap,
  type NotePropertyValue
} from '@shared/notes/note-markdown'

function firstScalarPropertyValue(v: NotePropertyValue | undefined): string | undefined {
  if (v === undefined) return undefined
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === 'string' && x.trim().length > 0)
    return typeof s === 'string' ? s : undefined
  }
  return v.trim() === '' ? undefined : v
}

interface DirEntry {
  name: string
  isDirectory: () => boolean
  isFile: () => boolean
}

async function* walkDirectory(
  dirPath: string,
  maxDepth: number = 2,
  currentDepth: number = 0
): AsyncGenerator<{ path: string; isDir: boolean; name: string }> {
  if (currentDepth > maxDepth) return

  let entries: DirEntry[]
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const relativePath = fullPath.replace(dirPath, '').replace(/^[/\\]/, '')

    if (entry.isDirectory()) {
      if (relativePath.startsWith('.') && relativePath !== JOURNAL_FOLDER_ID) continue
      yield { path: relativePath, isDir: true, name: entry.name }
      yield* walkDirectory(fullPath, maxDepth, currentDepth + 1)
    } else if (entry.isFile()) {
      yield { path: relativePath, isDir: false, name: entry.name }
    }
  }
}

export const DEFAULT_WORKSPACE_ID = 'default'
export const JOURNAL_FOLDER_ID = '.journal'

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

function parseNotelabNoteFile(
  content: string,
  filePath: string,
  updatedAtMs: number
): {
  note: string
  title: string
  updatedAtMs: number
  body: string
  kind: 'note' | 'drawing' | 'pdf'
  coverImageSrc?: string
  titleEmoji?: string
  properties: NotePropertyMap
  hasFrontmatterBlock: boolean
} | null {
  const parsed = parseOptionalFrontmatter(content)
  const title = basename(filePath, extname(filePath))
  const extension = extname(filePath).toLowerCase()
  const kind: 'note' | 'drawing' | 'pdf' =
    extension === '.excalidraw' ? 'drawing' : extension === '.pdf' ? 'pdf' : 'note'
  const normalizedPath = filePath.replace(/\\/g, '/')
  const coverImageSrc = firstScalarPropertyValue(parsed.properties.cover_image)
  const titleEmoji = firstScalarPropertyValue(parsed.properties.title_emoji)
  return {
    note: normalizedPath,
    title,
    updatedAtMs,
    body: parsed.body.replace(/^\n+/, ''),
    kind,
    ...(coverImageSrc !== undefined ? { coverImageSrc } : {}),
    ...(titleEmoji !== undefined ? { titleEmoji } : {}),
    properties: parsed.properties,
    hasFrontmatterBlock: parsed.hasFrontmatterBlock
  }
}

export function syncMarkdownFilesToDisk(
  cwd: string,
  folder: string,
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

  const isRoot = folder === DEFAULT_WORKSPACE_ID
  const scanDir = isRoot ? cwd : join(cwd, folder)
  if (!existsSync(scanDir)) return
  const prefix = isRoot ? '' : `${folder}/`
  for (const ent of readdirSync(scanDir, { withFileTypes: true })) {
    if (isRoot && !ent.isFile()) continue
    if (!ent.isFile() || (!ent.name.endsWith('.md') && !ent.name.endsWith('.excalidraw'))) continue
    const rel = `${prefix}${ent.name}`
    if (!writtenRel.has(rel)) {
      unlinkSync(join(scanDir, ent.name))
    }
  }
}

export function writeNotelabFile(cwd: string, relativePath: string, content: string): void {
  const abs = assertSafeRelativePath(cwd, relativePath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

export async function readWorkspaceBinaryFile(cwd: string, relativePath: string): Promise<Buffer> {
  const abs = assertSafeRelativePath(cwd, relativePath)
  return readFile(abs)
}

export async function readWorkspaceTextFile(cwd: string, relativePath: string): Promise<string> {
  const abs = assertSafeRelativePath(cwd, relativePath)
  return readFile(abs, 'utf8')
}

export async function readWorkspaceMtimeMs(cwd: string, relativePath: string): Promise<number> {
  const abs = assertSafeRelativePath(cwd, relativePath)
  const fileStat = await stat(abs)
  return fileStat.mtimeMs
}

export function deleteNoteFile(cwd: string, relativePath: string): void {
  const abs = assertSafeRelativePath(cwd, relativePath)
  if (!existsSync(abs)) return
  unlinkSync(abs)
}

export function renameWorkspacePath(
  cwd: string,
  fromRelativePath: string,
  toRelativePath: string
): void {
  const fromAbs = assertSafeRelativePath(cwd, fromRelativePath)
  const toAbs = assertSafeRelativePath(cwd, toRelativePath)
  if (!existsSync(fromAbs)) {
    throw new Error('missing_source')
  }
  if (fromRelativePath.replace(/\\/g, '/') === toRelativePath.replace(/\\/g, '/')) {
    return
  }
  if (existsSync(toAbs)) {
    throw new Error('destination_exists')
  }
  mkdirSync(dirname(toAbs), { recursive: true })
  renameSync(fromAbs, toAbs)
}

export async function readNotelabIndexImpl(
  cwd: string,
  options: { includeBody?: boolean } = {}
): Promise<{
  folders: { folder: string; name: string }[]
  notes: {
    folder: string
    note: string
    title: string
    updatedAtMs: number
    markdownBody?: string
    kind: 'note' | 'drawing' | 'pdf'
    coverImageSrc?: string
    titleEmoji?: string
    properties?: NotePropertyMap
    hasFrontmatterBlock?: boolean
  }[]
}> {
  const includeBody = options.includeBody ?? true
  const folders: { folder: string; name: string }[] = []
  if (!existsSync(cwd)) return { folders, notes: [] }

  interface NoteTask {
    folder: string
    relativeFilePath: string
  }

  const noteTasks: NoteTask[] = []
  const folderSet = new Set<string>()

  for await (const entry of walkDirectory(cwd)) {
    if (entry.isDir) {
      const folder = entry.name
      if (folder.startsWith('.') && folder !== JOURNAL_FOLDER_ID) continue
      if (folder !== JOURNAL_FOLDER_ID && !folderSet.has(folder)) {
        folderSet.add(folder)
        folders.push({ folder, name: folder })
      }
    } else {
      const ext = extname(entry.name).toLowerCase()
      if (ext !== '.md' && ext !== '.excalidraw' && ext !== '.pdf') continue

      const relPath = entry.path.replace(/\\/g, '/')
      const folder = relPath.includes('/') ? relPath.split('/')[0] : DEFAULT_WORKSPACE_ID

      noteTasks.push({ folder, relativeFilePath: relPath })
    }
  }

  if (noteTasks.length === 0) {
    return { folders, notes: [] }
  }

  if (!includeBody) {
    const filePaths = noteTasks.map((t) => join(cwd, t.relativeFilePath))
    const stats = await Promise.all(filePaths.map((p) => stat(p).catch(() => null)))

    const notes: {
      folder: string
      note: string
      title: string
      updatedAtMs: number
      kind: 'note' | 'drawing' | 'pdf'
      coverImageSrc?: string
      titleEmoji?: string
      properties?: NotePropertyMap
      hasFrontmatterBlock?: boolean
    }[] = []

    for (let i = 0; i < noteTasks.length; i++) {
      const task = noteTasks[i]
      const fileStat = stats[i]
      if (!fileStat) continue

      const extension = extname(task.relativeFilePath).toLowerCase()
      if (extension === '.pdf') {
        notes.push({
          folder: task.folder,
          note: task.relativeFilePath.replace(/\\/g, '/'),
          title: basename(task.relativeFilePath, extension),
          updatedAtMs: fileStat.mtimeMs,
          kind: 'pdf' as const
        })
        continue
      }

      const content = await readFile(join(cwd, task.relativeFilePath), 'utf8').catch(() => '')
      if (!content) continue

      const hasFrontmatterBlock = content.startsWith('---')
      let properties: NotePropertyMap = {}
      let coverImageSrc: string | undefined
      let titleEmoji: string | undefined

      if (hasFrontmatterBlock) {
        const fmEnd = content.indexOf('---', 3)
        if (fmEnd > 3) {
          const fmContent = content.slice(3, fmEnd).trim()
          const parsedFm = parseOptionalFrontmatter(`---\n${fmContent}\n---`)
          if (parsedFm) {
            properties = parsedFm.properties
            coverImageSrc = firstScalarPropertyValue(properties.cover_image)
            titleEmoji = firstScalarPropertyValue(properties.title_emoji)
          }
        }
      }

      notes.push({
        folder: task.folder,
        note: task.relativeFilePath.replace(/\\/g, '/'),
        title: basename(task.relativeFilePath, extname(task.relativeFilePath)),
        updatedAtMs: fileStat.mtimeMs,
        kind: extension === '.excalidraw' ? ('drawing' as const) : ('note' as const),
        ...(coverImageSrc !== undefined ? { coverImageSrc } : {}),
        ...(titleEmoji !== undefined && titleEmoji !== '' ? { titleEmoji } : {}),
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
        ...(hasFrontmatterBlock ? { hasFrontmatterBlock: true } : {})
      })
    }

    return { folders, notes }
  }

  const notes = (
    await Promise.all(
      noteTasks.map(async ({ folder, relativeFilePath }) => {
        const filePath = join(cwd, relativeFilePath)
        const fileStat = await stat(filePath)
        const extension = extname(relativeFilePath).toLowerCase()
        if (extension === '.pdf') {
          return {
            folder,
            note: relativeFilePath.replace(/\\/g, '/'),
            title: basename(relativeFilePath, extension),
            updatedAtMs: fileStat.mtimeMs,
            kind: 'pdf' as const
          }
        }
        const content = await readFile(filePath, 'utf8')
        const parsed = parseNotelabNoteFile(content, relativeFilePath, fileStat.mtimeMs)
        if (!parsed) return null
        return {
          folder,
          note: parsed.note,
          title: parsed.title,
          updatedAtMs: parsed.updatedAtMs,
          kind: parsed.kind,
          ...(includeBody ? { markdownBody: parsed.body } : {}),
          ...(parsed.coverImageSrc !== undefined ? { coverImageSrc: parsed.coverImageSrc } : {}),
          ...(parsed.titleEmoji !== undefined && parsed.titleEmoji !== ''
            ? { titleEmoji: parsed.titleEmoji }
            : {}),
          ...(Object.keys(parsed.properties).length > 0 ? { properties: parsed.properties } : {}),
          ...(parsed.hasFrontmatterBlock ? { hasFrontmatterBlock: true } : {})
        }
      })
    )
  ).filter((n) => n !== null)

  return { folders, notes }
}

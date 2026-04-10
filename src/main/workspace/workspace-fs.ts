import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import {
  parseOptionalFrontmatter,
  type NotePropertyMap,
  type NotePropertyValue,
} from '../../shared/note-markdown'

function firstScalarPropertyValue(v: NotePropertyValue | undefined): string | undefined {
  if (v === undefined) return undefined
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === 'string' && x.trim().length > 0)
    return typeof s === 'string' ? s : undefined
  }
  return v.trim() === '' ? undefined : v
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

function parseNotelabNoteFile(content: string, filePath: string, updatedAtMs: number): {
  note: string
  title: string
  updatedAtMs: number
  body: string
  kind: 'note' | 'drawing'
  coverImageSrc?: string
  titleEmoji?: string
  properties: NotePropertyMap
  hasFrontmatterBlock: boolean
} | null {
  const parsed = parseOptionalFrontmatter(content)
  const title = basename(filePath, extname(filePath))
  const kind: 'note' | 'drawing' = extname(filePath).toLowerCase() === '.excalidraw' ? 'drawing' : 'note'
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
    hasFrontmatterBlock: parsed.hasFrontmatterBlock,
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

export function deleteNoteFile(cwd: string, relativePath: string): void {
  const abs = assertSafeRelativePath(cwd, relativePath)
  if (!existsSync(abs)) return
  unlinkSync(abs)
}

export function renameWorkspacePath(cwd: string, fromRelativePath: string, toRelativePath: string): void {
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

export function readNotelabIndexImpl(cwd: string): {
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
    properties?: NotePropertyMap
    hasFrontmatterBlock?: boolean
  }[]
} {
  const folders: { folder: string; name: string }[] = []
  const notes: {
    folder: string
    note: string
    title: string
    updatedAtMs: number
    markdownBody: string
    kind: 'note' | 'drawing'
    coverImageSrc?: string
    titleEmoji?: string
    properties?: NotePropertyMap
    hasFrontmatterBlock?: boolean
  }[] = []
  if (!existsSync(cwd)) return { folders, notes }

  function pushNote(folder: string, relativeFilePath: string): void {
    const filePath = join(cwd, relativeFilePath)
    const content = readFileSync(filePath, 'utf8')
    const parsed = parseNotelabNoteFile(content, relativeFilePath, statSync(filePath).mtimeMs)
    if (!parsed) return
    notes.push({
      folder,
      note: parsed.note,
      title: parsed.title,
      updatedAtMs: parsed.updatedAtMs,
      markdownBody: parsed.body,
      kind: parsed.kind,
      ...(parsed.coverImageSrc !== undefined ? { coverImageSrc: parsed.coverImageSrc } : {}),
      ...(parsed.titleEmoji !== undefined && parsed.titleEmoji !== ''
        ? { titleEmoji: parsed.titleEmoji }
        : {}),
      ...(Object.keys(parsed.properties).length > 0 ? { properties: parsed.properties } : {}),
      ...(parsed.hasFrontmatterBlock ? { hasFrontmatterBlock: true } : {}),
    })
  }

  for (const ent of readdirSync(cwd, { withFileTypes: true })) {
    if (ent.isFile() && (ent.name.endsWith('.md') || ent.name.endsWith('.excalidraw'))) {
      pushNote(DEFAULT_WORKSPACE_ID, ent.name)
    } else if (ent.isDirectory()) {
      const folder = ent.name
      if (folder.startsWith('.') && folder !== JOURNAL_FOLDER_ID) continue
      const wsPath = join(cwd, folder)
      if (folder !== JOURNAL_FOLDER_ID) {
        folders.push({ folder, name: folder })
      }
      for (const file of readdirSync(wsPath, { withFileTypes: true })) {
        if (!file.isFile() || (!file.name.endsWith('.md') && !file.name.endsWith('.excalidraw'))) continue
        pushNote(folder, `${folder}/${file.name}`)
      }
    }
  }

  return { folders, notes }
}

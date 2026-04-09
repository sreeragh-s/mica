import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'

export const DEFAULT_WORKSPACE_ID = 'default'

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

function parseNotelabNoteFile(content: string, filePath: string): {
  note: string
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
  let title = basename(filePath, extname(filePath)).replace(/-/g, ' ')
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
  return { note: filePath.replace(/\\/g, '/'), title, updatedAtMs, body, kind, coverImageSrc, titleEmoji }
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
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue
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
  }[] = []
  if (!existsSync(cwd)) return { folders, notes }

  function pushNote(folder: string, relativeFilePath: string): void {
    const filePath = join(cwd, relativeFilePath)
    const content = readFileSync(filePath, 'utf8')
    const parsed = parseNotelabNoteFile(content, relativeFilePath)
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
    })
  }

  for (const ent of readdirSync(cwd, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith('.md')) {
      pushNote(DEFAULT_WORKSPACE_ID, ent.name)
    } else if (ent.isDirectory()) {
      const folder = ent.name
      if (folder.startsWith('.')) continue
      const wsPath = join(cwd, folder)
      folders.push({ folder, name: folder })
      for (const file of readdirSync(wsPath, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith('.md')) continue
        pushNote(folder, `${folder}/${file.name}`)
      }
    }
  }

  return { folders, notes }
}

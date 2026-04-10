import Dexie, { type Table } from 'dexie'

import type { SavedNote } from '@/lib/notes/notes-storage'

const SEP = '\u0000'

export type NoteSearchCacheRow = {
  /** `${workspaceKey}\0${notePath}` */
  id: string
  workspaceKey: string
  notePath: string
  folder: string
  title: string
  kind: NonNullable<SavedNote['kind']>
  plainText: string
  updatedAt: number
  tagsJson: string
  aliasesJson: string
  propertiesJson: string
}

export type LinkMentionCacheRow = {
  /** Stable row id within workspace */
  id: string
  workspaceKey: string
  /** `${workspaceKey}\0${target}` for indexed backlinks lookup */
  wsTarget: string
  source: string
  target: string
  contextText: string
  linkText: string
}

export function noteCacheRowId(workspaceKey: string, notePath: string): string {
  return `${workspaceKey}${SEP}${notePath}`
}

export function wsTargetKey(workspaceKey: string, targetPath: string): string {
  return `${workspaceKey}${SEP}${targetPath}`
}

class NotelabNotesCacheDb extends Dexie {
  noteRows!: Table<NoteSearchCacheRow, string>
  linkMentions!: Table<LinkMentionCacheRow, string>

  constructor() {
    super('notelab-notes-cache')
    this.version(1).stores({
      noteRows: 'id, workspaceKey, notePath',
      linkMentions: 'id, wsTarget, workspaceKey, source, target'
    })
  }
}

let dbSingleton: NotelabNotesCacheDb | null = null

export function getNotesCacheDb(): NotelabNotesCacheDb {
  if (!dbSingleton) dbSingleton = new NotelabNotesCacheDb()
  return dbSingleton
}

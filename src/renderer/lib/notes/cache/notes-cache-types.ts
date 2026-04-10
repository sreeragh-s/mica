/** Property key/value catalog for autocomplete (excludes cover/title UI keys). */
export type NotesPropertyCatalog = {
  allWorkspaceKeys: string[]
  allValuesForKey: Record<string, string[]>
}

export type CachedLinkMention = {
  source: string
  target: string
  contextText: string
  linkText: string
}

/** Precomputed link mentions for backlinks / outgoing panels without walking Lexical. */
export type WorkspaceLinkMentionIndex = {
  validPaths: ReadonlySet<string>
  backlinksByTarget: ReadonlyMap<string, CachedLinkMention[]>
  outgoingBySource: ReadonlyMap<string, CachedLinkMention[]>
}

export type NotesWorkspaceCacheSnapshot = {
  plainTextByPath: ReadonlyMap<string, string>
  propertyCatalog: NotesPropertyCatalog
  linkMentionIndex: WorkspaceLinkMentionIndex
  indexedAt: number
}

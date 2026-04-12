export type NotesPropertyCatalog = {
  allWorkspaceKeys: string[]
  allValuesForKey: Record<string, string[]>
}

export type LinkMention = {
  source: string
  target: string
  linkText: string
  contextText: string
}

export type WorkspaceLinkMentionIndex = {
  backlinksByTarget: Map<string, LinkMention[]>
  outgoingBySource: Map<string, LinkMention[]>
  validPaths: Set<string>
}

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

export type WorkspaceLinkMentionIndexPayload = {
  backlinksByTarget: Record<string, LinkMention[]>
  outgoingBySource: Record<string, LinkMention[]>
  validPaths: string[]
}

export function reviveWorkspaceLinkMentionIndex(
  payload: WorkspaceLinkMentionIndexPayload
): WorkspaceLinkMentionIndex {
  return {
    backlinksByTarget: new Map(Object.entries(payload.backlinksByTarget)),
    outgoingBySource: new Map(Object.entries(payload.outgoingBySource)),
    validPaths: new Set(payload.validPaths)
  }
}

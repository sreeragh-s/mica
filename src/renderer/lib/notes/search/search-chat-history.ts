import { buildHighlightSegments, scoreMatch } from './query-match'
import type { ChatHistorySearchResult, ChatHistorySessionMeta } from './search-types'

export type { ChatHistorySessionMeta, ChatHistorySearchResult } from './search-types'

/**
 * Fuzzy-find chat history sessions by title (same scoring/highlight rules as note title search).
 */
export function searchChatHistorySessions(
  items: ChatHistorySessionMeta[],
  query: string,
  options?: { limit?: number }
): ChatHistorySearchResult[] {
  const q = query.trim()
  const limit = options?.limit ?? 100

  if (!q.length) {
    return items
      .map((meta) => {
        const title = meta.title?.trim() || 'Untitled'
        return {
          meta,
          score: 0,
          titleSegments: buildHighlightSegments(title, '')
        }
      })
      .sort((a, b) => b.meta.createdAt - a.meta.createdAt)
      .slice(0, limit)
  }

  const scored: ChatHistorySearchResult[] = []
  for (const meta of items) {
    const title = meta.title?.trim() || 'Untitled'
    const st = scoreMatch(q, title)
    if (st === null) continue
    scored.push({
      meta,
      score: st,
      titleSegments: buildHighlightSegments(title, q)
    })
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.meta.createdAt - a.meta.createdAt
  })
  return scored.slice(0, limit)
}

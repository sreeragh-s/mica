import { useLayoutEffect, useRef, type JSX, type RefObject } from 'react'

import { PropertyIcon } from './PropertyIcon'

function useScrollActiveSuggestion(
  listRef: RefObject<HTMLDivElement | null>,
  highlightedIndex: number,
  suggestions: readonly string[]
): void {
  useLayoutEffect(() => {
    const root = listRef.current
    if (!root || suggestions.length === 0) return
    const safeIndex = Math.max(0, Math.min(highlightedIndex, suggestions.length - 1))
    const target = root.querySelector<HTMLElement>(
      `[data-suggestion-index="${safeIndex}"]`
    )
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [highlightedIndex, suggestions])
}

const listClassName =
  'absolute left-0 top-full z-50 mt-0.5 w-64 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md'

export function ValueSuggestDropdown({
  suggestions,
  highlightedIndex,
  onSelect
}: {
  suggestions: string[]
  highlightedIndex: number
  onSelect: (value: string) => void
}): JSX.Element | null {
  const listRef = useRef<HTMLDivElement>(null)
  useScrollActiveSuggestion(listRef, highlightedIndex, suggestions)

  if (suggestions.length === 0) return null
  return (
    <div ref={listRef} className={listClassName}>
      {suggestions.map((s, i) => (
        <button
          key={`${s}-${i}`}
          type="button"
          data-suggestion-index={i}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(s)
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
        >
          <span className="truncate text-muted-foreground">{s}</span>
        </button>
      ))}
    </div>
  )
}

export function KeySuggestDropdown({
  suggestions,
  highlightedIndex,
  onSelect
}: {
  suggestions: string[]
  highlightedIndex: number
  onSelect: (key: string) => void
}): JSX.Element | null {
  const listRef = useRef<HTMLDivElement>(null)
  useScrollActiveSuggestion(listRef, highlightedIndex, suggestions)

  if (suggestions.length === 0) return null
  return (
    <div ref={listRef} className={listClassName}>
      {suggestions.map((s, i) => (
        <button
          key={`${s}-${i}`}
          type="button"
          data-suggestion-index={i}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(s)
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
        >
          <PropertyIcon propKey={s} />
          <span>{s}</span>
        </button>
      ))}
    </div>
  )
}

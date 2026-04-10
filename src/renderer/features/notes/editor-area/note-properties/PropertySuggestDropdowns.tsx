import type { JSX } from 'react'

import { PropertyIcon } from './PropertyIcon'

export function ValueSuggestDropdown({
  suggestions,
  highlightedIndex,
  onSelect
}: {
  suggestions: string[]
  highlightedIndex: number
  onSelect: (value: string) => void
}): JSX.Element | null {
  if (suggestions.length === 0) return null
  return (
    <div className="absolute left-0 top-full z-50 mt-0.5 w-64 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
      {suggestions.map((s, i) => (
        <button
          key={s}
          type="button"
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
  if (suggestions.length === 0) return null
  return (
    <div className="absolute left-0 top-full z-50 mt-0.5 w-64 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
      {suggestions.map((s, i) => (
        <button
          key={s}
          type="button"
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

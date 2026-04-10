import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { Trash2 } from 'lucide-react'

import { KeySuggestDropdown, ValueSuggestDropdown } from './PropertySuggestDropdowns'
import { buildPropertyKeySuggestions, PropertyIcon } from './PropertyIcon'
import { buildPropertyValueSuggestions } from './property-value-suggestions'

export function PropertyRow({
  propKey,
  savedValue,
  autoFocusValue,
  allWorkspaceKeys,
  allValuesForKey,
  onCommitValue,
  onRename,
  onDelete,
  valuePlaceholder = 'Empty'
}: {
  propKey: string
  savedValue: string
  autoFocusValue?: boolean
  allWorkspaceKeys: string[]
  allValuesForKey: string[]
  valuePlaceholder?: string
  onCommitValue: (value: string) => void
  onRename: (newKey: string) => void
  onDelete: () => void
}): JSX.Element {
  const [valueDraft, setValueDraft] = useState(savedValue)
  const [keyDraft, setKeyDraft] = useState(propKey)
  const [editingKey, setEditingKey] = useState(false)
  const [keyHighlightedIndex, setKeyHighlightedIndex] = useState(0)
  const [valueHighlightedIndex, setValueHighlightedIndex] = useState(0)
  const [showValueSuggestions, setShowValueSuggestions] = useState(false)
  const valueRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  /** Blur uses a delayed commit; keep latest drafts in refs so we never commit stale closed-over state. */
  const valueDraftRef = useRef(valueDraft)
  const keyDraftRef = useRef(keyDraft)
  valueDraftRef.current = valueDraft
  keyDraftRef.current = keyDraft

  const keySuggestions = buildPropertyKeySuggestions(keyDraft, allWorkspaceKeys, new Set([propKey]))
  const valueSuggestions = buildPropertyValueSuggestions(
    allValuesForKey,
    propKey,
    valueDraft,
    savedValue
  )

  useEffect(() => {
    setValueDraft(savedValue)
  }, [savedValue])
  useEffect(() => {
    setKeyDraft(propKey)
  }, [propKey])
  useEffect(() => {
    if (autoFocusValue) valueRef.current?.focus()
  }, [autoFocusValue])

  function commitValue(): void {
    setShowValueSuggestions(false)
    onCommitValue(valueDraftRef.current)
  }

  function startEditingKey(): void {
    setEditingKey(true)
    setKeyHighlightedIndex(0)
    requestAnimationFrame(() => keyRef.current?.focus())
  }

  function commitKey(): void {
    setEditingKey(false)
    const next = keyDraftRef.current.trim()
    if (!next || next === propKey) {
      setKeyDraft(propKey)
      return
    }
    onRename(next)
  }

  function handleValueKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setValueHighlightedIndex((i) => Math.min(i + 1, valueSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setValueHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (valueSuggestions.length > 0 && valueSuggestions[valueHighlightedIndex]) {
        const picked = valueSuggestions[valueHighlightedIndex]
        valueDraftRef.current = picked
        setValueDraft(picked)
      }
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setValueDraft(savedValue)
      setShowValueSuggestions(false)
    }
  }

  return (
    <div className="group/row flex items-center gap-0 rounded-sm px-2 py-1.5 transition-colors hover:bg-accent/50">
      <div className="relative w-52 shrink-0">
        <div
          className="flex cursor-text items-center gap-2"
          onClick={() => {
            if (!editingKey) startEditingKey()
          }}
        >
          <PropertyIcon propKey={propKey} />
          {editingKey ? (
            <input
              ref={keyRef}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              value={keyDraft}
              onChange={(e) => {
                const v = e.target.value
                keyDraftRef.current = v
                setKeyDraft(v)
                setKeyHighlightedIndex(0)
              }}
              onBlur={() => {
                setTimeout(commitKey, 100)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setKeyHighlightedIndex((i) => Math.min(i + 1, keySuggestions.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setKeyHighlightedIndex((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (keySuggestions.length > 0 && keySuggestions[keyHighlightedIndex]) {
                    const picked = keySuggestions[keyHighlightedIndex]
                    keyDraftRef.current = picked
                    setKeyDraft(picked)
                  }
                  e.currentTarget.blur()
                } else if (e.key === 'Escape') {
                  setKeyDraft(propKey)
                  setEditingKey(false)
                }
              }}
            />
          ) : (
            <span className="truncate text-sm text-foreground/80">{propKey}</span>
          )}
        </div>
        {editingKey && (
          <KeySuggestDropdown
            suggestions={keySuggestions}
            highlightedIndex={keyHighlightedIndex}
            onSelect={(k) => {
              keyDraftRef.current = k
              setKeyDraft(k)
              keyRef.current?.blur()
            }}
          />
        )}
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="flex cursor-text items-center" onClick={() => valueRef.current?.focus()}>
          <input
            ref={valueRef}
            value={valueDraft}
            onChange={(e) => {
              const v = e.target.value
              valueDraftRef.current = v
              setValueDraft(v)
              setShowValueSuggestions(true)
              setValueHighlightedIndex(0)
            }}
            onFocus={() => setShowValueSuggestions(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowValueSuggestions(false)
                commitValue()
              }, 100)
            }}
            onKeyDown={handleValueKeyDown}
            placeholder={valuePlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        {showValueSuggestions && valueSuggestions.length > 0 && (
          <ValueSuggestDropdown
            suggestions={valueSuggestions}
            highlightedIndex={valueHighlightedIndex}
            onSelect={(v) => {
              valueDraftRef.current = v
              setValueDraft(v)
              setShowValueSuggestions(false)
              valueRef.current?.blur()
            }}
          />
        )}
      </div>

      <button
        type="button"
        aria-label={`Remove ${propKey}`}
        onClick={onDelete}
        className="ml-2 flex size-5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover/row:opacity-100 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

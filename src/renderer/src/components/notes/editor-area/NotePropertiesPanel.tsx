import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { AlignLeft, Calendar, Clock, CornerDownRight, Hash, Link, MapPin, Plus, Tag, Trash2, Type, User } from 'lucide-react'
import type { SavedNote } from '@/lib/notes/notes-storage'
import type { NotelabEditorSettingsV1 } from '@/lib/config/notelab-config-schema'

type NotePropertiesPanelProps = {
  note: SavedNote
  notes: SavedNote[]
  editorSettings: Required<NotelabEditorSettingsV1>
  onSetProperty: (key: string, value: string | null) => void
}

function PropertyIcon({ propKey }: { propKey: string }): JSX.Element {
  const k = propKey.toLowerCase()
  const cls = 'size-4 shrink-0 text-muted-foreground'
  if (k === 'aliases') return <CornerDownRight className={cls} />
  if (k === 'tags' || k === 'category' || k === 'categories') return <Tag className={cls} />
  if (k.includes('url') || k.includes('link') || k.includes('href') || k === 'source') return <Link className={cls} />
  if (k.includes('count') || k.includes('num') || k.includes('rating') || k.includes('order') || k.includes('weight')) return <Hash className={cls} />
  if (k.includes('desc') || k.includes('summary') || k.includes('excerpt') || k.includes('abstract')) return <AlignLeft className={cls} />
  if (k.includes('author') || k.includes('creator') || k.includes('owner') || k.includes('assign') || k.includes('by')) return <User className={cls} />
  if (k.includes('date') || k.includes('created') || k.includes('published') || k.includes('modified') || k.includes('updated')) return <Calendar className={cls} />
  if (k.includes('time') || k.includes('duration') || k.includes('deadline') || k.includes('due')) return <Clock className={cls} />
  if (k.includes('location') || k.includes('place') || k.includes('city') || k.includes('country') || k.includes('region')) return <MapPin className={cls} />
  return <Type className={cls} />
}

function ValueSuggestDropdown({
  suggestions,
  highlightedIndex,
  onSelect,
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
          onMouseDown={(e) => { e.preventDefault(); onSelect(s) }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
        >
          <span className="truncate text-muted-foreground">{s}</span>
        </button>
      ))}
    </div>
  )
}

function PropertyRow({
  propKey,
  savedValue,
  autoFocusValue,
  allWorkspaceKeys,
  allValuesForKey,
  onCommitValue,
  onRename,
  onDelete,
}: {
  propKey: string
  savedValue: string
  autoFocusValue?: boolean
  allWorkspaceKeys: string[]
  allValuesForKey: string[]
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

  const keySuggestions = allWorkspaceKeys.filter(
    (k) => k !== propKey && k.toLowerCase().includes(keyDraft.toLowerCase())
  )
  const valueSuggestions = allValuesForKey.filter(
    (v) => v !== savedValue && v.toLowerCase().includes(valueDraft.toLowerCase())
  )

  useEffect(() => { setValueDraft(savedValue) }, [savedValue])
  useEffect(() => { setKeyDraft(propKey) }, [propKey])
  useEffect(() => { if (autoFocusValue) valueRef.current?.focus() }, [autoFocusValue])

  function commitValue() {
    setShowValueSuggestions(false)
    onCommitValue(valueDraft)
  }

  function startEditingKey() {
    setEditingKey(true)
    setKeyHighlightedIndex(0)
    requestAnimationFrame(() => keyRef.current?.focus())
  }

  function commitKey() {
    setEditingKey(false)
    const next = keyDraft.trim()
    if (!next || next === propKey) { setKeyDraft(propKey); return }
    onRename(next)
  }

  function handleValueKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setValueHighlightedIndex((i) => Math.min(i + 1, valueSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setValueHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (valueSuggestions.length > 0 && valueSuggestions[valueHighlightedIndex]) {
        setValueDraft(valueSuggestions[valueHighlightedIndex])
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
          onClick={() => { if (!editingKey) startEditingKey() }}
        >
          <PropertyIcon propKey={propKey} />
          {editingKey ? (
            <input
              ref={keyRef}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              value={keyDraft}
              onChange={(e) => { setKeyDraft(e.target.value); setKeyHighlightedIndex(0) }}
              onBlur={() => { setTimeout(commitKey, 100) }}
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
                    setKeyDraft(keySuggestions[keyHighlightedIndex])
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
            onSelect={(k) => { setKeyDraft(k); keyRef.current?.blur() }}
          />
        )}
      </div>

      <div className="relative min-w-0 flex-1">
        <div
          className="flex cursor-text items-center"
          onClick={() => valueRef.current?.focus()}
        >
          <input
            ref={valueRef}
            value={valueDraft}
            onChange={(e) => { setValueDraft(e.target.value); setShowValueSuggestions(true); setValueHighlightedIndex(0) }}
            onFocus={() => setShowValueSuggestions(true)}
            onBlur={() => { setTimeout(() => { setShowValueSuggestions(false); commitValue() }, 100) }}
            onKeyDown={handleValueKeyDown}
            placeholder="Empty"
            className="min-w-0 flex-1 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        {showValueSuggestions && valueSuggestions.length > 0 && (
          <ValueSuggestDropdown
            suggestions={valueSuggestions}
            highlightedIndex={valueHighlightedIndex}
            onSelect={(v) => { setValueDraft(v); setShowValueSuggestions(false); valueRef.current?.blur() }}
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

function KeySuggestDropdown({
  suggestions,
  highlightedIndex,
  onSelect,
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
          onMouseDown={(e) => { e.preventDefault(); onSelect(s) }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
        >
          <PropertyIcon propKey={s} />
          <span>{s}</span>
        </button>
      ))}
    </div>
  )
}

export function NotePropertiesPanel({
  note,
  notes,
  editorSettings,
  onSetProperty,
}: NotePropertiesPanelProps): JSX.Element | null {
  const [newKey, setNewKey] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const newKeyRef = useRef<HTMLInputElement>(null)

  const specialKeys = new Set(['cover_image', 'title_emoji'])
  const currentKeys = new Set(Object.keys(note.properties ?? {}))

  // Collect all unique property keys from all notes in the workspace
  const allWorkspaceKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const n of notes) {
      for (const k of Object.keys(n.properties ?? {})) {
        if (!specialKeys.has(k)) keys.add(k)
      }
    }
    return Array.from(keys).sort()
  }, [notes])

  // Collect all unique values for each key across all notes in the workspace
  const allValuesForKey = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const n of notes) {
      for (const [k, v] of Object.entries(n.properties ?? {})) {
        if (!specialKeys.has(k) && v) {
          if (!map.has(k)) map.set(k, new Set())
          map.get(k)!.add(v)
        }
      }
    }
    const result: Record<string, string[]> = {}
    for (const [k, set] of map) {
      result[k] = Array.from(set).sort()
    }
    return result
  }, [notes])

  const genericProperties = Object.entries(note.properties ?? {}).filter(
    ([k]) => !specialKeys.has(k)
  )

  const showPanel =
    editorSettings.newNotesStartWithFrontmatter ||
    note.hasFrontmatterBlock ||
    genericProperties.length > 0 ||
    Boolean(note.coverImageSrc) ||
    Boolean(note.titleEmoji)

  if (!showPanel) return null

  // Keys to suggest: workspace keys matching query, excluding already-used keys
  const suggestions = allWorkspaceKeys.filter(
    (k) => !currentKeys.has(k) && k.toLowerCase().includes(newKey.toLowerCase())
  )

  function startAdding() {
    setAddingNew(true)
    setHighlightedIndex(0)
    requestAnimationFrame(() => newKeyRef.current?.focus())
  }

  function commitNewKey(key = newKey) {
    const trimmed = key.trim()
    setNewKey('')
    setAddingNew(false)
    setHighlightedIndex(0)
    if (!trimmed) return
    setFocusKey(trimmed)
  }

  function handleNewKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0 && suggestions[highlightedIndex]) {
        commitNewKey(suggestions[highlightedIndex])
      } else {
        commitNewKey()
      }
    } else if (e.key === 'Escape') {
      setNewKey('')
      setAddingNew(false)
    }
  }

  const pendingEntry: Array<[string, string]> =
    focusKey && !(focusKey in (note.properties ?? {})) ? [[focusKey, '']] : []

  const rows = [...genericProperties, ...pendingEntry]

  return (
    <div className="px-8 pb-4" onMouseDown={(e) => e.stopPropagation()}>
      <p className="mb-1 px-2 text-sm font-semibold text-foreground">Properties</p>

      <div className="flex flex-col">
        {rows.map(([key, value]) => (
          <PropertyRow
            key={key}
            propKey={key}
            savedValue={value}
            autoFocusValue={focusKey === key}
            allWorkspaceKeys={allWorkspaceKeys}
            allValuesForKey={allValuesForKey[key] ?? []}
            onCommitValue={(val: string) => {
              if (focusKey === key) setFocusKey(null)
              onSetProperty(key, val || null)
            }}
            onRename={(newKey: string) => {
              onSetProperty(key, null)
              onSetProperty(newKey, value)
            }}
            onDelete={() => {
              if (focusKey === key) setFocusKey(null)
              onSetProperty(key, null)
            }}
          />
        ))}

        {addingNew && (
          <div className="relative flex items-center gap-0 rounded-sm bg-accent/50 px-2 py-1.5">
            <div className="flex w-52 shrink-0 items-center gap-2">
              <PropertyIcon propKey={newKey} />
              <input
                ref={newKeyRef}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                placeholder="property_name"
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setHighlightedIndex(0) }}
                onBlur={() => { setTimeout(commitNewKey, 100) }}
                onKeyDown={handleNewKeyDown}
              />
            </div>
            <span className="text-sm text-muted-foreground/40">press Enter to confirm</span>
            <KeySuggestDropdown
              suggestions={suggestions}
              highlightedIndex={highlightedIndex}
              onSelect={(k) => commitNewKey(k)}
            />
          </div>
        )}

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={startAdding}
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Add property
        </button>
      </div>
    </div>
  )
}

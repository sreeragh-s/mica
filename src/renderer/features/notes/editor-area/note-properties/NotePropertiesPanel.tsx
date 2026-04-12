import { useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'

import type { NotePropertyValue, SavedNote } from '@/lib/notes/notes-storage'
import {
  displayPropertyValue,
  isMultiValuePropertyKey,
  parsePropertyInput
} from '@/lib/notes/note-properties/property-values'
import type { NotelabEditorSettingsV1 } from '@/lib/config/notelab-config-schema'

import { useWorkspacePropertyCatalog } from '@/hooks/notes/useWorkspacePropertyCatalog'
import { KeySuggestDropdown } from './PropertySuggestDropdowns'
import { buildPropertyKeySuggestions, PropertyIcon } from './PropertyIcon'
import { PropertyRow } from './PropertyRow'

export type NotePropertiesPanelProps = {
  note: SavedNote
  notes: SavedNote[]
  editorSettings: Required<NotelabEditorSettingsV1>
  onSetProperty: (key: string, value: NotePropertyValue | null) => void
  /**
   * Property keys to hide from the UI (but kept internally on the note).
   * Used by JournalView to hide internal properties like `date` and `last_updated_at`.
   */
  hiddenPropertyKeys?: Set<string>
}

export function NotePropertiesPanel({
  note,
  notes,
  editorSettings,
  onSetProperty,
  hiddenPropertyKeys
}: NotePropertiesPanelProps): JSX.Element | null {
  const [newKey, setNewKey] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const newKeyRef = useRef<HTMLInputElement>(null)
  const newKeyDraftRef = useRef(newKey)
  newKeyDraftRef.current = newKey

  const specialKeys = new Set(['cover_image', 'title_emoji'])
  const currentKeys = new Set(Object.keys(note.properties ?? {}))

  const { allWorkspaceKeys, allValuesForKey } = useWorkspacePropertyCatalog(notes)

  const genericProperties = Object.entries(note.properties ?? {}).filter(
    ([k]) => !specialKeys.has(k) && !(hiddenPropertyKeys?.has(k) ?? false)
  )

  const hiddenPropertiesExist = Object.keys(note.properties ?? {}).some(
    (k) => hiddenPropertyKeys?.has(k) ?? false
  )

  const showPanel =
    editorSettings.newNotesStartWithFrontmatter ||
    note.hasFrontmatterBlock ||
    genericProperties.length > 0 ||
    Boolean(note.coverImageSrc) ||
    Boolean(note.titleEmoji) ||
    hiddenPropertiesExist

  if (!showPanel) return null

  const suggestions = buildPropertyKeySuggestions(newKey, allWorkspaceKeys, currentKeys)

  function startAdding(): void {
    setAddingNew(true)
    setHighlightedIndex(0)
    requestAnimationFrame(() => newKeyRef.current?.focus())
  }

  function commitNewKey(key?: string): void {
    const trimmed = (key ?? newKeyDraftRef.current).trim()
    setNewKey('')
    setAddingNew(false)
    setHighlightedIndex(0)
    if (!trimmed) return
    setFocusKey(trimmed)
  }

  function handleNewKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
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

  const pendingEntry: Array<[string, NotePropertyValue]> =
    focusKey && !(focusKey in (note.properties ?? {})) ? [[focusKey, '']] : []

  const rows: Array<[string, NotePropertyValue]> = [...genericProperties, ...pendingEntry]

  return (
    <div className="px-8 pb-4" onMouseDown={(e) => e.stopPropagation()}>
      <p className="mb-1 px-2 text-sm font-semibold text-foreground">Properties</p>

      <div className="flex flex-col">
        {rows.map(([key, value]) => (
          <PropertyRow
            key={key}
            propKey={key}
            savedValue={displayPropertyValue(value)}
            autoFocusValue={focusKey === key}
            allWorkspaceKeys={allWorkspaceKeys}
            allValuesForKey={allValuesForKey[key] ?? []}
            valuePlaceholder={isMultiValuePropertyKey(key) ? 'Comma-separated values' : 'Empty'}
            onCommitValue={(val: string) => {
              if (focusKey === key) setFocusKey(null)
              onSetProperty(key, parsePropertyInput(key, val))
            }}
            onRename={(newKeyName: string) => {
              const prev = note.properties?.[key]
              onSetProperty(key, null)
              if (prev != null) onSetProperty(newKeyName, prev)
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
                onChange={(e) => {
                  const v = e.target.value
                  newKeyDraftRef.current = v
                  setNewKey(v)
                  setHighlightedIndex(0)
                }}
                onBlur={() => {
                  setTimeout(() => commitNewKey(), 100)
                }}
                onKeyDown={handleNewKeyDown}
              />
            </div>
            <span className="text-sm text-muted-foreground/40">press Enter to confirm</span>
            <KeySuggestDropdown
              suggestions={suggestions}
              highlightedIndex={highlightedIndex}
              onSelect={(k) => {
                newKeyDraftRef.current = k
                commitNewKey(k)
              }}
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

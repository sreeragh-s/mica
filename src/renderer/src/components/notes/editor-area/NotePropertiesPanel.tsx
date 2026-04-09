import { useMemo, useState, type JSX } from 'react'

import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SavedNote } from '@/lib/notes/notes-storage'
import type { NotelabEditorSettingsV1 } from '@/lib/config/notelab-config-schema'

type NotePropertiesPanelProps = {
  note: SavedNote
  editorSettings: Required<NotelabEditorSettingsV1>
  onSetProperty: (key: string, value: string | null) => void
}

export function NotePropertiesPanel({
  note,
  editorSettings,
  onSetProperty,
}: NotePropertiesPanelProps): JSX.Element | null {
  const [draftKey, setDraftKey] = useState('')
  const genericProperties = useMemo(
    () =>
      Object.entries(note.properties ?? {}).filter(
        ([key]) => key !== 'cover_image' && key !== 'title_emoji'
      ),
    [note.properties]
  )

  if (
    !note.hasFrontmatterBlock &&
    genericProperties.length === 0 &&
    !note.coverImageSrc &&
    !note.titleEmoji
  ) {
    return null
  }

  const canAddCover =
    (note.hasFrontmatterBlock || editorSettings.enableCoverProperty) && !note.coverImageSrc
  const canAddEmoji =
    (note.hasFrontmatterBlock || editorSettings.enableEmojiProperty) && !note.titleEmoji

  return (
    <div className="px-8 pb-4">
      <div className="rounded-xl border border-dashed p-4">
        <h3 className="text-foreground text-sm font-semibold">Properties</h3>
        <div className="mt-3 flex flex-col gap-2">
          {note.coverImageSrc ? (
            <PropertyRow label="cover_image" value={note.coverImageSrc} onChange={(value) => onSetProperty('cover_image', value)} />
          ) : null}
          {note.titleEmoji ? (
            <PropertyRow label="title_emoji" value={note.titleEmoji} onChange={(value) => onSetProperty('title_emoji', value)} />
          ) : null}
          {genericProperties.map(([key, value]) => (
            <PropertyRow key={key} label={key} value={value} onChange={(next) => onSetProperty(key, next)} />
          ))}
          {(canAddCover || canAddEmoji) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {canAddCover ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onSetProperty('cover_image', '')}>
                  Add cover property
                </Button>
              ) : null}
              {canAddEmoji ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onSetProperty('title_emoji', '')}>
                  Add emoji property
                </Button>
              ) : null}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="property_name"
              className="h-8 max-w-[220px]"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const nextKey = draftKey.trim()
                if (!nextKey) return
                onSetProperty(nextKey, '')
                setDraftKey('')
              }}
            >
              <Plus className="mr-1 size-4" aria-hidden />
              Add property
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PropertyRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string | null) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] items-center gap-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          if (!e.target.value.trim()) onChange(null)
        }}
        placeholder="Empty"
        className="h-8"
      />
    </div>
  )
}

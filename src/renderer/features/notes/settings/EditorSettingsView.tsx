import { type JSX } from 'react'

import { Button } from '@/components/ui/button'
import type { MacTitlebarStyles } from '@/features/notes/notes-app-types'
import type { NotelabEditorSettingsV1 } from '@/lib/config/notelab-config-schema'

type ToggleRowProps = {
  label: string
  description: string
  value: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({ label, description, value, onChange }: ToggleRowProps): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>
      </div>
      <Button
        type="button"
        variant={value ? 'default' : 'outline'}
        size="sm"
        onClick={() => onChange(!value)}
      >
        {value ? 'On' : 'Off'}
      </Button>
    </div>
  )
}

export type EditorSettingsViewProps = {
  isMacNotelab: boolean
  macTitlebarStyles: MacTitlebarStyles
  settings: Required<NotelabEditorSettingsV1>
  onChange: (patch: Partial<NotelabEditorSettingsV1>) => void
}

export function EditorSettingsView({
  isMacNotelab,
  macTitlebarStyles,
  settings,
  onChange,
}: EditorSettingsViewProps): JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">Editor</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Control which properties are available for newly created markdown notes.
          Existing files still render from whatever frontmatter is already on disk.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <ToggleRow
          label="New notes start with frontmatter"
          description="Shows the properties panel for new markdown notes. The frontmatter block is only written to the file if a property is added."
          value={settings.newNotesStartWithFrontmatter}
          onChange={(next) => onChange({ newNotesStartWithFrontmatter: next })}
        />
        <ToggleRow
          label="Emoji property"
          description="Lets newly created notes expose the title emoji property affordance."
          value={settings.enableEmojiProperty}
          onChange={(next) => onChange({ enableEmojiProperty: next })}
        />
        <ToggleRow
          label="Cover property"
          description="Lets newly created notes expose the cover image property affordance."
          value={settings.enableCoverProperty}
          onChange={(next) => onChange({ enableCoverProperty: next })}
        />
        <ToggleRow
          label="Confirm before deleting notes"
          description="Shows a delete confirmation dialog before removing a note. If turned off, note deletes happen immediately."
          value={settings.confirmNoteDeletion}
          onChange={(next) => onChange({ confirmNoteDeletion: next })}
        />
      </div>
    </div>
  )
}

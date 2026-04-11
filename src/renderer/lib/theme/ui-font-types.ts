export type UiFontId =
  | 'system'
  | 'inter'
  | 'humanist'
  | 'neo'
  | 'serif'
  | 'literary'
  | 'source-serif'
  | 'slab'
  | 'mono'
  | 'jetbrains'

export const UI_FONT_OPTIONS: readonly {
  id: UiFontId
  label: string
  sample: string
}[] = [
  {
    id: 'system',
    label: 'System UI',
    sample: 'Your platform’s default interface font.'
  },
  {
    id: 'inter',
    label: 'Inter',
    sample: 'A neutral sans designed for screens (bundled).'
  },
  {
    id: 'humanist',
    label: 'Humanist sans',
    sample: 'Segoe UI / Roboto–style stack, common on Windows & Android.'
  },
  {
    id: 'neo',
    label: 'Neo-grotesque',
    sample: 'Helvetica / Arial stack—classic Swiss-inspired UI.'
  },
  {
    id: 'serif',
    label: 'Serif',
    sample: 'Comfortable serif using built-in UI serif fonts.'
  },
  {
    id: 'literary',
    label: 'Literary',
    sample: 'Charter-first stack for long-form reading.'
  },
  {
    id: 'source-serif',
    label: 'Source Serif 4',
    sample: 'Adobe’s open serif family for body text (bundled variable font).'
  },
  {
    id: 'slab',
    label: 'Slab',
    sample: 'Rockwell-style slab serif where available.'
  },
  {
    id: 'mono',
    label: 'Monospace',
    sample: 'Fixed-width using common system monospace fonts.'
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    sample: 'Developer-oriented monospace (bundled).'
  }
] as const

export const UI_FONT_IDS: ReadonlySet<string> = new Set(UI_FONT_OPTIONS.map((o) => o.id))

export type ShortcutActionId =
  | "toggleSidebar"
  | "newNote"
  | "toggleZenMode"

export type ShortcutBinding = {
  /** Cmd on macOS, Ctrl on Windows/Linux (same as existing app shortcuts). */
  mod: boolean
  /** Single character from KeyboardEvent.key (normalized lowercase for letters). */
  key?: string
  /** Prefer KeyboardEvent.code for punctuation (layout-independent). */
  code?: string
}

export const SHORTCUT_DEFINITIONS: readonly {
  id: ShortcutActionId
  label: string
  description: string
  defaultBinding: ShortcutBinding
}[] = [
  {
    id: "toggleSidebar",
    label: "Toggle sidebar",
    description: "Show or hide the notes sidebar.",
    defaultBinding: { mod: true, key: "b" },
  },
  {
    id: "newNote",
    label: "New note",
    description: "Create a note in the focused workspace.",
    defaultBinding: { mod: true, key: "n" },
  },
  {
    id: "toggleZenMode",
    label: "Toggle zen mode",
    description:
      "Full-screen writing: only the editor is shown. Double-press Escape to exit.",
    defaultBinding: { mod: true, key: "j" },
  },
] as const

export type ShortcutBindingsMap = Record<ShortcutActionId, ShortcutBinding>

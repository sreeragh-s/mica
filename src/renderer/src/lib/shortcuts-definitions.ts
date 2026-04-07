export type ShortcutActionId =
  | "toggleSidebar"
  | "newNote"
  | "newFolder"
  | "toggleZenMode"
  | "nextTab"
  | "prevTab"
  | "closeTab"
  | "renameSelected"
  | "toggleChat"
  | "openShortcuts"

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
    id: "newFolder",
    label: "New folder",
    description: "Create a new workspace folder.",
    defaultBinding: { mod: true, key: "k" },
  },
  {
    id: "toggleZenMode",
    label: "Toggle zen mode",
    description:
      "Full-screen writing: only the editor is shown. Double-press Escape to exit.",
    defaultBinding: { mod: true, key: "j" },
  },
  {
    id: "nextTab",
    label: "Next tab",
    description: "Switch to the next open tab.",
    defaultBinding: { mod: true, code: "BracketRight" },
  },
  {
    id: "prevTab",
    label: "Previous tab",
    description: "Switch to the previous open tab.",
    defaultBinding: { mod: true, code: "BracketLeft" },
  },
  {
    id: "closeTab",
    label: "Close tab",
    description: "Close the currently active tab.",
    defaultBinding: { mod: true, key: "w" },
  },
  {
    id: "renameSelected",
    label: "Rename",
    description: "Rename the selected note or folder.",
    defaultBinding: { mod: false, code: "F2" },
  },
  {
    id: "toggleChat",
    label: "Toggle chat",
    description: "Open or close the AI chat sidebar.",
    defaultBinding: { mod: true, key: "l" },
  },
  {
    id: "openShortcuts",
    label: "Open keyboard shortcuts",
    description: "Jump directly to the keyboard shortcuts settings.",
    defaultBinding: { mod: true, code: "Slash" },
  },
] as const

export type ShortcutBindingsMap = Record<ShortcutActionId, ShortcutBinding>

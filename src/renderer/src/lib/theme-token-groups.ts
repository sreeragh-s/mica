export type ThemeTokenGroup = {
  id: string
  label: string
  keys: readonly string[]
}

/** Collapsible color sections (tweakcn-style grouping). */
export const THEME_COLOR_GROUPS: ThemeTokenGroup[] = [
  {
    id: "base",
    label: "Base",
    keys: ["background", "foreground"],
  },
  {
    id: "primary",
    label: "Primary",
    keys: ["primary", "primary-foreground"],
  },
  {
    id: "secondary",
    label: "Secondary",
    keys: ["secondary", "secondary-foreground"],
  },
  {
    id: "accent",
    label: "Accent",
    keys: ["accent", "accent-foreground"],
  },
  {
    id: "muted",
    label: "Muted",
    keys: ["muted", "muted-foreground"],
  },
  {
    id: "card",
    label: "Card",
    keys: ["card", "card-foreground"],
  },
  {
    id: "popover",
    label: "Popover",
    keys: ["popover", "popover-foreground"],
  },
  {
    id: "destructive",
    label: "Destructive",
    keys: ["destructive", "destructive-foreground"],
  },
  {
    id: "border-input",
    label: "Border & input",
    keys: ["border", "input", "ring"],
  },
  {
    id: "sidebar",
    label: "Sidebar",
    keys: [
      "sidebar",
      "sidebar-foreground",
      "sidebar-primary",
      "sidebar-primary-foreground",
      "sidebar-accent",
      "sidebar-accent-foreground",
      "sidebar-border",
      "sidebar-ring",
    ],
  },
]

/** Non-color tokens (radius, shadows, spacing). */
export const THEME_OTHER_KEYS: readonly string[] = [
  "radius",
  "shadow-color",
  "shadow-opacity",
  "shadow-blur",
  "shadow-spread",
  "shadow-offset-x",
  "shadow-offset-y",
  "letter-spacing",
  "spacing",
]

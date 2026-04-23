import type * as React from "react"

export type ShortcutAction =
  | "toggleLeftSidebar"
  | "toggleRightSidebar"
  | "closeCurrentTab"
  | "toggleZenMode"

export type ShortcutConfig = Record<ShortcutAction, string>

type ShortcutDefinition = {
  action: ShortcutAction
  defaultBinding: string
  description: string
  label: string
}

const SHORTCUT_STORAGE_KEY = "app-shortcuts-v1"

const MODIFIER_ORDER = ["mod", "shift", "alt"] as const

const DISPLAY_TOKEN_MAP: Record<string, { mac: string; other: string }> = {
  alt: { mac: "Option", other: "Alt" },
  backspace: { mac: "Backspace", other: "Backspace" },
  delete: { mac: "Delete", other: "Delete" },
  down: { mac: "Down", other: "Down" },
  end: { mac: "End", other: "End" },
  enter: { mac: "Enter", other: "Enter" },
  escape: { mac: "Esc", other: "Esc" },
  home: { mac: "Home", other: "Home" },
  left: { mac: "Left", other: "Left" },
  mod: { mac: "Cmd", other: "Ctrl" },
  pagedown: { mac: "Page Down", other: "Page Down" },
  pageup: { mac: "Page Up", other: "Page Up" },
  right: { mac: "Right", other: "Right" },
  shift: { mac: "Shift", other: "Shift" },
  space: { mac: "Space", other: "Space" },
  tab: { mac: "Tab", other: "Tab" },
  up: { mac: "Up", other: "Up" },
}

export const shortcutDefinitions: ShortcutDefinition[] = [
  {
    action: "toggleLeftSidebar",
    defaultBinding: "mod+b",
    description: "Show or hide the left sidebar and file tree.",
    label: "Toggle Sidebar",
  },
  {
    action: "toggleRightSidebar",
    defaultBinding: "mod+l",
    description: "Open or close the chat sidebar.",
    label: "Toggle Chat Sidebar",
  },
  {
    action: "closeCurrentTab",
    defaultBinding: "mod+w",
    description: "Close the current tab. If no tabs are open, quit the app window.",
    label: "Close Current Tab",
  },
  {
    action: "toggleZenMode",
    defaultBinding: "mod+j",
    description: "Show only the editor surface and hide app chrome.",
    label: "Toggle Zen Mode",
  },
]

const shortcutDefinitionMap = Object.fromEntries(
  shortcutDefinitions.map((definition) => [definition.action, definition])
) as Record<ShortcutAction, ShortcutDefinition>

export const defaultShortcutConfig = shortcutDefinitions.reduce<ShortcutConfig>(
  (config, definition) => {
    config[definition.action] = definition.defaultBinding
    return config
  },
  {} as ShortcutConfig
)

function isMacPlatform() {
  if (typeof navigator === "undefined") {
    return false
  }

  return /mac|iphone|ipad|ipod/i.test(navigator.platform)
}

function normalizeToken(token: string) {
  const value = token.trim().toLowerCase()

  switch (value) {
    case "cmd":
    case "command":
    case "control":
    case "ctrl":
    case "meta":
      return "mod"
    case "option":
      return "alt"
    case "esc":
      return "escape"
    case "arrowdown":
      return "down"
    case "arrowleft":
      return "left"
    case "arrowright":
      return "right"
    case "arrowup":
      return "up"
    case " ":
      return "space"
    default:
      return value
  }
}

function normalizeKeyToken(key: string) {
  if (key === " ") {
    return "space"
  }

  return normalizeToken(key)
}

export function normalizeShortcutBinding(binding: string) {
  const rawTokens = binding
    .split("+")
    .map((token) => normalizeToken(token))
    .filter(Boolean)

  if (rawTokens.length === 0) {
    return ""
  }

  const modifiers = MODIFIER_ORDER.filter((modifier) => rawTokens.includes(modifier))
  const nonModifierTokens = rawTokens.filter((token) => !MODIFIER_ORDER.includes(token as (typeof MODIFIER_ORDER)[number]))
  const key = nonModifierTokens.at(-1)

  if (!key) {
    return modifiers.join("+")
  }

  return [...modifiers, key].join("+")
}

export function getShortcutDisplayLabel(binding: string) {
  if (!binding) {
    return "Not set"
  }

  const mac = isMacPlatform()

  return normalizeShortcutBinding(binding)
    .split("+")
    .filter(Boolean)
    .map((token) => {
      const mapped = DISPLAY_TOKEN_MAP[token]
      if (mapped) {
        return mac ? mapped.mac : mapped.other
      }

      return token.length === 1 ? token.toUpperCase() : token[0]?.toUpperCase() + token.slice(1)
    })
    .join("+")
}

export function matchShortcutEvent(event: KeyboardEvent, binding: string) {
  const normalizedBinding = normalizeShortcutBinding(binding)
  if (!normalizedBinding) {
    return false
  }

  const tokens = normalizedBinding.split("+")
  const requiresMod = tokens.includes("mod")
  const requiresShift = tokens.includes("shift")
  const requiresAlt = tokens.includes("alt")
  const key = tokens.find((token) => !MODIFIER_ORDER.includes(token as (typeof MODIFIER_ORDER)[number]))

  if (!key) {
    return false
  }

  const hasMod = event.metaKey || event.ctrlKey
  if (hasMod !== requiresMod) {
    return false
  }
  if (event.shiftKey !== requiresShift) {
    return false
  }
  if (event.altKey !== requiresAlt) {
    return false
  }

  return normalizeKeyToken(event.key) === key
}

export function getShortcutBindingLabel(action: ShortcutAction, config: ShortcutConfig) {
  return getShortcutDisplayLabel(config[action])
}

export function getShortcutDefinition(action: ShortcutAction) {
  return shortcutDefinitionMap[action]
}

export function loadShortcutConfig() {
  if (typeof window === "undefined") {
    return defaultShortcutConfig
  }

  const raw = window.localStorage.getItem(SHORTCUT_STORAGE_KEY)
  if (!raw) {
    return defaultShortcutConfig
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutAction, string>>
    const nextConfig = { ...defaultShortcutConfig }

    for (const definition of shortcutDefinitions) {
      const storedValue = parsed[definition.action]
      if (typeof storedValue === "string") {
        nextConfig[definition.action] = normalizeShortcutBinding(storedValue) || definition.defaultBinding
      }
    }

    return nextConfig
  } catch {
    return defaultShortcutConfig
  }
}

export function persistShortcutConfig(config: ShortcutConfig) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(config))
}

export function keyboardEventToShortcutBinding(event: React.KeyboardEvent<HTMLInputElement>) {
  const key = normalizeKeyToken(event.key)
  if (["alt", "control", "meta", "shift"].includes(key)) {
    return null
  }

  const tokens: string[] = []
  if (event.metaKey || event.ctrlKey) {
    tokens.push("mod")
  }
  if (event.shiftKey) {
    tokens.push("shift")
  }
  if (event.altKey) {
    tokens.push("alt")
  }

  tokens.push(key)
  return normalizeShortcutBinding(tokens.join("+"))
}

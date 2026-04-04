import {
  loadShortcutBindings as loadFromConfig,
  saveShortcutBindings as saveToConfig,
} from "./gitnotes-app-config"
import {
  SHORTCUT_DEFINITIONS,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutBindingsMap,
} from "./shortcuts-definitions"

export type {
  ShortcutActionId,
  ShortcutBinding,
  ShortcutBindingsMap,
} from "./shortcuts-definitions"
export { SHORTCUT_DEFINITIONS } from "./shortcuts-definitions"

export function loadShortcutBindings(): ShortcutBindingsMap {
  return loadFromConfig()
}

export function saveShortcutBindings(map: ShortcutBindingsMap): void {
  saveToConfig(map)
}

export function resetShortcutBindings(): ShortcutBindingsMap {
  const m = {} as ShortcutBindingsMap
  for (const d of SHORTCUT_DEFINITIONS) {
    m[d.id] = { ...d.defaultBinding }
  }
  saveToConfig(m)
  return m
}

/** True if the event matches this binding (repeat events ignored by caller). */
export function keyboardEventMatchesBinding(e: KeyboardEvent, b: ShortcutBinding): boolean {
  if (b.mod && !(e.metaKey || e.ctrlKey)) return false
  if (!b.mod && (e.metaKey || e.ctrlKey)) return false
  if (e.altKey) return false
  if (b.key) {
    const want = b.key.length === 1 ? b.key.toLowerCase() : b.key
    const got = e.key.length === 1 ? e.key.toLowerCase() : e.key
    return got === want
  }
  if (b.code) return e.code === b.code
  return false
}

function bindingKeyForLookup(b: ShortcutBinding): string {
  return `${b.mod ? 1 : 0}|k:${b.key ?? ""}|c:${b.code ?? ""}`
}

/** Returns duplicate action ids that share the same binding, if any. */
export function findDuplicateShortcutBindings(map: ShortcutBindingsMap): ShortcutActionId[][] {
  const byKey = new Map<string, ShortcutActionId[]>()
  for (const d of SHORTCUT_DEFINITIONS) {
    const k = bindingKeyForLookup(map[d.id])
    const list = byKey.get(k) ?? []
    list.push(d.id)
    byKey.set(k, list)
  }
  return [...byKey.values()].filter((g) => g.length > 1)
}

export function formatBindingLabel(b: ShortcutBinding, mac: boolean): string {
  const mod = b.mod ? (mac ? "⌘" : "Ctrl+") : ""
  if (b.code === "Backslash") {
    return `${mod}\\`
  }
  if (b.key) {
    const ch = b.key.length === 1 ? b.key.toUpperCase() : b.key
    return `${mod}${ch}`
  }
  if (b.code) {
    return `${mod}${b.code}`
  }
  return mod || "—"
}

/** Capture next keydown into a binding (mod required). */
export function bindingFromKeyboardEvent(e: KeyboardEvent): ShortcutBinding | null {
  if (!(e.metaKey || e.ctrlKey)) return null
  e.preventDefault()
  e.stopPropagation()
  const mod = true
  if (e.code === "Backslash" || e.key === "\\") {
    return { mod, code: "Backslash" }
  }
  if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
    return { mod, key: e.key.toLowerCase() }
  }
  return { mod, code: e.code }
}

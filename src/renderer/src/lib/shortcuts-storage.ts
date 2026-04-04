const STORAGE_KEY = 'gitnotes-shortcuts-v1'

export type ShortcutActionId = 'toggleSidebar' | 'newNote' | 'toggleSplitView'

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
    id: 'toggleSidebar',
    label: 'Toggle sidebar',
    description: 'Show or hide the notes sidebar.',
    defaultBinding: { mod: true, key: 'b' }
  },
  {
    id: 'newNote',
    label: 'New note',
    description: 'Create a note in the focused workspace.',
    defaultBinding: { mod: true, key: 'n' }
  },
  {
    id: 'toggleSplitView',
    label: 'Toggle split view',
    description:
      'Open or close the second editor pane. Drag a note into the pane or pick one after opening.',
    defaultBinding: { mod: true, code: 'Backslash' }
  }
] as const

export type ShortcutBindingsMap = Record<ShortcutActionId, ShortcutBinding>

function defaultBindingsMap(): ShortcutBindingsMap {
  const m = {} as ShortcutBindingsMap
  for (const d of SHORTCUT_DEFINITIONS) {
    m[d.id] = { ...d.defaultBinding }
  }
  return m
}

export function loadShortcutBindings(): ShortcutBindingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultBindingsMap()
    const parsed = JSON.parse(raw) as Partial<ShortcutBindingsMap>
    const base = defaultBindingsMap()
    for (const d of SHORTCUT_DEFINITIONS) {
      const b = parsed[d.id]
      if (b && typeof b === 'object' && typeof b.mod === 'boolean') {
        base[d.id] = {
          mod: b.mod,
          ...(typeof b.key === 'string' ? { key: b.key } : {}),
          ...(typeof b.code === 'string' ? { code: b.code } : {})
        }
      }
    }
    return base
  } catch {
    return defaultBindingsMap()
  }
}

export function saveShortcutBindings(map: ShortcutBindingsMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function resetShortcutBindings(): ShortcutBindingsMap {
  const m = defaultBindingsMap()
  saveShortcutBindings(m)
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
  return `${b.mod ? 1 : 0}|k:${b.key ?? ''}|c:${b.code ?? ''}`
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
  const mod = b.mod ? (mac ? '⌘' : 'Ctrl+') : ''
  if (b.code === 'Backslash') {
    return `${mod}\\`
  }
  if (b.key) {
    const ch = b.key.length === 1 ? b.key.toUpperCase() : b.key
    return `${mod}${ch}`
  }
  if (b.code) {
    return `${mod}${b.code}`
  }
  return mod || '—'
}

/** Capture next keydown into a binding (mod required). */
export function bindingFromKeyboardEvent(e: KeyboardEvent): ShortcutBinding | null {
  if (!(e.metaKey || e.ctrlKey)) return null
  e.preventDefault()
  e.stopPropagation()
  const mod = true
  if (e.code === 'Backslash' || e.key === '\\') {
    return { mod, code: 'Backslash' }
  }
  if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
    return { mod, key: e.key.toLowerCase() }
  }
  return { mod, code: e.code }
}

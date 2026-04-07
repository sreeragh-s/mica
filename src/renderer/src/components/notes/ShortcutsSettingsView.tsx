import { useCallback, useEffect, useState, type JSX } from 'react'

import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  SHORTCUT_DEFINITIONS,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutBindingsMap,
  bindingFromKeyboardEvent,
  findDuplicateShortcutBindings,
  formatBindingLabel
} from '@/lib/shortcuts-storage'
import type { MacTitlebarStyles } from './notes-app-types'

export type ShortcutsSettingsViewProps = {
  macElectron: boolean
  macTitlebarStyles: MacTitlebarStyles
  bindings: ShortcutBindingsMap
  onChangeBinding: (id: ShortcutActionId, binding: ShortcutBinding) => void
  onResetAll: () => void
  onCaptureModeChange: (active: boolean) => void
}

export function ShortcutsSettingsView({
  macElectron,
  macTitlebarStyles,
  bindings,
  onChangeBinding,
  onResetAll,
  onCaptureModeChange
}: ShortcutsSettingsViewProps): JSX.Element {
  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null)

  useEffect(() => {
    onCaptureModeChange(recordingId !== null)
    return () => onCaptureModeChange(false)
  }, [recordingId, onCaptureModeChange])

  const onKeyDownCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!recordingId) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setRecordingId(null)
        return
      }
      const b = bindingFromKeyboardEvent(e)
      if (b) {
        onChangeBinding(recordingId, b)
        setRecordingId(null)
      }
    },
    [recordingId, onChangeBinding]
  )

  useEffect(() => {
    if (!recordingId) return
    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => window.removeEventListener('keydown', onKeyDownCapture, true)
  }, [recordingId, onKeyDownCapture])

  const duplicates = findDuplicateShortcutBindings(bindings)

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      style={macElectron ? macTitlebarStyles.noDrag : undefined}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">
          Keyboard shortcuts
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Shortcuts use {macElectron ? '⌘' : 'Ctrl'} as the main modifier. Click “Change” and press
          a new combination. Escape cancels recording.
        </p>
      </div>

      {duplicates.length > 0 ? (
        <p className="text-destructive text-sm" role="alert">
          Some shortcuts use the same keys. Change one of them so each action is unique.
        </p>
      ) : null}

      {recordingId ? (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
          Press a shortcut (with {macElectron ? '⌘' : 'Ctrl'})… or Escape to cancel.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {SHORTCUT_DEFINITIONS.map((def) => {
          const current = bindings[def.id]
          const isDup = duplicates.some((g) => g.includes(def.id))
          return (
            <li
              key={def.id}
              className="border-border flex flex-col gap-1 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="text-foreground text-sm font-medium">{def.label}</div>
                <div className="text-muted-foreground text-xs">{def.description}</div>
                <div className="text-muted-foreground mt-1 font-mono text-xs">
                  Default: {formatBindingLabel(def.defaultBinding, macElectron)}
                </div>
              </div>
              <div className="mt-2 flex shrink-0 items-center gap-2 sm:mt-0">
                <span
                  className={
                    isDup
                      ? 'text-destructive bg-destructive/10 rounded px-2 py-1 font-mono text-xs'
                      : 'bg-muted rounded px-2 py-1 font-mono text-xs'
                  }
                >
                  {formatBindingLabel(current, macElectron)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={recordingId === def.id ? 'default' : 'secondary'}
                  onClick={() => {
                    if (recordingId === def.id) {
                      setRecordingId(null)
                    } else {
                      setRecordingId(def.id)
                    }
                  }}
                >
                  {recordingId === def.id ? 'Cancel' : 'Change'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onResetAll}>
          <RotateCcw className="size-3.5" aria-hidden />
          Reset to defaults
        </Button>
      </div>

      <div className="border-border rounded-lg border p-4">
        <h3 className="text-foreground mb-2 text-sm font-medium">Reference</h3>
        <ul className="text-muted-foreground space-y-1.5 text-xs">
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.toggleSidebar, macElectron)}
            </span>{' '}
            — Toggle sidebar
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.newNote, macElectron)}
            </span>{' '}
            — New note
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.newFolder, macElectron)}
            </span>{' '}
            — New folder
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.toggleZenMode, macElectron)}
            </span>{' '}
            — Toggle zen mode (full-screen editor; double-press Esc to exit)
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.nextTab, macElectron)}
            </span>{' '}
            /{' '}
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.prevTab, macElectron)}
            </span>{' '}
            — Next / previous tab
          </li>
          <li>
            <span className="text-foreground font-mono">
              {macElectron ? '⌘' : 'Ctrl+'}1–8
            </span>{' '}
            — Switch to tab by position (1 = first, 8 = eighth)
          </li>
          <li>
            <span className="text-foreground font-mono">
              {macElectron ? '⌘' : 'Ctrl+'}9
            </span>{' '}
            — Switch to last tab
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.closeTab, macElectron)}
            </span>{' '}
            — Close current tab
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.renameSelected, macElectron)}
            </span>{' '}
            — Rename selected note or folder
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.toggleChat, macElectron)}
            </span>{' '}
            — Open / close AI chat
          </li>
          <li>
            <span className="text-foreground font-mono">
              {formatBindingLabel(bindings.openShortcuts, macElectron)}
            </span>{' '}
            — Open keyboard shortcuts
          </li>
          <li className="pt-1">
            Drag a note from the sidebar into the main area to open it as a tab.
          </li>
        </ul>
      </div>
    </div>
  )
}

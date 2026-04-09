import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'

import { getApi, getWindowApi } from '@/lib/auth/auth-bridge'
import type { AppSidebarView } from '@/lib/notes/notes-types'
import {
  resetShortcutBindings,
  saveShortcutBindings,
  keyboardEventMatchesBinding,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutBindingsMap
} from '@/lib/config/shortcuts-storage'
import { enableInfinityCanvas } from '@/lib/core/vite-flags'
import type { SavedNote } from '@/lib/notes/notes-storage'

import type { AppMode, SettingsSection } from '@/components/notes/notes-app-types'

type Setter<T> = Dispatch<SetStateAction<T>>

type UseNotesAppUiArgs = {
  isMacNotelab: boolean
  appMode: AppMode
  setAppMode: Setter<AppMode>
  workspaceSettingsFolderId: string | null
  setWorkspaceSettingsFolderId: Setter<string | null>
  selectedNote: SavedNote | null
  sidebarCollapsed: boolean
  setSidebarCollapsed: Setter<boolean>
  graphViewOpen: boolean
  setGraphViewOpen: Setter<boolean>
  canvasViewOpen: boolean
  setCanvasViewOpen: Setter<boolean>
  setTabOverviewOpen: Setter<boolean>
  zenMode: boolean
  setZenMode: Setter<boolean>
  shortcutBindings: ShortcutBindingsMap
  setShortcutBindings: Setter<ShortcutBindingsMap>
  chatSidebarOpen: boolean
  setChatSidebarOpen: Setter<boolean>
  workspaceRoot: string | null
  selectedNotePath: string | null
  openNoteTabPaths: string[]
  setSelectedId: Setter<string | null>
  setOpenNoteTabIds: Setter<string[]>
  setAppSidebarView: Setter<AppSidebarView>
  setSettingsSection: Setter<SettingsSection>
  handleNewNote: () => void
  openNoteTabIdsRef: MutableRefObject<string[]>
  shortcutBindingsRef: MutableRefObject<ShortcutBindingsMap>
  shortcutsSuppressedRef: MutableRefObject<boolean>
  triggerRenameSelectedRef: MutableRefObject<(() => void) | null>
  startFolderCreateRef: MutableRefObject<(() => void) | null>
  zenModeRef: MutableRefObject<boolean>
  sidebarCollapsedBeforeZenRef: MutableRefObject<boolean | null>
  lastZenEscPressRef: MutableRefObject<number>
}

export function useNotesAppUi({
  isMacNotelab,
  appMode,
  setAppMode,
  workspaceSettingsFolderId,
  setWorkspaceSettingsFolderId,
  selectedNote,
  sidebarCollapsed,
  setSidebarCollapsed,
  graphViewOpen,
  setGraphViewOpen,
  canvasViewOpen,
  setCanvasViewOpen,
  setTabOverviewOpen,
  zenMode,
  setZenMode,
  shortcutBindings,
  setShortcutBindings,
  chatSidebarOpen,
  setChatSidebarOpen,
  workspaceRoot,
  selectedNotePath,
  openNoteTabPaths,
  setSelectedId,
  setOpenNoteTabIds,
  setAppSidebarView,
  setSettingsSection,
  handleNewNote,
  openNoteTabIdsRef,
  shortcutBindingsRef,
  shortcutsSuppressedRef,
  triggerRenameSelectedRef,
  startFolderCreateRef,
  zenModeRef,
  sidebarCollapsedBeforeZenRef,
  lastZenEscPressRef
}: UseNotesAppUiArgs) {
  const [nativeLiquidGlassAttached, setNativeLiquidGlassAttached] = useState(false)

  const backToNotes = useCallback(() => {
    setAppMode('notes')
    setAppSidebarView('explorer')
  }, [setAppMode, setAppSidebarView])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => !c)
  }, [setSidebarCollapsed])

  const toggleChatSidebar = useCallback(() => {
    setChatSidebarOpen((o) => !o)
  }, [setChatSidebarOpen])

  const exitZenMode = useCallback(() => {
    lastZenEscPressRef.current = 0
    setZenMode(false)
    const prev = sidebarCollapsedBeforeZenRef.current
    sidebarCollapsedBeforeZenRef.current = null
    if (prev !== null) {
      setSidebarCollapsed(prev)
    }
  }, [lastZenEscPressRef, setSidebarCollapsed, setZenMode, sidebarCollapsedBeforeZenRef])

  const enterZenMode = useCallback(() => {
    if (appMode !== 'notes' || workspaceSettingsFolderId) return
    if (!selectedNote || selectedNote.kind === 'drawing') return
    if (zenModeRef.current) return
    lastZenEscPressRef.current = 0
    sidebarCollapsedBeforeZenRef.current = sidebarCollapsed
    setSidebarCollapsed(true)
    if (graphViewOpen) {
      setGraphViewOpen(false)
    }
    if (canvasViewOpen) {
      setCanvasViewOpen(false)
    }
    setZenMode(true)
  }, [
    appMode,
    canvasViewOpen,
    graphViewOpen,
    lastZenEscPressRef,
    selectedNote,
    setCanvasViewOpen,
    setGraphViewOpen,
    setSidebarCollapsed,
    setZenMode,
    sidebarCollapsed,
    sidebarCollapsedBeforeZenRef,
    workspaceSettingsFolderId,
    zenModeRef
  ])

  const toggleZenMode = useCallback(() => {
    if (zenModeRef.current) {
      exitZenMode()
    } else {
      enterZenMode()
    }
  }, [enterZenMode, exitZenMode, zenModeRef])

  const closeGraphView = useCallback(() => {
    setGraphViewOpen(false)
  }, [setGraphViewOpen])

  const openGraphView = useCallback(() => {
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setAppSidebarView('explorer')
    setTabOverviewOpen(false)
    setCanvasViewOpen(false)
    setGraphViewOpen(true)
  }, [
    setAppMode,
    setAppSidebarView,
    setCanvasViewOpen,
    setGraphViewOpen,
    setTabOverviewOpen,
    setWorkspaceSettingsFolderId
  ])

  const openTabOverview = useCallback(() => {
    setGraphViewOpen(false)
    setCanvasViewOpen(false)
    setTabOverviewOpen(true)
  }, [setCanvasViewOpen, setGraphViewOpen, setTabOverviewOpen])

  useEffect(() => {
    if (!enableInfinityCanvas && canvasViewOpen) {
      setCanvasViewOpen(false)
    }
  }, [canvasViewOpen, setCanvasViewOpen])

  const openCanvasView = useCallback(() => {
    if (!enableInfinityCanvas) return
    setWorkspaceSettingsFolderId(null)
    setAppMode('notes')
    setAppSidebarView('explorer')
    setTabOverviewOpen(false)
    setGraphViewOpen(false)
    setCanvasViewOpen(true)
  }, [
    setAppMode,
    setAppSidebarView,
    setCanvasViewOpen,
    setGraphViewOpen,
    setTabOverviewOpen,
    setWorkspaceSettingsFolderId
  ])

  const closeCanvasView = useCallback(() => {
    setCanvasViewOpen(false)
  }, [setCanvasViewOpen])

  const closeTabOverview = useCallback(() => {
    setTabOverviewOpen(false)
  }, [setTabOverviewOpen])

  const setShortcutsCaptureActive = useCallback(
    (active: boolean) => {
      shortcutsSuppressedRef.current = active
    },
    [shortcutsSuppressedRef]
  )

  const updateShortcutBinding = useCallback(
    (id: ShortcutActionId, binding: ShortcutBinding) => {
      setShortcutBindings((prev) => {
        const next = { ...prev, [id]: binding }
        saveShortcutBindings(next)
        return next
      })
    },
    [setShortcutBindings]
  )

  const resetShortcutsToDefaults = useCallback(() => {
    const next = resetShortcutBindings()
    setShortcutBindings(next)
  }, [setShortcutBindings])

  /** macOS: liquid sidebar overlays full-bleed main so glass blurs --background from the editor column. */
  const sidebarOverlayActive = useMemo(
    () => isMacNotelab && !sidebarCollapsed && !zenMode,
    [isMacNotelab, sidebarCollapsed, zenMode]
  )

  useEffect(() => {
    if (!zenMode) return
    if (
      appMode !== 'notes' ||
      workspaceSettingsFolderId ||
      !selectedNote ||
      selectedNote.kind === 'drawing'
    ) {
      exitZenMode()
    }
  }, [appMode, exitZenMode, selectedNote, workspaceSettingsFolderId, zenMode])

  useEffect(() => {
    const win = getWindowApi()
    if (!win) return
    void win.setZenPresentation(zenMode)
  }, [zenMode])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.getLiquidGlassState || !win.onLiquidGlassState) return
    void win.getLiquidGlassState().then((s) => setNativeLiquidGlassAttached(s.attached))
    return win.onLiquidGlassState((s) => setNativeLiquidGlassAttached(s.attached))
  }, [])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.onNativeFullScreenExit) return
    return win.onNativeFullScreenExit(() => {
      if (zenModeRef.current) {
        exitZenMode()
      }
    })
  }, [exitZenMode, zenModeRef])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.setZenShortcutBinding) return
    void win.setZenShortcutBinding(shortcutBindings.toggleZenMode)
  }, [shortcutBindings.toggleZenMode])

  useEffect(() => {
    const win = getWindowApi()
    if (!win?.onZenShortcutFromMain) return
    return win.onZenShortcutFromMain(() => {
      if (shortcutsSuppressedRef.current) return
      toggleZenMode()
    })
  }, [shortcutsSuppressedRef, toggleZenMode])

  const openShortcuts = useCallback(() => {
    setWorkspaceSettingsFolderId(null)
    setGraphViewOpen(false)
    setTabOverviewOpen(false)
    setAppMode('settings')
    setAppSidebarView('settings')
    setSettingsSection('shortcuts')
  }, [
    setAppMode,
    setAppSidebarView,
    setGraphViewOpen,
    setSettingsSection,
    setTabOverviewOpen,
    setWorkspaceSettingsFolderId
  ])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (shortcutsSuppressedRef.current) return
      if (zenModeRef.current && e.key === 'Escape' && !e.repeat) {
        const now = Date.now()
        if (now - lastZenEscPressRef.current < 500) {
          e.preventDefault()
          e.stopPropagation()
          lastZenEscPressRef.current = 0
          exitZenMode()
        } else {
          lastZenEscPressRef.current = now
        }
        return
      }
      if (e.repeat) return
      const map = shortcutBindingsRef.current
      if (keyboardEventMatchesBinding(e, map.toggleSidebar)) {
        e.preventDefault()
        e.stopPropagation()
        toggleSidebar()
        return
      }
      if (keyboardEventMatchesBinding(e, map.newNote)) {
        e.preventDefault()
        e.stopPropagation()
        if (appMode === 'settings') {
          setAppMode('notes')
          setAppSidebarView('explorer')
        }
        handleNewNote()
        return
      }
      if (keyboardEventMatchesBinding(e, map.newFolder)) {
        e.preventDefault()
        e.stopPropagation()
        if (appMode === 'settings') {
          setAppMode('notes')
          setAppSidebarView('explorer')
        }
        startFolderCreateRef.current?.()
        return
      }
      if (keyboardEventMatchesBinding(e, map.toggleZenMode)) {
        e.preventDefault()
        e.stopPropagation()
        toggleZenMode()
        return
      }
      if (keyboardEventMatchesBinding(e, map.nextTab)) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedId((current) => {
          const tabs = openNoteTabIdsRef.current
          if (tabs.length === 0) return current
          const idx = current ? tabs.indexOf(current) : -1
          return tabs[(idx + 1) % tabs.length] ?? current
        })
        return
      }
      if (keyboardEventMatchesBinding(e, map.prevTab)) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedId((current) => {
          const tabs = openNoteTabIdsRef.current
          if (tabs.length === 0) return current
          const idx = current ? tabs.indexOf(current) : 0
          return tabs[(idx - 1 + tabs.length) % tabs.length] ?? current
        })
        return
      }
      if (keyboardEventMatchesBinding(e, map.closeTab)) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedId((current) => {
          if (!current) return current
          const prev = openNoteTabIdsRef.current
          const idx = prev.indexOf(current)
          const next = prev.filter((id) => id !== current)
          setOpenNoteTabIds(next)
          const fallback = next[idx - 1] ?? next[idx] ?? next[0] ?? null
          return fallback
        })
        return
      }
      if (keyboardEventMatchesBinding(e, map.renameSelected)) {
        e.preventDefault()
        e.stopPropagation()
        triggerRenameSelectedRef.current?.()
        return
      }
      if (keyboardEventMatchesBinding(e, map.toggleChat)) {
        e.preventDefault()
        e.stopPropagation()
        toggleChatSidebar()
        return
      }
      if (keyboardEventMatchesBinding(e, map.openShortcuts)) {
        e.preventDefault()
        e.stopPropagation()
        openShortcuts()
        return
      }
      // Ctrl/Cmd+1–9: jump to tab by index (9 always selects the last tab)
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        const digit = e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : null
        if (digit !== null) {
          const tabs = openNoteTabIdsRef.current
          if (tabs.length > 0) {
            e.preventDefault()
            e.stopPropagation()
            const target = digit === 9 ? tabs[tabs.length - 1] : tabs[digit - 1]
            if (target) setSelectedId(target)
          }
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    appMode,
    exitZenMode,
    handleNewNote,
    lastZenEscPressRef,
    openNoteTabIdsRef,
    openShortcuts,
    setAppMode,
    setAppSidebarView,
    setOpenNoteTabIds,
    setSelectedId,
    shortcutBindingsRef,
    shortcutsSuppressedRef,
    startFolderCreateRef,
    toggleChatSidebar,
    toggleSidebar,
    toggleZenMode,
    triggerRenameSelectedRef,
    zenModeRef
  ])

  // Persist window session (selected note, open tabs, chat state, workspace) on change.
  useEffect(() => {
    const api = getApi()
    if (!api?.multiWindow?.setSession) return
    void api.multiWindow.setSession({
      workspacePath: workspaceRoot ?? undefined,
      selectedNoteId: selectedNotePath,
      openNoteTabPaths,
      chatSidebarOpen
    })
  }, [chatSidebarOpen, openNoteTabPaths, selectedNotePath, workspaceRoot])

  return {
    nativeLiquidGlassAttached,
    backToNotes,
    toggleSidebar,
    toggleChatSidebar,
    exitZenMode,
    toggleZenMode,
    closeGraphView,
    openGraphView,
    openTabOverview,
    openCanvasView,
    closeCanvasView,
    closeTabOverview,
    setShortcutsCaptureActive,
    updateShortcutBinding,
    resetShortcutsToDefaults,
    sidebarOverlayActive,
    openShortcuts
  }
}

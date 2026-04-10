import { useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import {
  ArrowLeft,
  Bug,
  Keyboard,
  Palette,
  Network,
  NotebookPen,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Settings2,
  Sparkles,
  SquarePen,
  Trash2,
  User,
  LayoutDashboard,
  PencilRuler,
  Search,
  X
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView
} from '@/components/ui/tree'
import { cn } from '@/lib/utils'
import { enableInfinityCanvas } from '@/lib/core/vite-flags'
import { SidebarEdgeToolbarPill } from '@/components/notes/editor-area/NotesToolbarPill'
import { DEFAULT_WORKSPACE_ID, formatNoteTime, type SavedNote } from '@/lib/notes/notes-storage'
import { searchNotes, searchFolders } from '@/lib/notes/notes-search'
import { AppSidebarRail } from '@/components/notes/sidebar/AppSidebar'
import { WorkspaceSwitcher } from '@/components/notes/sidebar/WorkspaceSwitcher'
import { GitSourceControlPanel } from '@/components/notes/git/GitSourceControlPanel'
import { NoteLeadingIcon } from '@/components/notes/sidebar/NoteLeadingIcon'
import { FOLDER_DRAG_MIME, NOTE_DRAG_MIME, treeFolderPath, treeNotePath } from '@/components/notes/notes-app-utils'
import type { NotesAppViewModel } from '@/components/notes/app-state/useNotesApp'

export type NotesSidebarProps = {
  vm: NotesAppViewModel
}

export function NotesSidebar({ vm }: NotesSidebarProps): JSX.Element {
  const {
    isMacNotelab,
    appearanceSettings,
    macTitlebarStyles,
    appMode,
    settingsSection,
    setSettingsSection,
    folders,
    notesByFolder,
    clearSidebarWorkspaceIntent,
    canCreateNote,
    folderCreateOpen,
    folderDraft,
    folderInputRef,
    onFolderNameChange,
    onFolderNameBlur,
    selectedNotePath,
    focusedFolderId,
    treeExpandNonce,
    treeExpandIds,
    treeSelectedIds,
    defaultExpandedFolderIds,
    handleTreeSelectionChange,
    handleNewNote,
    handleDeleteNote,
    renameNote,
    renameFolder,
    moveNoteToFolder,
    reorderFolders,
    reorderFolderToEnd,
    openFolderSettings,
    onFolderDraftKeyDown,
    backToNotes,
    startFolderCreate,
    handleNewDrawing,
    graphViewOpen,
    openGraphView,
    closeGraphView,
    canvasViewOpen,
    openCanvasView,
    closeCanvasView,
    journalViewOpen,
    openJournalView,
    closeJournalView,
    toggleSidebar,
    appSidebarView,
    triggerRenameSelectedRef,
    openFolderSettingsPanel,
    workspaceRoot,
    handleWorkspaceRootChange,
  } = vm

  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const skipRenameCommitRef = useRef(false)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const [folderDropAtEnd, setFolderDropAtEnd] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const openSearch = (): void => {
    setSearchOpen(true)
    setSearchQuery('')
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const closeSearch = (): void => {
    setSearchOpen(false)
    setSearchQuery('')
  }

  const allNotes = useMemo(() => {
    const notes: SavedNote[] = []
    notesByFolder.forEach((list) => notes.push(...list))
    return notes
  }, [notesByFolder])

  const searchResults = useMemo(
    () => searchNotes(allNotes, folders, searchQuery, { limit: 20 }),
    [allNotes, folders, searchQuery]
  )

  const folderSearchResults = useMemo(
    () => searchFolders(folders, searchQuery, { limit: 10 }),
    [folders, searchQuery]
  )

  useEffect(() => {
    const clearDrop = (): void => {
      setDropTargetFolderId(null)
      setFolderDropAtEnd(false)
    }
    window.addEventListener('dragend', clearDrop)
    return () => window.removeEventListener('dragend', clearDrop)
  }, [])

  const sidebarAcceptsDrop = (e: globalThis.DragEvent): boolean => {
    if (!e.dataTransfer) return false
    const types = [...e.dataTransfer.types]
    return types.includes(NOTE_DRAG_MIME) || types.includes(FOLDER_DRAG_MIME)
  }

  const onFolderRowDrop = (e: globalThis.DragEvent, folder: string): void => {
    if (!sidebarAcceptsDrop(e)) return
    if (!e.dataTransfer) return
    e.preventDefault()
    e.stopPropagation()
    setDropTargetFolderId(null)
    setFolderDropAtEnd(false)

    const notePath = e.dataTransfer.getData(NOTE_DRAG_MIME)
    if (notePath) {
      moveNoteToFolder(notePath, folder)
      return
    }
    const draggedFolderId = e.dataTransfer.getData(FOLDER_DRAG_MIME)
    if (draggedFolderId && draggedFolderId !== folder && folder !== DEFAULT_WORKSPACE_ID) {
      reorderFolders(draggedFolderId, folder)
    }
  }

  /** One ring around root or an entire workspace (folder row + nested notes). */
  const onFolderSectionDragOverCapture =
    (targetFolderId: string) => (e: DragEvent<HTMLDivElement>) => {
      const ev = e.nativeEvent
      if (!ev.dataTransfer) return
      if (!sidebarAcceptsDrop(ev)) return
      e.preventDefault()
      e.stopPropagation()
      ev.dataTransfer.dropEffect = 'move'
      setDropTargetFolderId(targetFolderId)
      setFolderDropAtEnd(false)
    }

  const onFolderSectionDropCapture = (targetFolderId: string) => (e: DragEvent<HTMLDivElement>) => {
    onFolderRowDrop(e.nativeEvent, targetFolderId)
  }

  const onFolderStripDragOver = (e: DragEvent): void => {
    const types = [...e.dataTransfer.types]
    if (!types.includes(FOLDER_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setFolderDropAtEnd(true)
    setDropTargetFolderId(null)
  }

  const onFolderStripDrop = (e: DragEvent): void => {
    const types = [...e.dataTransfer.types]
    if (!types.includes(FOLDER_DRAG_MIME)) return
    e.preventDefault()
    setFolderDropAtEnd(false)
    const draggedFolderId = e.dataTransfer.getData(FOLDER_DRAG_MIME)
    if (draggedFolderId) reorderFolderToEnd(draggedFolderId)
  }

  const findNoteById = (notePath: string): SavedNote | undefined => {
    for (const list of notesByFolder.values()) {
      const n = list.find((x) => x.path === notePath)
      if (n) return n
    }
    return undefined
  }

  const beginRename = (treeId: string, initial: string): void => {
    skipRenameCommitRef.current = false
    setRenamingNodeId(treeId)
    setRenameDraft(initial)
  }

  // Register the rename trigger so the global keyboard shortcut (F2) can invoke it.
  triggerRenameSelectedRef.current = () => {
    if (selectedNotePath) {
      const note = findNoteById(selectedNotePath)
      if (note) beginRename(treeNotePath(selectedNotePath), note.title)
    } else if (focusedFolderId) {
      const folder = folders.find((f) => f.folder === focusedFolderId)
      if (folder) beginRename(treeFolderPath(focusedFolderId), folder.name)
    }
  }

  const cancelRename = (): void => {
    skipRenameCommitRef.current = true
    setRenamingNodeId(null)
  }

  const commitRename = (treeNodeId: string): void => {
    if (skipRenameCommitRef.current) {
      skipRenameCommitRef.current = false
      return
    }
    const trimmed = renameDraft.trim()
    if (treeNodeId.startsWith('note:')) {
      const notePath = treeNodeId.slice('note:'.length)
      const nextTitle = trimmed || 'Untitled'
      const prev = findNoteById(notePath)
      if (prev && nextTitle !== prev.title) renameNote(notePath, nextTitle)
    } else if (treeNodeId.startsWith('folder:')) {
      const folderPath = treeNodeId.slice('folder:'.length)
      const nextName = trimmed || 'Untitled folder'
      const workspace = folders.find((f) => f.folder === folderPath)
      if (workspace && nextName !== workspace.name) renameFolder(folderPath, nextName)
    }
    setRenamingNodeId(null)
  }

  const treeRename = {
    renamingNodeId,
    draft: renameDraft,
    onDraftChange: setRenameDraft,
    onBeginRename: beginRename,
    onCommitRename: commitRename,
    onCancelRename: cancelRename
  }

  const animationsEnabled = appearanceSettings.animationsEnabled
  const inboxNotes = notesByFolder.get(DEFAULT_WORKSPACE_ID) ?? []

  return (
    <aside
      className={cn(
        'text-sidebar-foreground flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col',
        isMacNotelab && 'pointer-events-none',
        'bg-sidebar border-sidebar-border border-r'
      )}
      onPointerDownCapture={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('[data-sidebar-interactive]')) return
        clearSidebarWorkspaceIntent()
      }}
    >
      {/*
        Top bar spans rail + main column so border-b is continuous with NotesMainArea; rail border-r starts below this row.
      */}
      <div
        className={cn(
          'border-border relative z-10 flex h-12 w-full shrink-0 flex-row items-stretch border-b',
          isMacNotelab && 'pointer-events-none'
        )}
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1',
            isMacNotelab ? 'pointer-events-none pl-[92px] pr-2' : 'px-2'
          )}
        >
          <WorkspaceSwitcher
            workspaceRoot={workspaceRoot}
            isMacNotelab={isMacNotelab}
            onWorkspaceRootChange={handleWorkspaceRootChange}
            className="w-full"
          />
        </div>
        <div
          className={cn(
            'flex shrink-0 items-center justify-end gap-1',
            isMacNotelab ? 'pointer-events-none pr-2' : 'px-2'
          )}
        >
          <div className="pointer-events-auto">
            <SidebarEdgeToolbarPill
              macTitlebarStyles={macTitlebarStyles}
              expanded
              onClick={toggleSidebar}
              markSidebarInteractive
            />
          </div>
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-row">
        <AppSidebarRail vm={vm} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {appMode === 'notes' && appSidebarView === 'explorer' ? (
            <AnimatePresence mode="wait" initial={false}>
              {searchOpen ? (
                animationsEnabled ? (
                  <motion.div
                    key="search-bar"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'relative z-10 flex w-full shrink-0 flex-row flex-nowrap items-stretch justify-start gap-0.5 py-1.5',
                      isMacNotelab ? 'pointer-events-none px-4 pr-2' : 'px-2'
                    )}
                  >
                    <div
                      className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1"
                      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                    >
                      <Input
                        ref={searchInputRef}
                        placeholder="Search notes…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 flex-1"
                        aria-label="Search notes"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground size-8 shrink-0 p-0"
                        aria-label="Close search"
                        onClick={closeSearch}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <div
                    key="search-bar"
                    className={cn(
                      'relative z-10 flex w-full shrink-0 flex-row flex-nowrap items-stretch justify-start gap-0.5 py-1.5',
                      isMacNotelab ? 'pointer-events-none px-4 pr-2' : 'px-2'
                    )}
                  >
                    <div
                      className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1"
                      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                    >
                      <Input
                        ref={searchInputRef}
                        placeholder="Search notes…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 flex-1"
                        aria-label="Search notes"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground size-8 shrink-0 p-0"
                        aria-label="Close search"
                        onClick={closeSearch}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                animationsEnabled ? (
                  <motion.div
                    key="toolbar"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'relative z-10 flex w-full shrink-0 flex-row flex-nowrap items-stretch justify-start gap-0.5 py-1.5',
                      isMacNotelab ? 'pointer-events-none px-4 pr-2' : 'px-2'
                    )}
                  >
                    <div
                      className="pointer-events-auto flex min-w-0 flex-1 items-center justify-between gap-0.5"
                      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                    >
                      <div className="flex min-w-0 flex-none items-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground size-8 shrink-0 p-0"
                          aria-label="New folder"
                          onClick={startFolderCreate}
                          data-sidebar-interactive=""
                          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                        >
                          <FolderPlus className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground size-8 shrink-0 p-0"
                          aria-label="New note"
                          disabled={!canCreateNote}
                          onClick={handleNewNote}
                          data-sidebar-interactive=""
                          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                        >
                          <SquarePen className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground size-8 shrink-0 p-0"
                          title="New drawing"
                          aria-label="New drawing"
                          disabled={!canCreateNote}
                          onClick={handleNewDrawing}
                          data-sidebar-interactive=""
                          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                        >
                          <PencilRuler className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={graphViewOpen ? 'secondary' : 'ghost'}
                          className={cn(
                            'size-8 shrink-0 p-0',
                            graphViewOpen ? 'text-foreground' : 'text-muted-foreground'
                          )}
                          title="Note link graph"
                          aria-label="Note link graph"
                          aria-pressed={graphViewOpen}
                          disabled={!canCreateNote}
                          onClick={() => (graphViewOpen ? closeGraphView() : openGraphView())}
                          data-sidebar-interactive=""
                          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                        >
                          <Network className="size-4" aria-hidden />
                        </Button>
                        {enableInfinityCanvas ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={canvasViewOpen ? 'secondary' : 'ghost'}
                            className={cn(
                              'size-8 shrink-0 p-0',
                              canvasViewOpen ? 'text-foreground' : 'text-muted-foreground'
                            )}
                            title="Infinity canvas"
                            aria-label="Infinity canvas"
                            aria-pressed={canvasViewOpen}
                            disabled={!canCreateNote}
                            onClick={() => (canvasViewOpen ? closeCanvasView() : openCanvasView())}
                            data-sidebar-interactive=""
                            style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                          >
                            <LayoutDashboard className="size-4" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground size-8 shrink-0 p-0"
                        title="Search notes"
                        aria-label="Search notes"
                        onClick={openSearch}
                        data-sidebar-interactive=""
                        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                      >
                        <Search className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <div
                    key="toolbar"
                    className={cn(
                      'relative z-10 flex w-full shrink-0 flex-row flex-nowrap items-stretch justify-start gap-0.5 py-1.5',
                      isMacNotelab ? 'pointer-events-none px-4 pr-2' : 'px-2'
                    )}
                  >
                    <div
                      className="pointer-events-auto flex min-w-0 flex-1 items-center justify-between gap-0.5"
                      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                    >
                    <div className="flex min-w-0 flex-none items-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground size-8 shrink-0 p-0"
                        aria-label="New folder"
                        onClick={startFolderCreate}
                        data-sidebar-interactive=""
                        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                      >
                        <FolderPlus className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground size-8 shrink-0 p-0"
                        aria-label="New note"
                        disabled={!canCreateNote}
                        onClick={handleNewNote}
                        data-sidebar-interactive=""
                        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                      >
                        <SquarePen className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground size-8 shrink-0 p-0"
                        title="New drawing"
                        aria-label="New drawing"
                        disabled={!canCreateNote}
                        onClick={handleNewDrawing}
                        data-sidebar-interactive=""
                        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                      >
                        <PencilRuler className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={graphViewOpen ? 'secondary' : 'ghost'}
                        className={cn(
                          'size-8 shrink-0 p-0',
                          graphViewOpen ? 'text-foreground' : 'text-muted-foreground'
                        )}
                        title="Note link graph"
                        aria-label="Note link graph"
                        aria-pressed={graphViewOpen}
                        disabled={!canCreateNote}
                        onClick={() => (graphViewOpen ? closeGraphView() : openGraphView())}
                        data-sidebar-interactive=""
                        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                      >
                        <Network className="size-4" aria-hidden />
                      </Button>
                      {enableInfinityCanvas ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={canvasViewOpen ? 'secondary' : 'ghost'}
                          className={cn(
                            'size-8 shrink-0 p-0',
                            canvasViewOpen ? 'text-foreground' : 'text-muted-foreground'
                          )}
                          title="Infinity canvas"
                          aria-label="Infinity canvas"
                          aria-pressed={canvasViewOpen}
                          disabled={!canCreateNote}
                          onClick={() => (canvasViewOpen ? closeCanvasView() : openCanvasView())}
                          data-sidebar-interactive=""
                          style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                        >
                          <LayoutDashboard className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground size-8 shrink-0 p-0"
                      title="Search notes"
                      aria-label="Search notes"
                      onClick={openSearch}
                      data-sidebar-interactive=""
                      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                    >
                      <Search className="size-4" aria-hidden />
                    </Button>
                    </div>
                  </div>
                )
              )}
            </AnimatePresence>
          ) : null}
          {appMode === 'settings' ? (
            <div
              className={cn(
                'relative z-10 flex w-full shrink-0 items-stretch py-1.5',
                isMacNotelab ? 'pointer-events-none px-2' : 'px-2'
              )}
              style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  'text-muted-foreground h-8 w-full min-w-0 gap-1.5 px-2.5 items-center justify-start',
                  isMacNotelab && 'pointer-events-auto'
                )}
                onClick={backToNotes}
                data-sidebar-interactive=""
                style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
              >
                <ArrowLeft className="size-4 shrink-0" aria-hidden />
                <span className="text-muted-foreground text-left text-[13px] font-medium leading-tight">
                  Back to notes
                </span>
              </Button>
            </div>
          ) : null}
          <div
            className={cn(
              'min-h-0 flex-1',
              isMacNotelab && 'pointer-events-auto',
              appSidebarView === 'source-control'
                ? 'flex min-h-0 flex-col overflow-hidden p-0'
                : 'overflow-y-auto p-2'
            )}
          >
            {appMode === 'notes' && appSidebarView === 'explorer' ? (
              <div className="mb-1.5 shrink-0">
                <button
                  type="button"
                  data-sidebar-interactive=""
                  onClick={() => (journalViewOpen ? closeJournalView() : openJournalView())}
                  className={cn(
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                    journalViewOpen && 'bg-sidebar-accent text-sidebar-accent-foreground'
                  )}
                >
                  <NotebookPen className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                  Journal
                </button>
              </div>
            ) : null}
            {appMode === 'settings' ? (
              <ul className="flex flex-col gap-0">
                <li>
                  <button
                    type="button"
                    data-sidebar-interactive=""
                    onClick={() => setSettingsSection('account')}
                    className={cn(
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                      settingsSection === 'account' &&
                      'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <User className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    Account
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    data-sidebar-interactive=""
                    onClick={() => setSettingsSection('workspace')}
                    className={cn(
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                      settingsSection === 'workspace' && 'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <FolderOpen className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    Workspace
                  </button>
                </li>

                <li>
                  <button
                    type="button"
                    data-sidebar-interactive=""
                    onClick={() => setSettingsSection('appearance')}
                    className={cn(
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                      settingsSection === 'appearance' &&
                      'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <Palette className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    Appearance
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    data-sidebar-interactive=""
                    onClick={() => setSettingsSection('editor')}
                    className={cn(
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                      settingsSection === 'editor' &&
                      'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <PencilRuler className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    Editor
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    data-sidebar-interactive=""
                    onClick={() => setSettingsSection('shortcuts')}
                    className={cn(
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                      settingsSection === 'shortcuts' &&
                      'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <Keyboard className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    Shortcuts
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    data-sidebar-interactive=""
                    onClick={() => setSettingsSection('debug')}
                    className={cn(
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                      settingsSection === 'debug' && 'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <Bug className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    Debug
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    data-sidebar-interactive=""
                    onClick={() => setSettingsSection('indexing')}
                    className={cn(
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                      settingsSection === 'indexing' &&
                      'bg-sidebar-accent text-sidebar-accent-foreground'
                    )}
                  >
                    <Sparkles className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    Indexing
                  </button>
                </li>
              </ul>
            ) : appSidebarView === 'source-control' ? (
              <GitSourceControlPanel vm={vm} />
            ) : searchOpen && searchQuery.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1">
                {folderSearchResults.length > 0 && (
                  <>
                    <p className="text-muted-foreground px-2 pb-1 text-xs font-medium uppercase tracking-wide">
                      Workspaces
                    </p>
                    <ul className="flex flex-col gap-0.5 pb-1">
                      {folderSearchResults.map(({ folder, nameSegments }) => (
                        <li key={folder.folder}>
                          <button
                            type="button"
                            data-sidebar-interactive=""
                            onClick={() => {
                              closeSearch()
                              openFolderSettingsPanel(folder.folder)
                            }}
                            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors"
                          >
                            <FolderOpen className="text-muted-foreground size-4 shrink-0" aria-hidden />
                            <span className="line-clamp-1 flex-1 text-[13px] font-medium leading-snug">
                              {nameSegments.map((seg, i) =>
                                seg.highlight ? (
                                  <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">
                                    {seg.text}
                                  </mark>
                                ) : (
                                  <span key={i}>{seg.text}</span>
                                )
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {searchResults.length > 0 && (
                  <>
                    <p className="text-muted-foreground px-2 pb-1 text-xs font-medium uppercase tracking-wide">
                      Notes
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {searchResults.map(({ note, snippetSegments, folderName }) => (
                        <li key={note.path}>
                          <button
                            type="button"
                            data-sidebar-interactive=""
                            onClick={() => {
                              closeSearch()
                              backToNotes()
                              const treeId = treeNotePath(note.path)
                              handleTreeSelectionChange([treeId])
                            }}
                            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full min-w-0 flex-col items-start gap-1 rounded-md px-2 py-2 text-left transition-colors"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <Folder className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                              <span className="line-clamp-1 text-[13px] font-medium leading-snug">
                                {note.title || 'Untitled'}
                              </span>
                              <span className="text-muted-foreground shrink-0 text-[11px]">{folderName}</span>
                            </div>
                            {snippetSegments.some((s) => s.highlight) && (
                              <p className="text-muted-foreground line-clamp-2 text-left text-[12px] leading-snug">
                                {snippetSegments.map((seg, i) =>
                                  seg.highlight ? (
                                    <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">
                                      {seg.text}
                                    </mark>
                                  ) : (
                                    <span key={i}>{seg.text}</span>
                                  )
                                )}
                              </p>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {folderSearchResults.length === 0 && searchResults.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-4 text-sm">No matching notes or workspaces.</p>
                ) : null}
              </div>
            ) : (
              <TreeProvider
                key={defaultExpandedFolderIds.join('|')}
                defaultExpandedIds={defaultExpandedFolderIds}
                expandNonce={treeExpandNonce}
                expandNodeIds={treeExpandIds}
                showLines
                showIcons
                selectable
                multiSelect={false}
                selectedIds={treeSelectedIds}
                onSelectionChange={handleTreeSelectionChange}
                rename={treeRename}
              >
                <TreeView className="p-0">
                  {inboxNotes.length > 0 || folders.length > 0 ? (
                    <div
                      className={cn(
                        'mx-1 overflow-hidden rounded-md transition-colors',
                        dropTargetFolderId === DEFAULT_WORKSPACE_ID &&
                        'bg-sidebar-accent/20 ring-primary/40 ring-1 ring-inset'
                      )}
                      onDragOverCapture={onFolderSectionDragOverCapture(DEFAULT_WORKSPACE_ID)}
                      onDropCapture={onFolderSectionDropCapture(DEFAULT_WORKSPACE_ID)}
                    >
                      {inboxNotes.map((note, ni) => {
                        const isLastRootNote =
                          ni === inboxNotes.length - 1 && folders.length === 0 && !folderCreateOpen
                        const noteTreeId = treeNotePath(note.path)
                        const isRenaming = renamingNodeId === noteTreeId
                        return (
                          <TreeNode key={note.path} nodeId={noteTreeId} isLast={isLastRootNote}>
                            <TreeNodeTrigger
                              draggable={!isRenaming}
                              data-sidebar-interactive=""
                              onDragStart={(e) => {
                                const drag = e as unknown as globalThis.DragEvent
                                if (!drag.dataTransfer) return
                                drag.dataTransfer.setData(NOTE_DRAG_MIME, note.path)
                                drag.dataTransfer.effectAllowed = 'copyMove'
                              }}
                              className={cn(
                                'hover:bg-sidebar-accent/50',
                                selectedNotePath === note.path &&
                                !focusedFolderId &&
                                '!bg-sidebar-accent !text-sidebar-accent-foreground'
                              )}
                            >
                              <TreeExpander hasChildren={false} />
                              <TreeIcon
                                hasChildren={false}
                                icon={<NoteLeadingIcon note={note} variant="sidebar" />}
                              />
                              <TreeLabel
                                className="flex min-w-0 flex-1 items-center"
                                renameInitialValue={note.title}
                              >
                                <span className="line-clamp-2 text-left font-medium leading-snug">
                                  {note.title || 'Untitled'}
                                </span>
                              </TreeLabel>
                              <div className="flex h-6 shrink-0 items-center justify-end gap-0.5 pl-2">
                                <span
                                  className="text-muted-foreground whitespace-nowrap text-[11px] tabular-nums group-hover:hidden"
                                  title={formatNoteTime(note.updatedAt)}
                                >
                                  {formatNoteTime(note.updatedAt)}
                                </span>
                                <span
                                  role="presentation"
                                  className="hidden shrink-0 gap-0.5 group-hover:flex"
                                  style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="text-muted-foreground size-6"
                                    aria-label={`Rename ${note.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      beginRename(noteTreeId, note.title)
                                    }}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="text-muted-foreground hover:text-destructive size-6"
                                    aria-label="Delete note"
                                    onClick={(e) => handleDeleteNote(note.path, e)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </span>
                              </div>
                            </TreeNodeTrigger>
                          </TreeNode>
                        )
                      })}
                    </div>
                  ) : null}
                  {folders.map((folder, fi) => {
                    const notesInFolder = notesByFolder.get(folder.folder) ?? []
                    const isLastFolder = fi === folders.length - 1 && !folderCreateOpen
                    return (
                      <div
                        key={folder.folder}
                        className={cn(
                          'mx-1 overflow-hidden rounded-md transition-colors',
                          dropTargetFolderId === folder.folder &&
                          'bg-sidebar-accent/20 ring-primary/40 ring-1 ring-inset'
                        )}
                        onDragOverCapture={onFolderSectionDragOverCapture(folder.folder)}
                        onDropCapture={onFolderSectionDropCapture(folder.folder)}
                      >
                        <TreeNode nodeId={treeFolderPath(folder.folder)} isLast={isLastFolder}>
                          <TreeNodeTrigger
                            data-sidebar-interactive=""
                            draggable={renamingNodeId !== treeFolderPath(folder.folder)}
                            onDragStart={(e) => {
                              const ev = e as unknown as globalThis.DragEvent
                              if (!ev.dataTransfer) return
                              ev.dataTransfer.setData(FOLDER_DRAG_MIME, folder.folder)
                              ev.dataTransfer.effectAllowed = 'move'
                            }}
                            className={cn(
                              'hover:bg-sidebar-accent/50',
                              focusedFolderId === folder.folder &&
                              '!bg-sidebar-accent !text-sidebar-accent-foreground'
                            )}
                          >
                            <TreeExpander hasChildren />
                            <TreeIcon hasChildren />
                            <TreeLabel renameInitialValue={folder.name}>{folder.name}</TreeLabel>
                            <span
                              role="presentation"
                              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                              style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="text-muted-foreground size-6"
                                aria-label={`Folder settings for ${folder.name}`}
                                onClick={(e) => openFolderSettings(folder.folder, e)}
                                data-sidebar-interactive=""
                              >
                                <Settings2 className="size-3.5" aria-hidden />
                              </Button>
                            </span>
                          </TreeNodeTrigger>
                          <TreeNodeContent hasChildren>
                            {notesInFolder.map((note, ni) => {
                              const isLastNote = ni === notesInFolder.length - 1
                              const noteTreeId = treeNotePath(note.path)
                              const isRenaming = renamingNodeId === noteTreeId
                              return (
                                <TreeNode
                                  key={note.path}
                                  nodeId={noteTreeId}
                                  level={1}
                                  isLast={isLastNote}
                                >
                                  <TreeNodeTrigger
                                    draggable={!isRenaming}
                                    data-sidebar-interactive=""
                                    onDragStart={(e) => {
                                      const drag = e as unknown as globalThis.DragEvent
                                      if (!drag.dataTransfer) return
                                      drag.dataTransfer.setData(NOTE_DRAG_MIME, note.path)
                                      drag.dataTransfer.effectAllowed = 'copyMove'
                                    }}
                                    className={cn(
                                      'hover:bg-sidebar-accent/50',
                                      selectedNotePath === note.path &&
                                      !focusedFolderId &&
                                      '!bg-sidebar-accent !text-sidebar-accent-foreground'
                                    )}
                                  >
                                    <TreeExpander hasChildren={false} />
                                    <TreeIcon
                                      hasChildren={false}
                                      icon={<NoteLeadingIcon note={note} variant="sidebar" />}
                                    />
                                    <TreeLabel
                                      className="flex min-w-0 flex-1 items-center"
                                      renameInitialValue={note.title}
                                    >
                                      <span className="line-clamp-2 text-left font-medium leading-snug">
                                        {note.title || 'Untitled'}
                                      </span>
                                    </TreeLabel>
                                    <div className="flex h-6 shrink-0 items-center justify-end gap-0.5 pl-2">
                                      <span
                                        className="text-muted-foreground whitespace-nowrap text-[11px] tabular-nums group-hover:hidden"
                                        title={formatNoteTime(note.updatedAt)}
                                      >
                                        {formatNoteTime(note.updatedAt)}
                                      </span>
                                      <span
                                        role="presentation"
                                        className="hidden shrink-0 gap-0.5 group-hover:flex"
                                        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                                      >
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-xs"
                                          className="text-muted-foreground size-6"
                                          aria-label={`Rename ${note.title}`}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            beginRename(noteTreeId, note.title)
                                          }}
                                        >
                                          <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-xs"
                                          className="text-muted-foreground hover:text-destructive size-6"
                                          aria-label="Delete note"
                                          onClick={(e) => handleDeleteNote(note.path, e)}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </span>
                                    </div>
                                  </TreeNodeTrigger>
                                </TreeNode>
                              )
                            })}
                          </TreeNodeContent>
                        </TreeNode>
                      </div>
                    )
                  })}

                  {folders.length > 0 ? (
                    <div
                      className={cn(
                        'mx-1 mt-0.5 min-h-[6px] rounded-md transition-colors',
                        folderDropAtEnd && 'bg-sidebar-accent/25 ring-primary/40 ring-1 ring-inset'
                      )}
                      onDragOver={(e) => onFolderStripDragOver(e)}
                      onDragLeave={() => setFolderDropAtEnd(false)}
                      onDrop={(e) => onFolderStripDrop(e)}
                      aria-hidden
                    />
                  ) : null}

                  {folderCreateOpen ? (
                    <div
                      className={cn(
                        'mx-1 mt-1 flex items-center gap-2 rounded-md border border-dashed px-3 py-2',
                        'border-sidebar-border'
                      )}
                      style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
                      data-sidebar-interactive=""
                    >
                      <div className="mr-1 h-4 w-4 shrink-0" aria-hidden />
                      <Folder className="text-muted-foreground mr-2 h-4 w-4 shrink-0" aria-hidden />
                      <Input
                        ref={folderInputRef}
                        className="h-8 flex-1"
                        placeholder="Folder name"
                        value={folderDraft}
                        onChange={(e) => onFolderNameChange(e.target.value)}
                        onKeyDown={onFolderDraftKeyDown}
                        onBlur={onFolderNameBlur}
                        aria-label="New folder name"
                      />
                    </div>
                  ) : null}
                </TreeView>
              </TreeProvider>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

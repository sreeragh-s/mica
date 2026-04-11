import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from 'react'
import { NotebookPen } from 'lucide-react'

import { DEFAULT_WORKSPACE_ID, type SavedNote } from '@/lib/notes/notes-storage'
import { searchNotes, searchFolders } from '@/lib/notes/notes-search'
import {
  FOLDER_DRAG_MIME,
  NOTE_DRAG_MIME,
  treeFolderPath,
  treeNotePath
} from '@/features/notes/notes-app-utils'
import { AppSidebarRail } from '@/features/notes/sidebar/AppSidebar'
import { GitSourceControlPanel } from '@/features/notes/git/GitSourceControlPanel'
import { SidebarExplorerToolbar } from '@/features/notes/sidebar/SidebarExplorerToolbar'
import { SidebarExplorerTree } from '@/features/notes/sidebar/SidebarExplorerTree'
import { SidebarHeader } from '@/features/notes/sidebar/SidebarHeader'
import { SidebarSearchResults } from '@/features/notes/sidebar/SidebarSearchResults'
import { SidebarSettingsBackBar } from '@/features/notes/sidebar/SidebarSettingsBackBar'
import { SidebarSettingsNav } from '@/features/notes/sidebar/SidebarSettingsNav'
import type { SidebarProps } from '@/features/notes/sidebar/sidebar-types'
import { cn } from '@/lib/utils'

export type { SidebarProps } from '@/features/notes/sidebar/sidebar-types'

export function Sidebar({ vm }: SidebarProps): JSX.Element {
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
    toggleSidebar,
    appSidebarView,
    triggerRenameSelectedRef,
    openFolderSettingsPanel,
    workspaceRoot,
    handleWorkspaceRootChange,
    notesSearchPlainTextByPath
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
    () =>
      searchNotes(allNotes, folders, searchQuery, {
        limit: 20,
        plainTextByPath: notesSearchPlainTextByPath
      }),
    [allNotes, folders, searchQuery, notesSearchPlainTextByPath]
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

  const findNoteById = useCallback(
    (notePath: string): SavedNote | undefined => {
      for (const list of notesByFolder.values()) {
        const note = list.find((item) => item.path === notePath)
        if (note) return note
      }
      return undefined
    },
    [notesByFolder]
  )

  const beginRename = (treeId: string, initial: string): void => {
    skipRenameCommitRef.current = false
    setRenamingNodeId(treeId)
    setRenameDraft(initial)
  }

  useEffect(() => {
    triggerRenameSelectedRef.current = () => {
      if (selectedNotePath) {
        const note = findNoteById(selectedNotePath)
        if (note) beginRename(treeNotePath(selectedNotePath), note.title)
      } else if (focusedFolderId) {
        const folder = folders.find((f) => f.folder === focusedFolderId)
        if (folder) beginRename(treeFolderPath(focusedFolderId), folder.name)
      }
    }
  }, [findNoteById, focusedFolderId, folders, selectedNotePath, triggerRenameSelectedRef])

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
      <SidebarHeader
        handleWorkspaceRootChange={handleWorkspaceRootChange}
        isMacNotelab={isMacNotelab}
        macTitlebarStyles={macTitlebarStyles}
        toggleSidebar={toggleSidebar}
        workspaceRoot={workspaceRoot}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-row">
        <AppSidebarRail vm={vm} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {appMode === 'notes' && appSidebarView === 'explorer' ? (
            <SidebarExplorerToolbar
              animationsEnabled={animationsEnabled}
              canvasViewOpen={canvasViewOpen}
              closeCanvasView={closeCanvasView}
              closeGraphView={closeGraphView}
              closeSearch={closeSearch}
              graphViewOpen={graphViewOpen}
              handleNewDrawing={handleNewDrawing}
              handleNewNote={handleNewNote}
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
              openCanvasView={openCanvasView}
              openGraphView={openGraphView}
              openSearch={openSearch}
              searchInputRef={searchInputRef}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              startFolderCreate={startFolderCreate}
              canCreateNote={canCreateNote}
            />
          ) : null}
          {appMode === 'settings' ? (
            <SidebarSettingsBackBar
              backToNotes={backToNotes}
              isMacNotelab={isMacNotelab}
              macTitlebarStyles={macTitlebarStyles}
            />
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
                  onClick={() => openJournalView()}
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
              <SidebarSettingsNav
                setSettingsSection={setSettingsSection}
                settingsSection={settingsSection}
              />
            ) : appSidebarView === 'source-control' ? (
              <GitSourceControlPanel vm={vm} />
            ) : searchOpen && searchQuery.length > 0 ? (
              <SidebarSearchResults
                backToNotes={backToNotes}
                closeSearch={closeSearch}
                folderSearchResults={folderSearchResults}
                handleTreeSelectionChange={handleTreeSelectionChange}
                openFolderSettingsPanel={openFolderSettingsPanel}
                searchResults={searchResults}
              />
            ) : (
              <SidebarExplorerTree
                beginRename={beginRename}
                defaultExpandedFolderIds={defaultExpandedFolderIds}
                dropTargetFolderId={dropTargetFolderId}
                folderCreateOpen={folderCreateOpen}
                folderDraft={folderDraft}
                folderDropAtEnd={folderDropAtEnd}
                folderInputRef={folderInputRef}
                focusedFolderId={focusedFolderId}
                folders={folders}
                handleDeleteNote={handleDeleteNote}
                handleTreeSelectionChange={handleTreeSelectionChange}
                inboxNotes={inboxNotes}
                isMacNotelab={isMacNotelab}
                macTitlebarStyles={macTitlebarStyles}
                notesByFolder={notesByFolder}
                onFolderDraftKeyDown={onFolderDraftKeyDown}
                onFolderNameBlur={onFolderNameBlur}
                onFolderNameChange={onFolderNameChange}
                onFolderSectionDragOverCapture={onFolderSectionDragOverCapture}
                onFolderSectionDropCapture={onFolderSectionDropCapture}
                onFolderStripDragLeave={() => setFolderDropAtEnd(false)}
                onFolderStripDragOver={onFolderStripDragOver}
                onFolderStripDrop={onFolderStripDrop}
                openFolderSettings={openFolderSettings}
                renamingNodeId={renamingNodeId}
                selectedNotePath={selectedNotePath}
                treeExpandIds={treeExpandIds}
                treeExpandNonce={treeExpandNonce}
                treeRename={treeRename}
                treeSelectedIds={treeSelectedIds}
              />
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

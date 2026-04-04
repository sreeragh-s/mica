import { useEffect, useRef, useState, type DragEvent, type JSX } from 'react'

import {
  ArrowLeft,
  Bug,
  FileText,
  Keyboard,
  Palette,
  Network,
  Folder,
  FolderGit2,
  FolderPlus,
  PanelLeftClose,
  PenLine,
  Pencil,
  Settings,
  Settings2,
  SquarePen,
  Trash2,
  User
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
import { formatNoteTime } from '@/lib/notes-storage'
import {
  FOLDER_DRAG_MIME,
  NOTE_DRAG_MIME,
  treeFolderId,
  treeNoteId
} from './notes-app-utils'
import type { NotesAppViewModel } from './useNotesApp'

export type NotesSidebarProps = {
  vm: NotesAppViewModel
}

export function NotesSidebar({ vm }: NotesSidebarProps): JSX.Element {
  const {
    macElectron,
    macTitlebarStyles,
    appMode,
    settingsSection,
    setSettingsSection,
    folders,
    notesByFolder,
    canCreateNote,
    folderCreateOpen,
    folderDraft,
    folderInputRef,
    onFolderNameChange,
    onFolderNameBlur,
    selectedId,
    focusedFolderId,
    treeExpandNonce,
    treeExpandIds,
    treeSelectedIds,
    defaultExpandedFolderIds,
    handleTreeSelectionChange,
    handleNewNote,
    handleDeleteNote,
    renameNote,
    moveNoteToFolder,
    reorderWorkspaceFolders,
    reorderWorkspaceFolderToEnd,
    openWorkspaceSettings,
    onFolderDraftKeyDown,
    backToNotes,
    openSettings,
    startFolderCreate,
    handleNewDrawing,
    graphViewOpen,
    openGraphView,
    closeGraphView,
    toggleSidebar
  } = vm

  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const [folderDropAtEnd, setFolderDropAtEnd] = useState(false)

  useEffect(() => {
    const clearDrop = (): void => {
      setDropTargetFolderId(null)
      setFolderDropAtEnd(false)
    }
    window.addEventListener('dragend', clearDrop)
    return () => window.removeEventListener('dragend', clearDrop)
  }, [])

  const sidebarAcceptsDrop = (e: DragEvent): boolean => {
    const types = [...e.dataTransfer.types]
    return types.includes(NOTE_DRAG_MIME) || types.includes(FOLDER_DRAG_MIME)
  }

  const onFolderRowDragOver = (e: DragEvent, folderId: string): void => {
    if (!sidebarAcceptsDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetFolderId(folderId)
    setFolderDropAtEnd(false)
  }

  const onFolderRowDrop = (e: DragEvent, folderId: string): void => {
    if (!sidebarAcceptsDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
    setDropTargetFolderId(null)
    setFolderDropAtEnd(false)

    const noteId = e.dataTransfer.getData(NOTE_DRAG_MIME)
    if (noteId) {
      moveNoteToFolder(noteId, folderId)
      return
    }
    const draggedFolderId = e.dataTransfer.getData(FOLDER_DRAG_MIME)
    if (draggedFolderId && draggedFolderId !== folderId) {
      reorderWorkspaceFolders(draggedFolderId, folderId)
    }
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
    if (draggedFolderId) reorderWorkspaceFolderToEnd(draggedFolderId)
  }

  useEffect(() => {
    if (renamingNoteId) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renamingNoteId])

  const commitNoteRename = (noteId: string, previousTitle: string): void => {
    const t = renameDraft.trim()
    if (t && t !== previousTitle) renameNote(noteId, t)
    setRenamingNoteId(null)
  }

  const liquidChrome = macElectron

  return (
    <aside
      className={cn(
        'text-sidebar-foreground flex h-full min-h-0 w-full shrink-0 flex-col',
        liquidChrome
          ? 'liquid-sidebar-inset relative z-10 rounded-2xl'
          : 'bg-sidebar border-sidebar-border w-[min(100%,320px)] border-r'
      )}
      aria-label={appMode === 'notes' ? 'Notes' : 'Settings'}
    >
      <div
        className={cn(
          'flex h-12 shrink-0 items-center gap-1 px-2 pr-1',
          macElectron && 'pl-[92px]'
        )}
        style={macElectron ? macTitlebarStyles.drag : undefined}
      >
        {appMode === 'settings' ? (
          <div className="min-w-0 flex-1">
            <h1 className="text-sidebar-foreground truncate ml-2 text-sm font-semibold leading-none tracking-tight">
              Settings
            </h1>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="text-sidebar-foreground truncate ml-2 text-sm font-semibold leading-none tracking-tight">
              Notes
            </h1>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-9 shrink-0"
          aria-label="Collapse sidebar"
          aria-expanded={true}
          onClick={toggleSidebar}
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
        >
          <PanelLeftClose className="size-4" aria-hidden />
        </Button>
      </div>
      {appMode === 'notes' ? (
        <div
          className={cn(
            'flex w-full shrink-0 flex-row flex-nowrap items-center justify-start gap-0.5 px-2 py-1.5',
            macElectron 
          )}
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground size-8 shrink-0 p-0"
            aria-label="New workspace folder"
            onClick={startFolderCreate}
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
          >
            <PenLine className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={graphViewOpen ? 'secondary' : 'ghost'}
            className={cn(
              'size-8 shrink-0 p-0',
              graphViewOpen
                ? 'text-foreground'
                : 'text-muted-foreground'
            )}
            title="Note link graph"
            aria-label="Note link graph"
            aria-pressed={graphViewOpen}
            disabled={!canCreateNote}
            onClick={() => (graphViewOpen ? closeGraphView() : openGraphView())}
          >
            <Network className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground size-8 shrink-0 p-0"
            aria-label="Settings"
            onClick={openSettings}
          >
            <Settings className="size-4" aria-hidden />
          </Button>
        </div>
      ) : appMode === 'settings' ? (
        <div
          className="w-full shrink-0 px-2 py-1.5"
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-8 w-full min-w-0  gap-1.5 px-2.5 items-center justify-start "
            onClick={backToNotes}
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
            <span className="text-muted-foreground text-left text-sm font-medium">
              Back to notes
            </span>
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {appMode === 'settings' ? (
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                onClick={() => setSettingsSection('account')}
                className={cn(
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors',
                  settingsSection === 'account' &&
                    'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <User className="text-muted-foreground size-4 shrink-0" aria-hidden />
                Account
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setSettingsSection('github')}
                className={cn(
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors',
                  settingsSection === 'github' &&
                    'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <FolderGit2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
                GitHub & Git
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setSettingsSection('appearance')}
                className={cn(
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors',
                  settingsSection === 'appearance' &&
                    'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <Palette className="text-muted-foreground size-4 shrink-0" aria-hidden />
                Appearance
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setSettingsSection('shortcuts')}
                className={cn(
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors',
                  settingsSection === 'shortcuts' &&
                    'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <Keyboard className="text-muted-foreground size-4 shrink-0" aria-hidden />
                Shortcuts
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setSettingsSection('debug')}
                className={cn(
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors',
                  settingsSection === 'debug' &&
                    'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <Bug className="text-muted-foreground size-4 shrink-0" aria-hidden />
                Debug
              </button>
            </li>
          </ul>
        ) : !canCreateNote ? (
          <div className="text-muted-foreground flex flex-col items-center gap-3 px-4 py-10 text-center text-sm">
            <FileText className="size-10 opacity-40" aria-hidden />
            <p>No workspace yet. Add a folder to get started.</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={startFolderCreate}
            >
              <FolderPlus className="size-4" aria-hidden />
              New workspace folder
            </Button>
          </div>
        ) : null}

        {appMode === 'notes' && canCreateNote ? (
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
          >
            <TreeView className="p-0">
              {folders.map((folder, fi) => {
                const notesInFolder = notesByFolder.get(folder.id) ?? []
                const isLastFolder = fi === folders.length - 1 && !folderCreateOpen
                return (
                  <TreeNode key={folder.id} nodeId={treeFolderId(folder.id)} isLast={isLastFolder}>
                    <TreeNodeTrigger
                      draggable
                      onDragStart={(e) => {
                        const ev = e as unknown as globalThis.DragEvent
                        if (!ev.dataTransfer) return
                        ev.dataTransfer.setData(FOLDER_DRAG_MIME, folder.id)
                        ev.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(e) => onFolderRowDragOver(e as unknown as DragEvent, folder.id)}
                      onDrop={(e) => onFolderRowDrop(e as unknown as DragEvent, folder.id)}
                      className={cn(
                        'hover:bg-sidebar-accent/50',
                        dropTargetFolderId === folder.id &&
                          'bg-sidebar-accent/30 ring-primary/40 ring-1 ring-inset',
                        !selectedId &&
                          focusedFolderId === folder.id &&
                          '!bg-sidebar-accent !text-sidebar-accent-foreground'
                      )}
                    >
                      <TreeExpander hasChildren />
                      <TreeIcon hasChildren />
                      <TreeLabel>{folder.name}</TreeLabel>
                      <span
                        role="presentation"
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        style={macElectron ? macTitlebarStyles.noDrag : undefined}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground size-7"
                          aria-label={`Workspace settings for ${folder.name}`}
                          onClick={(e) => openWorkspaceSettings(folder.id, e)}
                        >
                          <Settings2 className="size-3.5" aria-hidden />
                        </Button>
                      </span>
                    </TreeNodeTrigger>
                    <TreeNodeContent hasChildren>
                      {notesInFolder.map((note, ni) => {
                        const isLastNote = ni === notesInFolder.length - 1
                        const isRenaming = renamingNoteId === note.id
                        return (
                          <TreeNode
                            key={note.id}
                            nodeId={treeNoteId(note.id)}
                            level={1}
                            isLast={isLastNote}
                          >
                            <TreeNodeTrigger
                              draggable={!isRenaming}
                              onDragStart={(e) => {
                                const drag = e as unknown as globalThis.DragEvent
                                if (!drag.dataTransfer) return
                                drag.dataTransfer.setData(NOTE_DRAG_MIME, note.id)
                                drag.dataTransfer.effectAllowed = 'copyMove'
                              }}
                              className={cn(
                                'hover:bg-sidebar-accent/50',
                                selectedId === note.id &&
                                  '!bg-sidebar-accent !text-sidebar-accent-foreground'
                              )}
                            >
                              <TreeExpander hasChildren={false} />
                              <TreeIcon
                                hasChildren={false}
                                icon={
                                  note.kind === 'drawing' ? (
                                    <PenLine className="text-muted-foreground h-4 w-4" />
                                  ) : (
                                    <FileText className="text-muted-foreground h-4 w-4" />
                                  )
                                }
                              />
                              <TreeLabel className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                                {isRenaming ? (
                                  <Input
                                    ref={renameInputRef}
                                    className="h-7 w-full min-w-0 text-sm"
                                    value={renameDraft}
                                    onChange={(e) => setRenameDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        commitNoteRename(note.id, note.title)
                                      }
                                      if (e.key === 'Escape') {
                                        e.preventDefault()
                                        setRenamingNoteId(null)
                                      }
                                    }}
                                    onBlur={() => commitNoteRename(note.id, note.title)}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Rename note"
                                  />
                                ) : (
                                  <>
                                    <span className="line-clamp-2 font-medium leading-snug">
                                      {note.title}
                                    </span>
                                    <span className="text-muted-foreground text-xs font-normal">
                                      {formatNoteTime(note.updatedAt)}
                                    </span>
                                  </>
                                )}
                              </TreeLabel>
                              <span
                                role="presentation"
                                className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                                style={macElectron ? macTitlebarStyles.noDrag : undefined}
                              >
                                {!isRenaming ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="text-muted-foreground size-7"
                                    aria-label={`Rename ${note.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRenamingNoteId(note.id)
                                      setRenameDraft(note.title)
                                    }}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground hover:text-destructive size-7"
                                  aria-label="Delete note"
                                  disabled={isRenaming}
                                  onClick={(e) => handleDeleteNote(note.id, e)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </span>
                            </TreeNodeTrigger>
                          </TreeNode>
                        )
                      })}
                    </TreeNodeContent>
                  </TreeNode>
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
                    liquidChrome
                      ? 'border-sidebar-border/45 dark:border-white/15'
                      : 'border-sidebar-border'
                  )}
                  style={macElectron ? macTitlebarStyles.noDrag : undefined}
                >
                  <div className="mr-1 h-4 w-4 shrink-0" aria-hidden />
                  <Folder className="text-muted-foreground mr-2 h-4 w-4 shrink-0" aria-hidden />
                  <Input
                    ref={folderInputRef}
                    className="h-8 flex-1"
                    placeholder="Workspace name"
                    value={folderDraft}
                    onChange={(e) => onFolderNameChange(e.target.value)}
                    onKeyDown={onFolderDraftKeyDown}
                    onBlur={onFolderNameBlur}
                    aria-label="New workspace name"
                  />
                </div>
              ) : null}
            </TreeView>
          </TreeProvider>
        ) : null}
      </div>
    </aside>
  )
}

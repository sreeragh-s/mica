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
  Sparkles,
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
import { liquidGlassControlPillClass } from '@/lib/liquid-glass-toolbar'
import { DEFAULT_WORKSPACE_ID, formatNoteTime } from '@/lib/notes-storage'
import { FOLDER_DRAG_MIME, NOTE_DRAG_MIME, treeFolderId, treeNoteId } from './notes-app-utils'
import { MacSidebarLeadingToolbarIcon } from './MacSidebarToolbarIcon'
import type { NotesAppViewModel } from './useNotesApp'

export type NotesSidebarProps = {
  vm: NotesAppViewModel
}

export function NotesSidebar({ vm }: NotesSidebarProps): JSX.Element {
  const {
    macElectron,
    nativeLiquidGlassAttached,
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

  const sidebarAcceptsDrop = (e: globalThis.DragEvent): boolean => {
    if (!e.dataTransfer) return false
    const types = [...e.dataTransfer.types]
    return types.includes(NOTE_DRAG_MIME) || types.includes(FOLDER_DRAG_MIME)
  }

  const onFolderRowDrop = (e: globalThis.DragEvent, folderId: string): void => {
    if (!sidebarAcceptsDrop(e)) return
    if (!e.dataTransfer) return
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
    if (draggedFolderId && draggedFolderId !== folderId && folderId !== DEFAULT_WORKSPACE_ID) {
      reorderWorkspaceFolders(draggedFolderId, folderId)
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
  const nativeGlassUi = macElectron && nativeLiquidGlassAttached
  const inboxNotes = notesByFolder.get(DEFAULT_WORKSPACE_ID) ?? []

  return (
    <aside
      data-native-liquid-glass={liquidChrome && nativeLiquidGlassAttached ? true : undefined}
      className={cn(
        'text-sidebar-foreground flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col',
        macElectron && 'pointer-events-none',
        liquidChrome
          ? 'liquid-sidebar-inset relative z-10 rounded-2xl'
          : 'bg-sidebar border-sidebar-border border-r'
      )}
      onPointerDownCapture={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('[data-sidebar-interactive]')) return
        clearSidebarWorkspaceIntent()
      }}
    >
      {/* macOS: unified drag band is in NotesApp; rows are pointer-events-none except controls. */}
      <div
        className={cn(
          'relative z-10 flex h-12 w-full shrink-0 items-center justify-end gap-1',
          macElectron ? 'pointer-events-none pr-2' : 'px-2'
        )}
      >
        <div
          className={cn('pointer-events-auto', liquidGlassControlPillClass(nativeGlassUi))}
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
          data-sidebar-interactive=""
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 shrink-0 rounded-full"
            aria-label="Collapse sidebar"
            aria-expanded={true}
            onClick={toggleSidebar}
            style={macElectron ? macTitlebarStyles.noDrag : undefined}
          >
            {liquidChrome ? (
              <MacSidebarLeadingToolbarIcon
                className="size-[15px]"
                nativeLiquidGlassActive={nativeGlassUi}
              />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>
      {appMode === 'notes' ? (
        <div
          className={cn(
            'relative z-10 flex w-full shrink-0 flex-row flex-nowrap items-stretch justify-start gap-0.5 py-1.5',
            macElectron
              ? 'pointer-events-none pl-[92px] pr-2'
              : 'px-2'
          )}
        >
          <div
            className="pointer-events-auto flex min-w-0 flex-none flex-nowrap items-center gap-0.5"
            style={macElectron ? macTitlebarStyles.noDrag : undefined}
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground size-8 shrink-0 p-0"
              aria-label="New workspace folder"
              onClick={startFolderCreate}
              data-sidebar-interactive=""
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
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
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
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
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
            >
              <PenLine className="size-4" aria-hidden />
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
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
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
              data-sidebar-interactive=""
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
            >
              <Settings className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : appMode === 'settings' ? (
        <div
          className={cn(
            'relative z-10 flex w-full shrink-0 items-stretch py-1.5',
            macElectron ? 'pointer-events-none pl-[92px] pr-2' : 'px-2'
          )}
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'text-muted-foreground h-8 w-full min-w-0 gap-1.5 px-2.5 items-center justify-start',
              macElectron && 'pointer-events-auto'
            )}
            onClick={backToNotes}
            data-sidebar-interactive=""
            style={macElectron ? macTitlebarStyles.noDrag : undefined}
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
          'min-h-0 flex-1 overflow-y-auto p-2',
          macElectron && 'pointer-events-auto'
        )}
      >
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
                onClick={() => setSettingsSection('github')}
                className={cn(
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-tight transition-colors',
                  settingsSection === 'github' && 'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <FolderGit2 className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                GitHub & Git
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
                  settingsSection === 'indexing' && 'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <Sparkles className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                Indexing
              </button>
            </li>
          </ul>
        ) : null}

        {appMode === 'notes' ? (
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
                    const isRenaming = renamingNoteId === note.id
                    return (
                      <TreeNode key={note.id} nodeId={treeNoteId(note.id)} isLast={isLastRootNote}>
                        <TreeNodeTrigger
                          draggable={!isRenaming}
                          data-sidebar-interactive=""
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
                                <PenLine className="text-muted-foreground h-3.5 w-3.5" />
                              ) : (
                                <FileText className="text-muted-foreground h-3.5 w-3.5" />
                              )
                            }
                          />
                          {isRenaming ? (
                            <TreeLabel className="min-w-0 flex-1">
                              <Input
                                ref={renameInputRef}
                                className="h-6 w-full min-w-0 text-sm"
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
                            </TreeLabel>
                          ) : (
                            <>
                              <TreeLabel className="flex min-w-0 flex-1 items-center">
                                <span className="line-clamp-2 text-left font-medium leading-snug">
                                  {note.title}
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
                                  style={macElectron ? macTitlebarStyles.noDrag : undefined}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="text-muted-foreground size-6"
                                    aria-label={`Rename ${note.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRenamingNoteId(note.id)
                                      setRenameDraft(note.title)
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
                                    onClick={(e) => handleDeleteNote(note.id, e)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </span>
                              </div>
                            </>
                          )}
                        </TreeNodeTrigger>
                      </TreeNode>
                    )
                  })}
                </div>
              ) : null}
              {folders.map((folder, fi) => {
                const notesInFolder = notesByFolder.get(folder.id) ?? []
                const isLastFolder = fi === folders.length - 1 && !folderCreateOpen
                return (
                  <div
                    key={folder.id}
                    className={cn(
                      'mx-1 overflow-hidden rounded-md transition-colors',
                      dropTargetFolderId === folder.id &&
                        'bg-sidebar-accent/20 ring-primary/40 ring-1 ring-inset'
                    )}
                    onDragOverCapture={onFolderSectionDragOverCapture(folder.id)}
                    onDropCapture={onFolderSectionDropCapture(folder.id)}
                  >
                    <TreeNode nodeId={treeFolderId(folder.id)} isLast={isLastFolder}>
                      <TreeNodeTrigger
                        data-sidebar-interactive=""
                        draggable
                        onDragStart={(e) => {
                          const ev = e as unknown as globalThis.DragEvent
                          if (!ev.dataTransfer) return
                          ev.dataTransfer.setData(FOLDER_DRAG_MIME, folder.id)
                          ev.dataTransfer.effectAllowed = 'move'
                        }}
                        className={cn(
                          'hover:bg-sidebar-accent/50',
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
                            className="text-muted-foreground size-6"
                            aria-label={`Workspace settings for ${folder.name}`}
                            onClick={(e) => openWorkspaceSettings(folder.id, e)}
                            data-sidebar-interactive=""
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
                                data-sidebar-interactive=""
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
                                      <PenLine className="text-muted-foreground h-3.5 w-3.5" />
                                    ) : (
                                      <FileText className="text-muted-foreground h-3.5 w-3.5" />
                                    )
                                  }
                                />
                                {isRenaming ? (
                                  <TreeLabel className="min-w-0 flex-1">
                                    <Input
                                      ref={renameInputRef}
                                      className="h-6 w-full min-w-0 text-sm"
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
                                  </TreeLabel>
                                ) : (
                                  <>
                                    <TreeLabel className="flex min-w-0 flex-1 items-center">
                                      <span className="line-clamp-2 text-left font-medium leading-snug">
                                        {note.title}
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
                                        style={macElectron ? macTitlebarStyles.noDrag : undefined}
                                      >
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-xs"
                                          className="text-muted-foreground size-6"
                                          aria-label={`Rename ${note.title}`}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setRenamingNoteId(note.id)
                                            setRenameDraft(note.title)
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
                                          onClick={(e) => handleDeleteNote(note.id, e)}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </span>
                                    </div>
                                  </>
                                )}
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
                    liquidChrome
                      ? 'border-sidebar-border/45 dark:border-white/15'
                      : 'border-sidebar-border'
                  )}
                  style={macElectron ? macTitlebarStyles.noDrag : undefined}
                  data-sidebar-interactive=""
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

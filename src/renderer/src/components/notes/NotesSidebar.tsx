import { useEffect, useRef, useState, type JSX } from 'react'

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
import { NOTE_DRAG_MIME, treeFolderId, treeNoteId } from './notes-app-utils'
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
    openWorkspaceSettings,
    onFolderDraftKeyDown,
    backToNotes,
    openSettings,
    startFolderCreate,
    handleNewDrawing,
    graphViewOpen,
    openGraphView,
    closeGraphView
  } = vm

  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

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

  return (
    <aside
      className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full min-h-0 w-[min(100%,320px)] shrink-0 flex-col "
      aria-label={appMode === 'notes' ? 'Notes' : 'Settings'}
    >
      <div
        className={cn(
          'border-sidebar-border flex h-12 shrink-0 items-center gap-2 border-b px-3',
          macElectron && 'pl-[76px]'
        )}
        style={macElectron ? macTitlebarStyles.drag : undefined}
      >
        {appMode === 'settings' ? (
          <>
            <div
              className="flex shrink-0 items-center"
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground size-8 shrink-0 p-0"
                aria-label="Back to notes"
                onClick={backToNotes}
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sidebar-foreground truncate text-sm font-semibold leading-none tracking-tight">
                Settings
              </h1>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="text-sidebar-foreground truncate ml-2 text-sm font-semibold leading-none tracking-tight">
              Notes
            </h1>
          </div>
        )}
      </div>
      {appMode === 'notes' ? (
        <div
          className={cn(
            'border-sidebar-border flex shrink-0 items-center justify-end gap-0.5 border-b px-2 py-1.5',
            macElectron && 'pl-[76px]'
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
                              draggable
                              onDragStart={(e) => {
                                const drag = e as unknown as globalThis.DragEvent
                                if (!drag.dataTransfer) return
                                drag.dataTransfer.setData(NOTE_DRAG_MIME, note.id)
                                drag.dataTransfer.effectAllowed = 'copy'
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

              {folderCreateOpen ? (
                <div
                  className="border-sidebar-border mx-1 mt-1 flex items-center gap-2 rounded-md border border-dashed px-3 py-2"
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

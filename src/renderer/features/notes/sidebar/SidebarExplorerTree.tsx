import { Folder as FolderIcon, Pencil, Settings2, Trash2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type RefObject
} from 'react'

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
  TreeView,
  type TreeRenameConfig
} from '@/components/ui/tree'
import { cn } from '@/lib/utils'
import {
  DEFAULT_WORKSPACE_ID,
  formatNoteTime,
  type Folder,
  type SavedNote
} from '@/lib/notes/notes-storage'
import { NoteLeadingIcon } from '@/features/notes/sidebar/NoteLeadingIcon'
import {
  FOLDER_DRAG_MIME,
  NOTE_DRAG_MIME,
  treeFolderPath,
  treeNotePath
} from '@/features/notes/notes-app-utils'
import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'

export type SidebarExplorerTreeProps = {
  defaultExpandedFolderIds: string[]
  treeExpandNonce: NotesAppViewModel['treeExpandNonce']
  treeExpandIds: NotesAppViewModel['treeExpandIds']
  treeSelectedIds: NotesAppViewModel['treeSelectedIds']
  handleTreeSelectionChange: NotesAppViewModel['handleTreeSelectionChange']
  treeRename: TreeRenameConfig
  inboxNotes: SavedNote[]
  folders: Folder[]
  notesByFolder: NotesAppViewModel['notesByFolder']
  dropTargetFolderId: string | null
  folderDropAtEnd: boolean
  onFolderSectionDragOverCapture: (targetFolderId: string) => (e: DragEvent<HTMLDivElement>) => void
  onFolderSectionDropCapture: (targetFolderId: string) => (e: DragEvent<HTMLDivElement>) => void
  onFolderStripDragOver: (e: DragEvent) => void
  onFolderStripDragLeave: () => void
  onFolderStripDrop: (e: DragEvent) => void
  selectedNotePath: string | null
  focusedFolderId: string | null
  renamingNodeId: string | null
  scrollContainerRef: RefObject<HTMLDivElement | null>
  beginRename: (treeId: string, initial: string) => void
  handleDeleteNote: NotesAppViewModel['handleDeleteNote']
  openFolderSettings: NotesAppViewModel['openFolderSettings']
  isMacNotelab: boolean
  macTitlebarStyles: NotesAppViewModel['macTitlebarStyles']
  folderCreateOpen: boolean
  folderInputRef: RefObject<HTMLInputElement | null>
  folderDraft: string
  onFolderNameChange: NotesAppViewModel['onFolderNameChange']
  onFolderDraftKeyDown: NotesAppViewModel['onFolderDraftKeyDown']
  onFolderNameBlur: NotesAppViewModel['onFolderNameBlur']
}

export function SidebarExplorerTree({
  defaultExpandedFolderIds,
  treeExpandNonce,
  treeExpandIds,
  treeSelectedIds,
  handleTreeSelectionChange,
  treeRename,
  inboxNotes,
  folders,
  notesByFolder,
  dropTargetFolderId,
  folderDropAtEnd,
  onFolderSectionDragOverCapture,
  onFolderSectionDropCapture,
  onFolderStripDragOver,
  onFolderStripDragLeave,
  onFolderStripDrop,
  selectedNotePath,
  focusedFolderId,
  renamingNodeId,
  scrollContainerRef,
  beginRename,
  handleDeleteNote,
  openFolderSettings,
  isMacNotelab,
  macTitlebarStyles,
  folderCreateOpen,
  folderInputRef,
  folderDraft,
  onFolderNameChange,
  onFolderDraftKeyDown,
  onFolderNameBlur
}: SidebarExplorerTreeProps): JSX.Element {
  const selectedNoteRowRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  const ROOT_ROW_HEIGHT = 36
  const ROOT_OVERSCAN = 10
  const shouldVirtualizeRootNotes = folders.length === 0 && inboxNotes.length > 200

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const syncMetrics = (): void => {
      setScrollTop(container.scrollTop)
      setViewportHeight(container.clientHeight)
    }

    syncMetrics()
    container.addEventListener('scroll', syncMetrics, { passive: true })
    window.addEventListener('resize', syncMetrics)
    return () => {
      container.removeEventListener('scroll', syncMetrics)
      window.removeEventListener('resize', syncMetrics)
    }
  }, [scrollContainerRef])

  const virtualRootRange = useMemo(() => {
    if (!shouldVirtualizeRootNotes) {
      return { start: 0, end: inboxNotes.length, topSpacer: 0, bottomSpacer: 0 }
    }
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / ROOT_ROW_HEIGHT))
    const start = Math.max(0, Math.floor(scrollTop / ROOT_ROW_HEIGHT) - ROOT_OVERSCAN)
    const end = Math.min(inboxNotes.length, start + visibleCount + ROOT_OVERSCAN * 2)
    return {
      start,
      end,
      topSpacer: start * ROOT_ROW_HEIGHT,
      bottomSpacer: Math.max(0, (inboxNotes.length - end) * ROOT_ROW_HEIGHT)
    }
  }, [inboxNotes.length, scrollTop, shouldVirtualizeRootNotes, viewportHeight])

  const visibleInboxNotes = shouldVirtualizeRootNotes
    ? inboxNotes.slice(virtualRootRange.start, virtualRootRange.end)
    : inboxNotes

  const bindSelectedNoteRowRef = useCallback(
    (el: HTMLDivElement | null, notePath: string) => {
      if (notePath === selectedNotePath) {
        selectedNoteRowRef.current = el
      } else if (selectedNoteRowRef.current === el) {
        selectedNoteRowRef.current = null
      }
    },
    [selectedNotePath]
  )

  useEffect(() => {
    if (!selectedNotePath) return
    if (shouldVirtualizeRootNotes && folders.length === 0) {
      const container = scrollContainerRef.current
      const selectedIndex = inboxNotes.findIndex((note) => note.path === selectedNotePath)
      if (container && selectedIndex >= 0) {
        const rowTop = selectedIndex * ROOT_ROW_HEIGHT
        const rowBottom = rowTop + ROOT_ROW_HEIGHT
        const viewTop = container.scrollTop
        const viewBottom = viewTop + container.clientHeight
        if (rowTop < viewTop) {
          container.scrollTop = rowTop
        } else if (rowBottom > viewBottom) {
          container.scrollTop = Math.max(0, rowBottom - container.clientHeight)
        }
      }
    }
    let cancelled = false
    let rafId = 0
    let attempts = 0
    /** Folder rows mount only after TreeProvider applies `expandNodeIds` in an effect; one scroll pass often runs too early. */
    const maxAttempts = 72

    const step = (): void => {
      if (cancelled) return
      const el = selectedNoteRowRef.current
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        return
      }
      attempts += 1
      if (attempts < maxAttempts) {
        rafId = requestAnimationFrame(step)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [
    ROOT_ROW_HEIGHT,
    folders.length,
    inboxNotes,
    scrollContainerRef,
    selectedNotePath,
    shouldVirtualizeRootNotes,
    treeExpandNonce
  ])

  return (
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
            {shouldVirtualizeRootNotes ? (
              <div>
                {virtualRootRange.topSpacer > 0 ? (
                  <div style={{ height: virtualRootRange.topSpacer }} aria-hidden />
                ) : null}
                {visibleInboxNotes.map((note, visibleIndex) => {
                  const noteIndex = virtualRootRange.start + visibleIndex
                  const isLastRootNote =
                    noteIndex === inboxNotes.length - 1 && folders.length === 0 && !folderCreateOpen
                  const noteTreeId = treeNotePath(note.path)
                  const isRenaming = renamingNodeId === noteTreeId
                  return (
                    <TreeNode key={note.path} nodeId={noteTreeId} isLast={isLastRootNote}>
                      <div
                        ref={(el) => bindSelectedNoteRowRef(el, note.path)}
                        className="min-w-0 w-full"
                        style={{ height: ROOT_ROW_HEIGHT }}
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
                            'hover:bg-sidebar-accent/50 h-full',
                            selectedNotePath === note.path &&
                              !focusedFolderId &&
                              '!bg-sidebar-accent !text-foreground'
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
                            <span className="truncate text-left font-medium leading-snug">
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
                      </div>
                    </TreeNode>
                  )
                })}
                {virtualRootRange.bottomSpacer > 0 ? (
                  <div style={{ height: virtualRootRange.bottomSpacer }} aria-hidden />
                ) : null}
              </div>
            ) : (
              inboxNotes.map((note, ni) => {
                const isLastRootNote =
                  ni === inboxNotes.length - 1 && folders.length === 0 && !folderCreateOpen
              const noteTreeId = treeNotePath(note.path)
              const isRenaming = renamingNodeId === noteTreeId
              return (
                <TreeNode key={note.path} nodeId={noteTreeId} isLast={isLastRootNote}>
                  <div
                    ref={(el) => bindSelectedNoteRowRef(el, note.path)}
                    className="min-w-0 w-full"
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
                          '!bg-sidebar-accent !text-foreground'
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
                  </div>
                </TreeNode>
              )
              })
            )}
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
                      '!bg-sidebar-accent !text-foreground'
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
                      <TreeNode key={note.path} nodeId={noteTreeId} level={1} isLast={isLastNote}>
                        <div
                          ref={(el) => bindSelectedNoteRowRef(el, note.path)}
                          className="min-w-0 w-full"
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
                                '!bg-sidebar-accent !text-foreground'
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
                        </div>
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
            onDragLeave={onFolderStripDragLeave}
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
            <FolderIcon className="text-muted-foreground mr-2 h-4 w-4 shrink-0" aria-hidden />
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
  )
}

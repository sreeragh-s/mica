import type { CSSProperties, JSX, ReactNode } from 'react'

import { ChevronDown, PanelLeftOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { NotesAppViewModel } from './useNotesApp'

type NotesLocationBarProps = {
  vm: NotesAppViewModel
}

function CrumbButton({
  children,
  onClick,
  interactiveStyle,
}: {
  children: ReactNode
  onClick: () => void
  /** Electron: no-drag so the rest of the top bar remains a window drag region. */
  interactiveStyle?: CSSProperties
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={interactiveStyle}
      className="max-w-[14rem] truncate text-left"
    >
      {children}
    </button>
  )
}

export function NotesLocationBar({ vm }: NotesLocationBarProps): JSX.Element | null {
  const {
    macElectron,
    macTitlebarStyles,
    appMode,
    settingsSection,
    setSettingsSection,
    folders,
    notesByFolder,
    workspaceSettingsFolder,
    workspaceSettingsFolderId,
    selectedNote,
    focusedFolderId,
    focusFolderInTree,
    backToNotes,
    openWorkspaceSettingsForFolder,
    selectNote,
    notesCount: totalNotesCount,
    sidebarCollapsed,
    toggleSidebar,
  } = vm

  const folderForNote =
    selectedNote != null ? folders.find((f) => f.id === selectedNote.folderId) : null

  const noteTitle = selectedNote?.title.trim() || 'Untitled'
  const showNoteSwitcher =
    appMode === 'notes' &&
    selectedNote &&
    folderForNote &&
    (folders.length > 1 || totalNotesCount > 1)

  const crumbInteractive = macElectron ? macTitlebarStyles.noDrag : undefined

  const crumbs: JSX.Element[] = []

  if (appMode === 'notes' && workspaceSettingsFolderId && workspaceSettingsFolder) {
    crumbs.push(
      <BreadcrumbItem key="ws">
        <BreadcrumbLink asChild>
          <CrumbButton
            interactiveStyle={crumbInteractive}
            onClick={() => focusFolderInTree(workspaceSettingsFolder.id)}
          >
            {workspaceSettingsFolder.name}
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep1" />,
      <BreadcrumbItem key="here">
        <BreadcrumbPage>Workspace settings</BreadcrumbPage>
      </BreadcrumbItem>
    )
  } else if (appMode === 'settings' && settingsSection === 'account') {
    crumbs.push(
      <BreadcrumbItem key="notes">
        <BreadcrumbLink asChild>
          <CrumbButton interactiveStyle={crumbInteractive} onClick={backToNotes}>
            Notes
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep1" />,
      <BreadcrumbItem key="account">
        <BreadcrumbPage>Account</BreadcrumbPage>
      </BreadcrumbItem>
    )
  } else if (appMode === 'settings' && settingsSection === 'github') {
    crumbs.push(
      <BreadcrumbItem key="notes">
        <BreadcrumbLink asChild>
          <CrumbButton interactiveStyle={crumbInteractive} onClick={backToNotes}>
            Notes
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep1" />,
      <BreadcrumbItem key="settings">
        <BreadcrumbLink asChild>
          <CrumbButton
            interactiveStyle={crumbInteractive}
            onClick={() => setSettingsSection('account')}
          >
            Settings
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep2" />,
      <BreadcrumbItem key="gh">
        <BreadcrumbPage>GitHub & Git</BreadcrumbPage>
      </BreadcrumbItem>
    )
  } else if (appMode === 'settings' && settingsSection === 'appearance') {
    crumbs.push(
      <BreadcrumbItem key="notes">
        <BreadcrumbLink asChild>
          <CrumbButton interactiveStyle={crumbInteractive} onClick={backToNotes}>
            Notes
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep1" />,
      <BreadcrumbItem key="settings">
        <BreadcrumbLink asChild>
          <CrumbButton
            interactiveStyle={crumbInteractive}
            onClick={() => setSettingsSection('account')}
          >
            Settings
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep2" />,
      <BreadcrumbItem key="appearance">
        <BreadcrumbPage>Appearance</BreadcrumbPage>
      </BreadcrumbItem>
    )
  } else if (appMode === 'settings' && settingsSection === 'shortcuts') {
    crumbs.push(
      <BreadcrumbItem key="notes">
        <BreadcrumbLink asChild>
          <CrumbButton interactiveStyle={crumbInteractive} onClick={backToNotes}>
            Notes
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep1" />,
      <BreadcrumbItem key="settings">
        <BreadcrumbLink asChild>
          <CrumbButton
            interactiveStyle={crumbInteractive}
            onClick={() => setSettingsSection('account')}
          >
            Settings
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep2" />,
      <BreadcrumbItem key="shortcuts">
        <BreadcrumbPage>Shortcuts</BreadcrumbPage>
      </BreadcrumbItem>
    )
  } else if (appMode === 'settings' && settingsSection === 'debug') {
    crumbs.push(
      <BreadcrumbItem key="notes">
        <BreadcrumbLink asChild>
          <CrumbButton interactiveStyle={crumbInteractive} onClick={backToNotes}>
            Notes
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep1" />,
      <BreadcrumbItem key="settings">
        <BreadcrumbLink asChild>
          <CrumbButton
            interactiveStyle={crumbInteractive}
            onClick={() => setSettingsSection('account')}
          >
            Settings
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep2" />,
      <BreadcrumbItem key="debug">
        <BreadcrumbPage>Debug</BreadcrumbPage>
      </BreadcrumbItem>
    )
  } else if (
    appMode === 'notes' &&
    !workspaceSettingsFolderId &&
    !selectedNote &&
    focusedFolderId
  ) {
    const folder = folders.find((f) => f.id === focusedFolderId)
    if (folder) {
      crumbs.push(
        <BreadcrumbItem key="folder-list">
          <BreadcrumbPage className="max-w-[min(24rem,55vw)] truncate">
            {folder.name}
          </BreadcrumbPage>
        </BreadcrumbItem>
      )
    }
  } else if (appMode === 'notes' && selectedNote && folderForNote) {
    crumbs.push(
      <BreadcrumbItem key="folder">
        <BreadcrumbLink asChild>
          <CrumbButton
            interactiveStyle={crumbInteractive}
            onClick={() => focusFolderInTree(folderForNote.id)}
          >
            {folderForNote.name}
          </CrumbButton>
        </BreadcrumbLink>
      </BreadcrumbItem>,
      <BreadcrumbSeparator key="sep1" />,
      <BreadcrumbItem key="note" className="min-w-0 max-w-[min(28rem,55vw)]">
        {showNoteSwitcher ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'text-foreground inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm py-0.5 text-left font-normal',
                  'hover:bg-accent/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                )}
                style={crumbInteractive}
                aria-label="Switch note or workspace"
              >
                <span className="min-w-0 truncate">{noteTitle}</span>
                <ChevronDown className="text-muted-foreground size-4 shrink-0 opacity-70" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[min(24rem,70vh)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
              style={macElectron ? macTitlebarStyles.noDrag : undefined}
            >
              {folders.length === 1 ? (
                <>
                  {(notesByFolder.get(folders[0]!.id) ?? []).map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(n.id === selectedNote.id && 'bg-accent/50')}
                      onSelect={() => selectNote(n.id)}
                    >
                      <span className="truncate">{n.title.trim() || 'Untitled'}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => openWorkspaceSettingsForFolder(folders[0]!.id)}>
                    Workspace settings…
                  </DropdownMenuItem>
                </>
              ) : (
                folders.map((folder) => (
                  <DropdownMenuSub key={folder.id}>
                    <DropdownMenuSubTrigger className="min-w-0">
                      <span className="truncate">{folder.name}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-[min(20rem,60vh)] overflow-y-auto">
                      {(notesByFolder.get(folder.id) ?? []).length === 0 ? (
                        <DropdownMenuItem disabled>No notes in this workspace</DropdownMenuItem>
                      ) : (
                        (notesByFolder.get(folder.id) ?? []).map((n) => (
                          <DropdownMenuItem
                            key={n.id}
                            className={cn(n.id === selectedNote.id && 'bg-accent/50')}
                            onSelect={() => selectNote(n.id)}
                          >
                            <span className="truncate">{n.title.trim() || 'Untitled'}</span>
                          </DropdownMenuItem>
                        ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openWorkspaceSettingsForFolder(folder.id)}>
                        Workspace settings…
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <BreadcrumbPage className="max-w-[min(24rem,40vw)] truncate">{noteTitle}</BreadcrumbPage>
        )}
      </BreadcrumbItem>
    )
  }

  const hasTextCrumbs = crumbs.length > 0
  const showSidebarToggle =
    (appMode === 'notes' || appMode === 'settings') && sidebarCollapsed

  if (!macElectron && !hasTextCrumbs && !showSidebarToggle) {
    return null
  }

  return (
    <div
      className={cn(
        'bg-background flex min-h-12 shrink-0 items-center gap-0.5',
        /* Sidebar normally clears the traffic lights; when collapsed the main column must. */
        macElectron && sidebarCollapsed && 'pl-[76px]'
      )}
      style={macElectron ? macTitlebarStyles.drag : undefined}
    >
      {showSidebarToggle ? (
        <div
          className="flex shrink-0 items-center pl-1"
          style={macElectron ? macTitlebarStyles.noDrag : undefined}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-9 shrink-0"
            aria-label="Expand sidebar"
            aria-expanded={false}
            onClick={toggleSidebar}
          >
            <PanelLeftOpen className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
      {hasTextCrumbs ? (
        <Breadcrumb className="flex min-h-12 min-w-0 flex-1 items-center px-2 py-0">
          <BreadcrumbList className="min-w-0 flex-nowrap gap-1 sm:gap-1.5">{crumbs}</BreadcrumbList>
        </Breadcrumb>
      ) : (
        <div
          className="min-h-12 min-w-0 flex-1"
          aria-hidden={!macElectron}
        />
      )}
    </div>
  )
}

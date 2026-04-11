import { Folder, FolderOpen } from 'lucide-react'
import type { JSX } from 'react'

import type { NoteSearchResult, FolderSearchResult } from '@/lib/notes/search/search-types'
import { treeNotePath } from '@/features/notes/notes-app-utils'
import type { NotesAppViewModel } from '@/hooks/notes/useNotesApp'

export type SidebarSearchResultsProps = {
  folderSearchResults: FolderSearchResult[]
  searchResults: NoteSearchResult[]
  closeSearch: () => void
  openFolderSettingsPanel: NotesAppViewModel['openFolderSettingsPanel']
  backToNotes: NotesAppViewModel['backToNotes']
  handleTreeSelectionChange: NotesAppViewModel['handleTreeSelectionChange']
}

export function SidebarSearchResults({
  folderSearchResults,
  searchResults,
  closeSearch,
  openFolderSettingsPanel,
  backToNotes,
  handleTreeSelectionChange
}: SidebarSearchResultsProps): JSX.Element {
  return (
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
  )
}

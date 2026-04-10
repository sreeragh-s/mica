"use client"

import { useCallback, useMemo, useState, JSX } from "react"
import { createPortal } from "react-dom"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  MenuTextMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $createLinkNode } from "@lexical/link"
import { $createTextNode, TextNode } from "lexical"

import { useNotelabEditorContext } from "@/features/editor/notelab-editor-context"
import {
  filterLinkableNotes,
  getObsidianLinkDisplayText,
  parseObsidianLinkText,
} from "@/features/editor/obsidian-link-utils"
import { buildInternalNoteLinkHref } from "@/lib/notes/internal-note-link"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { isDrawingNote } from "@/features/notes/notes-app-utils"

// Matches Obsidian-style [[...]] and ![[...]] link starts before the cursor.
const WIKI_LINK_REGEX = /!?\[\[([^\]\n]{0,150})$/

function checkForWikiLinkTrigger(text: string): MenuTextMatch | null {
  const match = WIKI_LINK_REGEX.exec(text)
  if (!match) return null
  if (match.index > 0 && text[match.index - 1] === "\\") return null
  return {
    leadOffset: match.index,
    matchingString: match[1] ?? "",
    replaceableString: match[0],
  }
}

class WikiLinkOption extends MenuOption {
  notePath: string
  noteTitle: string
  folderName: string
  kind: string

  constructor(notePath: string, noteTitle: string, folderName: string, kind: string) {
    super(notePath)
    this.notePath = notePath
    this.noteTitle = noteTitle
    this.folderName = folderName
    this.kind = kind
  }
}

export function WikiLinkPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const ctx = useNotelabEditorContext()
  const [queryString, setQueryString] = useState<string>("")

  const options = useMemo(() => {
    if (!ctx) return []
    return filterLinkableNotes(ctx, "", ctx.currentNoteId)
      .slice(0, 200)
      .map((note) => {
        const folderName =
          ctx.folders.find((f) => f.folder === note.folder)?.name ?? "Workspace"
        const title = note.title?.trim() || "Untitled"
        const kind = isDrawingNote(note) ? "Drawing" : "Note"
        return new WikiLinkOption(note.path, title, folderName, kind)
      })
  }, [ctx])

  const onSelectOption = useCallback(
    (
      selectedOption: WikiLinkOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const linkParts = parseObsidianLinkText(queryString)
        const displayText = getObsidianLinkDisplayText(
          selectedOption.noteTitle,
          linkParts
        )
        const linkNode = $createLinkNode(
          buildInternalNoteLinkHref(selectedOption.notePath, linkParts.subpath),
          { rel: "noopener", target: null }
        )
        const textNode = $createTextNode(displayText)
        linkNode.append(textNode)

        if (nodeToReplace) {
          nodeToReplace.replace(linkNode)
        }

        // Place cursor after the inserted link
        linkNode.selectNext()
        closeMenu()
      })
    },
    [editor, queryString]
  )

  const triggerFn = useCallback((text: string): MenuTextMatch | null => {
    return checkForWikiLinkTrigger(text)
  }, [])

  if (!ctx) return null

  return (
    <LexicalTypeaheadMenuPlugin<WikiLinkOption>
      onQueryChange={(q) => setQueryString(q ?? "")}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorElementRef.current) return null

        const query = queryString ?? ""
        const filtered = ctx
          ? filterLinkableNotes(ctx, query, ctx.currentNoteId).slice(0, 20)
          : []

        return createPortal(
          <div className="fixed z-50 w-[320px] overflow-hidden rounded-lg border bg-popover shadow-lg">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search notes…"
                value={query}
                onValueChange={() => undefined}
                className="h-9"
              />
              <CommandList>
                <CommandEmpty>No notes found.</CommandEmpty>
                <CommandGroup heading="Link to note">
                  {filtered.map((note, index) => {
                    const folderName =
                      ctx.folders.find((f) => f.folder === note.folder)?.name ??
                      "Workspace"
                    const title = note.title?.trim() || "Untitled"
                    const kind = isDrawingNote(note) ? "Drawing" : "Note"
                    const opt = options.find((o) => o.notePath === note.path)
                    if (!opt) return null
                    return (
                      <CommandItem
                        key={note.path}
                        value={note.path}
                        onSelect={() => selectOptionAndCleanUp(opt)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={
                          selectedIndex === index ? "bg-accent" : "!bg-transparent"
                        }
                      >
                        <span className="min-w-0 flex-1 truncate">{title}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {kind} · {folderName}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>,
          anchorElementRef.current
        )
      }}
    />
  )
}

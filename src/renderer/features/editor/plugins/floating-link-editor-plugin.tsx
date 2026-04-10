"use client"

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import {
  Dispatch,
  JSX,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  $createLinkNode,
  $isAutoLinkNode,
  $isLinkNode,
  $toggleLink,
  TOGGLE_LINK_COMMAND,
} from "@lexical/link"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $findMatchingParent, mergeRegister } from "@lexical/utils"
import {
  $getSelection,
  $isLineBreakNode,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  BaseSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from "lexical"
import { Check, Pencil, Trash, X } from "lucide-react"
import { createPortal } from "react-dom"

import { useNotelabEditorContext } from "@/features/editor/notelab-editor-context"
import { NoteLinkPickerList } from "@/features/editor/note-link-picker"
import { filterLinkableNotes } from "@/features/editor/obsidian-link-utils"
import { getSelectedNode } from "@/features/editor/utils/get-selected-node"
import { setFloatingElemPositionForLinkEditor } from "@/features/editor/utils/set-floating-elem-position-for-link-editor"
import { sanitizeUrl } from "@/features/editor/utils/url"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ExternalUrlPreviewBody,
  InternalNoteLinkIcon,
  InternalNoteLinkPreviewBody,
  LinkPreviewCardShell,
  UrlFavicon,
} from "@/features/editor/link-preview-card"
import { buildInternalNoteLinkHref, parseInternalNotePathFromHref } from "@/lib/notes/internal-note-link"

function FloatingLinkEditor({
  editor,
  isLink,
  setIsLink,
  anchorElem,
  isLinkEditMode,
  setIsLinkEditMode,
  internalNotePickerOpen,
  setInternalNotePickerOpen,
}: {
  editor: LexicalEditor
  isLink: boolean
  setIsLink: Dispatch<boolean>
  anchorElem: HTMLElement
  isLinkEditMode: boolean
  setIsLinkEditMode: Dispatch<boolean>
  internalNotePickerOpen: boolean
  setInternalNotePickerOpen: Dispatch<SetStateAction<boolean>>
}): JSX.Element {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [linkUrl, setLinkUrl] = useState("")
  const [editedLinkUrl, setEditedLinkUrl] = useState("https://")
  const [lastSelection, setLastSelection] = useState<BaseSelection | null>(null)
  const [noteSearchPicker, setNoteSearchPicker] = useState("")

  const notelabCtx = useNotelabEditorContext()

  const internalTargetId = useMemo(
    () => (linkUrl ? parseInternalNotePathFromHref(linkUrl) : null),
    [linkUrl]
  )

  const resolvedNote = useMemo(() => {
    if (!internalTargetId || !notelabCtx) return undefined
    return notelabCtx.notes.find((n) => n.path === internalTargetId)
  }, [internalTargetId, notelabCtx])

  const isInternalNoteLink = internalTargetId !== null

  const linkPickerNotes = useMemo(() => {
    if (!notelabCtx) return []
    return filterLinkableNotes(
      notelabCtx,
      noteSearchPicker,
      notelabCtx.currentNoteId
    )
  }, [notelabCtx, noteSearchPicker])

  const applyInternalLinkTarget = useCallback(
    (notePath: string) => {
      setInternalNotePickerOpen(false)
      setNoteSearchPicker("")
      editor.update(() => {
        if (lastSelection !== null && $isRangeSelection(lastSelection)) {
          $setSelection(lastSelection.clone())
        }
        $toggleLink(buildInternalNoteLinkHref(notePath))
      })
      setIsLinkEditMode(false)
    },
    [
      editor,
      lastSelection,
      setIsLinkEditMode,
      setInternalNotePickerOpen,
    ]
  )

  const $updateLinkEditor = useCallback(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      const node = getSelectedNode(selection)
      const linkParent = $findMatchingParent(node, $isLinkNode)

      if (linkParent) {
        setLinkUrl(linkParent.getURL())
      } else if ($isLinkNode(node)) {
        setLinkUrl(node.getURL())
      } else {
        setLinkUrl("")
      }
      if (isLinkEditMode) {
        setEditedLinkUrl(linkUrl)
      }
    }
    const editorElem = editorRef.current
    const nativeSelection = window.getSelection()
    const activeElement = document.activeElement

    if (editorElem === null) {
      return
    }

    const rootElement = editor.getRootElement()

    if (
      selection !== null &&
      nativeSelection !== null &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode) &&
      editor.isEditable()
    ) {
      const domRect: DOMRect | undefined =
        nativeSelection.focusNode?.parentElement?.getBoundingClientRect()
      if (domRect) {
        domRect.y += 40
        setFloatingElemPositionForLinkEditor(domRect, editorElem, anchorElem)
      }
      setLastSelection(selection)
    } else if (
      !internalNotePickerOpen &&
      (!activeElement || activeElement.className !== "link-input")
    ) {
      if (rootElement !== null) {
        setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem)
      }
      setLastSelection(null)
      setIsLinkEditMode(false)
      setLinkUrl("")
    }

    return true
  }, [
    anchorElem,
    editor,
    setIsLinkEditMode,
    isLinkEditMode,
    linkUrl,
    internalNotePickerOpen,
  ])

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement

    const update = () => {
      editor.getEditorState().read(() => {
        $updateLinkEditor()
      })
    }

    window.addEventListener("resize", update)

    if (scrollerElem) {
      scrollerElem.addEventListener("scroll", update)
    }

    return () => {
      window.removeEventListener("resize", update)

      if (scrollerElem) {
        scrollerElem.removeEventListener("scroll", update)
      }
    }
  }, [anchorElem.parentElement, editor, $updateLinkEditor])

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateLinkEditor()
        })
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateLinkEditor()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isLink) {
            setIsLink(false)
            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH
      )
    )
  }, [editor, $updateLinkEditor, setIsLink, isLink])

  useEffect(() => {
    editor.getEditorState().read(() => {
      $updateLinkEditor()
    })
  }, [editor, $updateLinkEditor])

  useEffect(() => {
    if (isLinkEditMode && inputRef.current) {
      inputRef.current.focus()
      setIsLink(true)
    }
  }, [isLinkEditMode, isLink])

  const monitorInputInteraction = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleLinkSubmission()
    } else if (event.key === "Escape") {
      event.preventDefault()
      setIsLinkEditMode(false)
    }
  }

  const handleLinkSubmission = () => {
    if (lastSelection !== null) {
      if (linkUrl !== "") {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl(editedLinkUrl))
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const parent = getSelectedNode(selection).getParent()
            if ($isAutoLinkNode(parent)) {
              const linkNode = $createLinkNode(parent.getURL(), {
                rel: parent.__rel,
                target: parent.__target,
                title: parent.__title,
              })
              parent.replace(linkNode, true)
            }
          }
        })
      }
      setEditedLinkUrl("https://")
      setIsLinkEditMode(false)
    }
  }
  return (
    <div
      ref={editorRef}
      data-link-hover-ignore
      className="absolute top-0 left-0 w-full max-w-lg opacity-0"
    >
      {!isLink ? null : isLinkEditMode && !isInternalNoteLink ? (
        <div className="bg-background flex items-center space-x-2 rounded-md border p-1 pl-2 shadow-sm">
          <Input
            ref={inputRef}
            value={editedLinkUrl}
            onChange={(event) => setEditedLinkUrl(event.target.value)}
            onKeyDown={monitorInputInteraction}
            className="link-input flex-grow"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setIsLinkEditMode(false)
              setIsLink(false)
            }}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={handleLinkSubmission}
            className="shrink-0"
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      ) : isInternalNoteLink && notelabCtx ? (
        <LinkPreviewCardShell className="items-start gap-3">
          <InternalNoteLinkIcon />
          <InternalNoteLinkPreviewBody
            resolvedNote={resolvedNote}
            notelabCtx={notelabCtx}
          />
          <div className="flex shrink-0 items-start gap-1 pt-0.5">
            <Popover
              modal={false}
              open={internalNotePickerOpen}
              onOpenChange={(open) => {
                setInternalNotePickerOpen(open)
                if (!open) setNoteSearchPicker("")
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  Change
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="z-[300] w-80 p-0"
                align="end"
                sideOffset={8}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <NoteLinkPickerList
                  noteSearch={noteSearchPicker}
                  onNoteSearchChange={setNoteSearchPicker}
                  linkableNotes={linkPickerNotes}
                  notelabCtx={notelabCtx}
                  onSelectNoteId={applyInternalLinkTarget}
                />
              </PopoverContent>
            </Popover>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 shrink-0"
              type="button"
              onClick={() => {
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
              }}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </LinkPreviewCardShell>
      ) : isInternalNoteLink ? (
        <LinkPreviewCardShell className="items-start gap-3">
          <InternalNoteLinkIcon />
          <InternalNoteLinkPreviewBody
            resolvedNote={undefined}
            notelabCtx={null}
          />
          <Button
            size="icon"
            variant="destructive"
            className="h-8 w-8 shrink-0"
            type="button"
            onClick={() => {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
            }}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </LinkPreviewCardShell>
      ) : (
        <LinkPreviewCardShell className="items-start gap-3">
          <UrlFavicon href={sanitizeUrl(linkUrl) || linkUrl} />
          <ExternalUrlPreviewBody displayUrl={linkUrl} />
          <div className="flex shrink-0 items-start gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              type="button"
              onClick={() => {
                setEditedLinkUrl(linkUrl)
                setIsLinkEditMode(true)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8"
              type="button"
              onClick={() => {
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
              }}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </LinkPreviewCardShell>
      )}
    </div>
  )
}

function useFloatingLinkEditorToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLDivElement | null,
  isLinkEditMode: boolean,
  setIsLinkEditMode: Dispatch<boolean>,
  onOpenChange?: (open: boolean) => void
): JSX.Element | null {
  const [activeEditor, setActiveEditor] = useState(editor)
  const [isLink, setIsLink] = useState(false)
  const [internalNotePickerOpen, setInternalNotePickerOpen] = useState(false)

  useEffect(() => {
    onOpenChange?.(isLink || internalNotePickerOpen)
  }, [internalNotePickerOpen, isLink, onOpenChange])

  useEffect(() => {
    function $updateToolbar() {
      if (internalNotePickerOpen) {
        setIsLink(true)
        return
      }
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const focusNode = getSelectedNode(selection)
        const focusLinkNode = $findMatchingParent(focusNode, $isLinkNode)
        const focusAutoLinkNode = $findMatchingParent(
          focusNode,
          $isAutoLinkNode
        )
        if (!(focusLinkNode || focusAutoLinkNode)) {
          setIsLink(false)
          return
        }
        const badNode = selection
          .getNodes()
          .filter((node) => !$isLineBreakNode(node))
          .find((node) => {
            const linkNode = $findMatchingParent(node, $isLinkNode)
            const autoLinkNode = $findMatchingParent(node, $isAutoLinkNode)
            return (
              (focusLinkNode && !focusLinkNode.is(linkNode)) ||
              (linkNode && !linkNode.is(focusLinkNode)) ||
              (focusAutoLinkNode && !focusAutoLinkNode.is(autoLinkNode)) ||
              (autoLinkNode &&
                (!autoLinkNode.is(focusAutoLinkNode) ||
                  autoLinkNode.getIsUnlinked()))
            )
          })
        if (!badNode) {
          setIsLink(true)
        } else {
          setIsLink(false)
        }
      } else if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes()
        if (nodes.length === 0) {
          setIsLink(false)
          return
        }
        const node = nodes[0]
        const parent = node.getParent()
        if ($isLinkNode(parent) || $isLinkNode(node)) {
          setIsLink(true)
        } else {
          setIsLink(false)
        }
      }
    }
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar()
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, newEditor) => {
          $updateToolbar()
          setActiveEditor(newEditor)
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CLICK_COMMAND,
        (payload) => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const node = getSelectedNode(selection)
            const linkNode = $findMatchingParent(node, $isLinkNode)
            if ($isLinkNode(linkNode)) {
              const url = linkNode.getURL()
              if (payload.metaKey || payload.ctrlKey) {
                window.open(url, "_blank")
                return true
              }
            }
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, internalNotePickerOpen])

  if (!anchorElem) {
    return null
  }

  return createPortal(
    <FloatingLinkEditor
      editor={activeEditor}
      isLink={isLink}
      anchorElem={anchorElem}
      setIsLink={setIsLink}
      isLinkEditMode={isLinkEditMode}
      setIsLinkEditMode={setIsLinkEditMode}
      internalNotePickerOpen={internalNotePickerOpen}
      setInternalNotePickerOpen={setInternalNotePickerOpen}
    />,
    anchorElem
  )
}

export function FloatingLinkEditorPlugin({
  anchorElem,
  isLinkEditMode,
  setIsLinkEditMode,
  onOpenChange,
}: {
  anchorElem: HTMLDivElement | null
  isLinkEditMode: boolean
  setIsLinkEditMode: Dispatch<boolean>
  onOpenChange?: (open: boolean) => void
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext()

  return useFloatingLinkEditorToolbar(
    editor,
    anchorElem,
    isLinkEditMode,
    setIsLinkEditMode,
    onOpenChange
  )
}

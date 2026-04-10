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
import { $isCodeHighlightNode } from "@lexical/code"
import { $isLinkNode, $toggleLink, TOGGLE_LINK_COMMAND } from "@lexical/link"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  BaseSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from "lexical"
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  NotebookText,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react"
import { createPortal } from "react-dom"

import { useNotelabEditorContext } from "@/features/editor/notelab-editor-context"
import { NoteLinkPickerList } from "@/features/editor/note-link-picker"
import { filterLinkableNotes } from "@/features/editor/obsidian-link-utils"
import { getDOMRangeRect } from "@/features/editor/utils/get-dom-range-rect"
import { getSelectedNode } from "@/features/editor/utils/get-selected-node"
import { setFloatingElemPosition } from "@/features/editor/utils/set-floating-elem-position"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { buildInternalNoteLinkHref } from "@/lib/notes/internal-note-link"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

function FloatingTextFormat({
  editor,
  anchorElem,
  isLink,
  isBold,
  isItalic,
  isUnderline,
  isCode,
  isStrikethrough,
  setIsLinkEditMode,
  noteLinkMenuOpen,
  setNoteLinkMenuOpen,
}: {
  editor: LexicalEditor
  anchorElem: HTMLElement
  isBold: boolean
  isCode: boolean
  isItalic: boolean
  isLink: boolean
  isStrikethrough: boolean
  isUnderline: boolean
  setIsLinkEditMode: Dispatch<boolean>
  noteLinkMenuOpen: boolean
  setNoteLinkMenuOpen: Dispatch<SetStateAction<boolean>>
}): JSX.Element {
  const popupCharStylesEditorRef = useRef<HTMLDivElement | null>(null)

  const insertLink = useCallback(() => {
    if (!isLink) {
      setIsLinkEditMode(true)
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://")
    } else {
      setIsLinkEditMode(false)
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    }
  }, [editor, isLink, setIsLinkEditMode])

  const notelabCtx = useNotelabEditorContext()
  const [noteSearch, setNoteSearch] = useState("")
  const savedSelectionRef = useRef<BaseSelection | null>(null)

  const saveSelectionForNoteLink = useCallback(() => {
    editor.getEditorState().read(() => {
      const s = $getSelection()
      savedSelectionRef.current =
        s !== null && $isRangeSelection(s) ? s.clone() : null
    })
  }, [editor])

  const linkableNotes = useMemo(() => {
    if (!notelabCtx) return []
    return filterLinkableNotes(
      notelabCtx,
      noteSearch,
      notelabCtx.currentNoteId
    )
  }, [notelabCtx, noteSearch])

  const applyInternalNoteLink = useCallback(
    (notePath: string) => {
      setNoteLinkMenuOpen(false)
      setNoteSearch("")
      editor.update(() => {
        const saved = savedSelectionRef.current
        if (saved !== null && $isRangeSelection(saved)) {
          $setSelection(saved)
        }
        $toggleLink(buildInternalNoteLinkHref(notePath))
      })
      setIsLinkEditMode(false)
      savedSelectionRef.current = null
    },
    [editor, setIsLinkEditMode, setNoteLinkMenuOpen]
  )

  function mouseMoveListener(e: MouseEvent) {
    if (
      popupCharStylesEditorRef?.current &&
      (e.buttons === 1 || e.buttons === 3)
    ) {
      if (popupCharStylesEditorRef.current.style.pointerEvents !== "none") {
        const x = e.clientX
        const y = e.clientY
        const elementUnderMouse = document.elementFromPoint(x, y)

        if (!popupCharStylesEditorRef.current.contains(elementUnderMouse)) {
          // Mouse is not over the target element => not a normal click, but probably a drag
          popupCharStylesEditorRef.current.style.pointerEvents = "none"
        }
      }
    }
  }
  function mouseUpListener(_e: MouseEvent) {
    if (popupCharStylesEditorRef?.current) {
      if (popupCharStylesEditorRef.current.style.pointerEvents !== "auto") {
        popupCharStylesEditorRef.current.style.pointerEvents = "auto"
      }
    }
  }

  useEffect(() => {
    if (!popupCharStylesEditorRef?.current) {
      return undefined
    }
    document.addEventListener("mousemove", mouseMoveListener)
    document.addEventListener("mouseup", mouseUpListener)

    return () => {
      document.removeEventListener("mousemove", mouseMoveListener)
      document.removeEventListener("mouseup", mouseUpListener)
    }
  }, [popupCharStylesEditorRef])

  const $updateTextFormatFloatingToolbar = useCallback(() => {
    const selection = $getSelection()

    const popupCharStylesEditorElem = popupCharStylesEditorRef.current
    const nativeSelection = window.getSelection()

    if (popupCharStylesEditorElem === null) {
      return
    }

    const rootElement = editor.getRootElement()
    if (
      selection !== null &&
      nativeSelection !== null &&
      !nativeSelection.isCollapsed &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode)
    ) {
      const rangeRect = getDOMRangeRect(nativeSelection, rootElement)

      setFloatingElemPosition(
        rangeRect,
        popupCharStylesEditorElem,
        anchorElem,
        isLink
      )
    }
  }, [editor, anchorElem, isLink])

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement

    const update = () => {
      editor.getEditorState().read(() => {
        $updateTextFormatFloatingToolbar()
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
  }, [editor, $updateTextFormatFloatingToolbar, anchorElem])

  useEffect(() => {
    editor.getEditorState().read(() => {
      $updateTextFormatFloatingToolbar()
    })
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateTextFormatFloatingToolbar()
        })
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateTextFormatFloatingToolbar()
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, $updateTextFormatFloatingToolbar])

  return (
    <div
      ref={popupCharStylesEditorRef}
      className="bg-background absolute top-0 left-0 flex gap-1 rounded-md border p-1 opacity-0 shadow-md transition-opacity duration-300 will-change-transform"
    >
      {editor.isEditable() && (
        <>
          <ToggleGroup
            type="multiple"
            defaultValue={[
              isBold ? "bold" : "",
              isItalic ? "italic" : "",
              isUnderline ? "underline" : "",
              isStrikethrough ? "strikethrough" : "",
              isCode ? "code" : "",
              isLink ? "link" : "",
            ]}
          >
            <ToggleGroupItem
              value="bold"
              aria-label="Toggle bold"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
              }}
              size="sm"
            >
              <BoldIcon className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="italic"
              aria-label="Toggle italic"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
              }}
              size="sm"
            >
              <ItalicIcon className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="underline"
              aria-label="Toggle underline"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
              }}
              size="sm"
            >
              <UnderlineIcon className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="strikethrough"
              aria-label="Toggle strikethrough"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
              }}
              size="sm"
            >
              <StrikethroughIcon className="h-4 w-4" />
            </ToggleGroupItem>
            <Separator orientation="vertical" />
            <ToggleGroupItem
              value="code"
              aria-label="Toggle code"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")
              }}
              size="sm"
            >
              <CodeIcon className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="link"
              aria-label="Toggle link"
              onClick={insertLink}
              size="sm"
            >
              <LinkIcon className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          {notelabCtx ? (
            <>
              <Separator
                orientation="vertical"
                className="mx-0.5 h-6 self-center"
              />
              <Popover
                modal={false}
                open={noteLinkMenuOpen}
                onOpenChange={(open) => {
                  setNoteLinkMenuOpen(open)
                  if (!open) setNoteSearch("")
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    aria-label="Link to note or drawing"
                    onPointerDown={saveSelectionForNoteLink}
                    onMouseDown={(e) => {
                      e.preventDefault()
                    }}
                  >
                    <NotebookText className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="z-[300] w-80 p-0"
                  align="start"
                  sideOffset={8}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <NoteLinkPickerList
                    noteSearch={noteSearch}
                    onNoteSearchChange={setNoteSearch}
                    linkableNotes={linkableNotes}
                    notelabCtx={notelabCtx}
                    onSelectNoteId={applyInternalNoteLink}
                  />
                </PopoverContent>
              </Popover>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

function useFloatingTextFormatToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLDivElement | null,
  setIsLinkEditMode: Dispatch<boolean>
): JSX.Element | null {
  const [noteLinkMenuOpen, setNoteLinkMenuOpen] = useState(false)
  const [isText, setIsText] = useState(false)
  const [isLink, setIsLink] = useState(false)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isCode, setIsCode] = useState(false)

  const updatePopup = useCallback(() => {
    editor.getEditorState().read(() => {
      // Should not to pop up the floating toolbar when using IME input
      if (editor.isComposing()) {
        return
      }
      const selection = $getSelection()
      const nativeSelection = window.getSelection()
      const rootElement = editor.getRootElement()

      if (
        nativeSelection !== null &&
        (!$isRangeSelection(selection) ||
          rootElement === null ||
          !rootElement.contains(nativeSelection.anchorNode))
      ) {
        setIsText(false)
        return
      }

      if (!$isRangeSelection(selection)) {
        return
      }

      const node = getSelectedNode(selection)

      // Update text format
      setIsBold(selection.hasFormat("bold"))
      setIsItalic(selection.hasFormat("italic"))
      setIsUnderline(selection.hasFormat("underline"))
      setIsStrikethrough(selection.hasFormat("strikethrough"))
      setIsCode(selection.hasFormat("code"))

      // Update links
      const parent = node.getParent()
      if ($isLinkNode(parent) || $isLinkNode(node)) {
        setIsLink(true)
      } else {
        setIsLink(false)
      }

      if (
        !$isCodeHighlightNode(selection.anchor.getNode()) &&
        selection.getTextContent() !== ""
      ) {
        setIsText($isTextNode(node) || $isParagraphNode(node))
      } else {
        setIsText(false)
      }

      const rawTextContent = selection.getTextContent().replace(/\n/g, "")
      if (!selection.isCollapsed() && rawTextContent === "") {
        setIsText(false)
        return
      }
    })
  }, [editor])

  useEffect(() => {
    document.addEventListener("selectionchange", updatePopup)
    return () => {
      document.removeEventListener("selectionchange", updatePopup)
    }
  }, [updatePopup])

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => {
        updatePopup()
      }),
      editor.registerRootListener(() => {
        if (editor.getRootElement() === null) {
          setIsText(false)
        }
      })
    )
  }, [editor, updatePopup])

  if ((!isText && !noteLinkMenuOpen) || !anchorElem) {
    return null
  }

  return createPortal(
    <FloatingTextFormat
      editor={editor}
      anchorElem={anchorElem}
      isLink={isLink}
      isBold={isBold}
      isItalic={isItalic}
      isStrikethrough={isStrikethrough}
      isUnderline={isUnderline}
      isCode={isCode}
      setIsLinkEditMode={setIsLinkEditMode}
      noteLinkMenuOpen={noteLinkMenuOpen}
      setNoteLinkMenuOpen={setNoteLinkMenuOpen}
    />,
    anchorElem
  )
}

export function FloatingTextFormatToolbarPlugin({
  anchorElem,
  setIsLinkEditMode,
}: {
  anchorElem: HTMLDivElement | null
  setIsLinkEditMode: Dispatch<boolean>
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext()

  return useFloatingTextFormatToolbar(editor, anchorElem, setIsLinkEditMode)
}

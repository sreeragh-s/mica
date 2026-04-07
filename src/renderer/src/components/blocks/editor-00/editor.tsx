"use client"

import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { EditorState, SerializedEditorState } from "lexical"

import { editorTheme } from "@/components/editor/themes/editor-theme"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { NotelabEditorProvider } from "@/components/editor/notelab-editor-context"
import { nodes } from "@/components/editor/nodes/nodes"
import { Plugins } from "@/components/editor/plugins/plugins"
import type { SavedNote, Folder } from "@/lib/notes-storage"

const editorConfig: InitialConfigType = {
  namespace: "Editor",
  theme: editorTheme,
  nodes,
  onError: (error: Error) => {
    console.error(error)
  },
}

export function Editor({
  editorState,
  editorSerializedState,
  onChange,
  onSerializedChange,
  className,
  notelabEditor,
  title,
  onTitleChange,
  coverImageSrc,
  onCoverChange,
  titleEmoji,
  onTitleEmojiChange,
  bottomChromePortal,
}: {
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  onChange?: (editorState: EditorState) => void
  onSerializedChange?: (editorSerializedState: SerializedEditorState) => void
  className?: string
  /** When set, enables “link to note/drawing” in the floating toolbar and internal link navigation. */
  notelabEditor?: {
    notes: SavedNote[]
    folders: Folder[]
    currentNoteId: string
    onOpenInternalNote: (noteId: string) => void
  } | null
  title?: string
  onTitleChange?: (title: string) => void
  coverImageSrc?: string | null
  onCoverChange?: (src: string | null) => void
  titleEmoji?: string | null
  onTitleEmojiChange?: (emoji: string | null) => void
  bottomChromePortal?: HTMLElement | null
}) {
  return (
    <div
      className={cn(
        "bg-background flex min-h-0 flex-1 flex-col overflow-hidden mt-10",
        className
      )}
    >
      <LexicalComposer
        initialConfig={{
          ...editorConfig,
          ...(editorState ? { editorState } : {}),
          ...(editorSerializedState
            ? { editorState: JSON.stringify(editorSerializedState) }
            : {}),
        }}
      >
        <NotelabEditorProvider value={notelabEditor ?? null}>
          <TooltipProvider>
            <div className="flex h-full min-h-0 flex-1 flex-col">
              <Plugins
                title={title}
                onTitleChange={onTitleChange}
                coverImageSrc={coverImageSrc}
                onCoverChange={onCoverChange}
                titleEmoji={titleEmoji}
                onTitleEmojiChange={onTitleEmojiChange}
                bottomChromePortal={bottomChromePortal}
              />

              <OnChangePlugin
                ignoreSelectionChange={true}
                onChange={(editorState) => {
                  onChange?.(editorState)
                  onSerializedChange?.(editorState.toJSON())
                }}
              />
            </div>
          </TooltipProvider>
        </NotelabEditorProvider>
      </LexicalComposer>
    </div>
  )
}

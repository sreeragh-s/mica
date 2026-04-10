"use client"

import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { EditorState, SerializedEditorState } from "lexical"
import { useCallback, useEffect, useRef, type ReactNode } from "react"

import { editorTheme } from "@/features/editor/themes/editor-theme"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { NotelabEditorProvider } from "@/features/editor/notelab-editor-context"
import { nodes } from "@/features/editor/nodes/nodes"
import { Plugins } from "@/features/editor/plugins/plugins"
import type { SavedNote, Folder } from "@/lib/notes/notes-storage"

const editorConfig: InitialConfigType = {
  namespace: "Editor",
  theme: editorTheme,
  nodes,
  onError: (error: Error) => {
    console.error(error)
  },
}

const SERIALIZE_IDLE_MS = 450

export function Editor({
  editorState,
  editorSerializedState,
  onChange,
  onSerializedChange,
  className,
  notelabEditor,
  header,
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
    onOpenInternalNote: (notePath: string, subpath?: string) => void
  } | null
  header?: ReactNode
  coverImageSrc?: string | null
  onCoverChange?: (src: string | null) => void
  titleEmoji?: string | null
  onTitleEmojiChange?: (emoji: string | null) => void
  bottomChromePortal?: HTMLElement | null
}) {
  const latestEditorStateRef = useRef<EditorState | null>(null)
  const serializeTimerRef = useRef<number | null>(null)

  const flushSerializedChange = useCallback(() => {
    if (serializeTimerRef.current !== null) {
      window.clearTimeout(serializeTimerRef.current)
      serializeTimerRef.current = null
    }
    if (!onSerializedChange || !latestEditorStateRef.current) return
    onSerializedChange(latestEditorStateRef.current.toJSON())
  }, [onSerializedChange])

  useEffect(() => {
    return () => {
      flushSerializedChange()
    }
  }, [flushSerializedChange])

  return (
    <div
      className={cn(
        "bg-background flex min-h-0 flex-1 flex-col overflow-hidden ",
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
                header={header}
                coverImageSrc={coverImageSrc}
                onCoverChange={onCoverChange}
                titleEmoji={titleEmoji}
                onTitleEmojiChange={onTitleEmojiChange}
                bottomChromePortal={bottomChromePortal}
              />

              <OnChangePlugin
                ignoreSelectionChange={true}
                onChange={(editorState) => {
                  latestEditorStateRef.current = editorState
                  onChange?.(editorState)
                  if (!onSerializedChange) return
                  if (serializeTimerRef.current !== null) {
                    window.clearTimeout(serializeTimerRef.current)
                  }
                  serializeTimerRef.current = window.setTimeout(() => {
                    serializeTimerRef.current = null
                    flushSerializedChange()
                  }, SERIALIZE_IDLE_MS)
                }}
              />
            </div>
          </TooltipProvider>
        </NotelabEditorProvider>
      </LexicalComposer>
    </div>
  )
}

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

import { GitnotesEditorProvider } from "@/components/editor/gitnotes-editor-context"
import { nodes } from "@/components/editor/nodes/nodes"
import { Plugins } from "@/components/editor/plugins/plugins"
import type { SavedNote, WorkspaceFolder } from "@/lib/notes-storage"

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
  gitnotesEditor,
}: {
  editorState?: EditorState
  editorSerializedState?: SerializedEditorState
  onChange?: (editorState: EditorState) => void
  onSerializedChange?: (editorSerializedState: SerializedEditorState) => void
  className?: string
  /** When set, enables “link to note/drawing” in the floating toolbar and internal link navigation. */
  gitnotesEditor?: {
    notes: SavedNote[]
    folders: WorkspaceFolder[]
    currentNoteId: string
    onOpenInternalNote: (noteId: string) => void
  } | null
}) {
  return (
    <div
      className={cn(
        "bg-background flex min-h-0 flex-1 flex-col overflow-hidden",
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
        <GitnotesEditorProvider value={gitnotesEditor ?? null}>
          <TooltipProvider>
            <div className="flex h-full min-h-0 flex-1 flex-col">
              <Plugins />

              <OnChangePlugin
                ignoreSelectionChange={true}
                onChange={(editorState) => {
                  onChange?.(editorState)
                  onSerializedChange?.(editorState.toJSON())
                }}
              />
            </div>
          </TooltipProvider>
        </GitnotesEditorProvider>
      </LexicalComposer>
    </div>
  )
}

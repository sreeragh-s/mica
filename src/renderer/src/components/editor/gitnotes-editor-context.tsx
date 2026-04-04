"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { SavedNote, WorkspaceFolder } from "@/lib/notes-storage"

export type GitnotesEditorContextValue = {
  notes: SavedNote[]
  folders: WorkspaceFolder[]
  currentNoteId: string
  onOpenInternalNote: (noteId: string) => void
}

const GitnotesEditorContext = createContext<GitnotesEditorContextValue | null>(null)

export function GitnotesEditorProvider({
  value,
  children,
}: {
  value: GitnotesEditorContextValue | null
  children: ReactNode
}): React.ReactElement {
  return (
    <GitnotesEditorContext.Provider value={value}>
      {children}
    </GitnotesEditorContext.Provider>
  )
}

export function useGitnotesEditorContext(): GitnotesEditorContextValue | null {
  return useContext(GitnotesEditorContext)
}

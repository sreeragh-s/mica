"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { SavedNote, Folder } from "@/lib/notes/notes-storage"

export type NotelabEditorContextValue = {
  notes: SavedNote[]
  folders: Folder[]
  currentNoteId: string
  onOpenInternalNote: (notePath: string) => void
  onOpenExternalUrl?: (url: string) => void
}

const NotelabEditorContext = createContext<NotelabEditorContextValue | null>(null)

export function NotelabEditorProvider({
  value,
  children,
}: {
  value: NotelabEditorContextValue | null
  children: ReactNode
}): React.ReactElement {
  return (
    <NotelabEditorContext.Provider value={value}>
      {children}
    </NotelabEditorContext.Provider>
  )
}

export function useNotelabEditorContext(): NotelabEditorContextValue | null {
  return useContext(NotelabEditorContext)
}

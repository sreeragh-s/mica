import { useCallback, useEffect, useState } from 'react'

import type { WorkspaceFolder } from '@/lib/notes-storage'

export type UseWorkspaceSettingsArgs = {
  folder: WorkspaceFolder
  onRename: (name: string) => void
  canDelete: boolean
  onDelete: () => Promise<void>
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- return type is WorkspaceSettingsModel below
export function useWorkspaceSettings({
  folder,
  onRename,
  canDelete,
  onDelete
}: UseWorkspaceSettingsArgs) {
  const [nameDraft, setNameDraft] = useState(folder.name)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- intentional form reset from props */
  useEffect(() => {
    setNameDraft(folder.name)
  }, [folder.id, folder.name])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!deleteOpen) {
      setDeleteConfirmDraft('')
    }
  }, [deleteOpen])

  const handleSaveName = useCallback(() => {
    const next = nameDraft.trim()
    if (!next) return
    onRename(next)
  }, [nameDraft, onRename])

  const deleteConfirmMatches = deleteConfirmDraft === folder.name

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmMatches || deleteBusy) return
    setDeleteBusy(true)
    try {
      await onDelete()
      setDeleteOpen(false)
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteBusy, deleteConfirmMatches, onDelete])

  return {
    nameDraft,
    setNameDraft,
    handleSaveName,
    canDelete,
    deleteOpen,
    setDeleteOpen,
    deleteConfirmDraft,
    setDeleteConfirmDraft,
    deleteConfirmMatches,
    deleteBusy,
    handleConfirmDelete
  }
}

export type WorkspaceSettingsModel = ReturnType<typeof useWorkspaceSettings>

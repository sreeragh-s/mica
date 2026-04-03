import { useCallback, useEffect, useState } from 'react'

import type { WorkspaceFolder } from '@/lib/notes-storage'

export type UseWorkspaceSettingsArgs = {
  folder: WorkspaceFolder
  onRename: (name: string) => void
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- return type is WorkspaceSettingsModel below
export function useWorkspaceSettings({ folder, onRename }: UseWorkspaceSettingsArgs) {
  const [nameDraft, setNameDraft] = useState(folder.name)

  /* eslint-disable react-hooks/set-state-in-effect -- intentional form reset from props */
  useEffect(() => {
    setNameDraft(folder.name)
  }, [folder.id, folder.name])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSaveName = useCallback(() => {
    const next = nameDraft.trim()
    if (!next) return
    onRename(next)
  }, [nameDraft, onRename])

  return {
    nameDraft,
    setNameDraft,
    handleSaveName,
  }
}

export type WorkspaceSettingsModel = ReturnType<typeof useWorkspaceSettings>

import { useCallback, useEffect, useMemo, useRef, type JSX } from 'react'

import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

export type ExcalidrawViewProps = {
  noteId: string
  sceneJson: string | null
  onSceneJsonChange: (json: string) => void
}

export function ExcalidrawView({
  noteId,
  sceneJson,
  onSceneJsonChange
}: ExcalidrawViewProps): JSX.Element {
  const debounceRef = useRef<number>(0)

  useEffect(() => {
    return () => window.clearTimeout(debounceRef.current)
  }, [])

  const initialData = useMemo(() => {
    const raw = sceneJson?.trim()
    if (!raw) return null
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }, [noteId, sceneJson])

  const onChange = useCallback(
    (
      elements: Parameters<typeof serializeAsJSON>[0],
      appState: Parameters<typeof serializeAsJSON>[1],
      files: Parameters<typeof serializeAsJSON>[2]
    ) => {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        const json = serializeAsJSON(elements, appState, files, 'local')
        onSceneJsonChange(json)
      }, 400)
    },
    [onSceneJsonChange]
  )

  return (
    <div className="excalidraw relative min-h-0 w-full flex-1 [&_.excalidraw]:h-full">
      <Excalidraw key={noteId} initialData={initialData ?? undefined} onChange={onChange} />
    </div>
  )
}

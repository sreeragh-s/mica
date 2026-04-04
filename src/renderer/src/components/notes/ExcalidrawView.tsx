import type { JSX } from 'react'

import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

export function ExcalidrawView(): JSX.Element {
  return (
    <div className="excalidraw relative min-h-0 w-full flex-1 [&_.excalidraw]:h-full">
      <Excalidraw />
    </div>
  )
}

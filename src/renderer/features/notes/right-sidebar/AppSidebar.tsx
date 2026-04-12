import type { JSX } from 'react'

import { RightSidebar } from '@/features/notes/right-sidebar/RightSidebar'
import type { RightSidebarProps } from '@/features/notes/right-sidebar/right-sidebar-types'

export type AppSidebarProps = RightSidebarProps

/** Resizable right-side column that switches between chat and links panels. */
export function AppSidebar(props: AppSidebarProps): JSX.Element {
  return <RightSidebar {...props} />
}

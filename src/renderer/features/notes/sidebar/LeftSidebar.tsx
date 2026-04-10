import type { JSX } from 'react'

import { Sidebar } from '@/features/notes/sidebar/Sidebar'
import type { SidebarProps } from '@/features/notes/sidebar/sidebar-types'

export type LeftSidebarProps = SidebarProps

/** Main notes column: workspace header, activity rail, explorer tree, settings, git. */
export function LeftSidebar(props: LeftSidebarProps): JSX.Element {
  return <Sidebar {...props} />
}

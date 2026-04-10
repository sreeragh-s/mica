import type { JSX } from 'react'

import { ChatSidebar } from '@/features/notes/chat/ChatSidebar'
import type { ChatSidebarProps } from '@/features/notes/chat/chat-sidebar-types'

export type AppSidebarProps = ChatSidebarProps

/** Resizable AI chat and linked-notes column (wraps {@link ChatSidebar}). */
export function AppSidebar(props: AppSidebarProps): JSX.Element {
  return <ChatSidebar {...props} />
}

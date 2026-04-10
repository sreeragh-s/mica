export const STARTER_SUGGESTIONS = [
  'Summarize my recent notes',
  'What did I write about last week?',
  'Find todos across my notes'
]

export const CHAT_SIDEBAR_WIDTH_LS_KEY = 'notelab:chat-sidebar-width-px'
export const CHAT_SIDEBAR_DEFAULT_WIDTH_PX = 440
export const CHAT_SIDEBAR_MIN_WIDTH_PX = 300
export const CHAT_SIDEBAR_MAX_WIDTH_PX = 900

export function clampChatSidebarWidth(w: number): number {
  return Math.round(Math.min(CHAT_SIDEBAR_MAX_WIDTH_PX, Math.max(CHAT_SIDEBAR_MIN_WIDTH_PX, w)))
}

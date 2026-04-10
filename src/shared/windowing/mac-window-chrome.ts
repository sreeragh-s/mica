/**
 * macOS window outer corner radius (renderer clips content to match the transparent window shape).
 */
export const MAC_WINDOW_OUTER_CORNER_RADIUS_PX = 16

/**
 * Height of the custom titlebar row in the renderer (Tailwind `h-12` / `min-h-12`).
 * Keep in sync with NotesMainTopBar, the sidebar header row, the chat AppSidebar top bar, and the
 * macOS drag band in NotesApp so native traffic lights line up with the painted chrome.
 */
export const MAC_NOTELAB_TITLEBAR_ROW_PX = 48

/** Horizontal inset for the native traffic-light cluster (`trafficLightPosition` / `setWindowButtonPosition`). */
export const MAC_TRAFFIC_LIGHT_X_PX = 22

/**
 * Approximate height of the traffic-light cluster for vertical centering in
 * {@link MAC_NOTELAB_TITLEBAR_ROW_PX}. macOS / Electron draw slightly larger than the visible
 * dots; tweak if a system update changes alignment.
 */
export const MAC_TRAFFIC_LIGHT_CLUSTER_HEIGHT_PX = 14

/** Native stoplights for `titleBarStyle: 'hidden'` — centered in {@link MAC_NOTELAB_TITLEBAR_ROW_PX}. */
export function macTrafficLightPosition(): { x: number; y: number } {
  const y = Math.round((MAC_NOTELAB_TITLEBAR_ROW_PX - MAC_TRAFFIC_LIGHT_CLUSTER_HEIGHT_PX) / 2)
  return { x: MAC_TRAFFIC_LIGHT_X_PX, y }
}

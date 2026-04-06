/**
 * macOS window vs inset sidebar corner math (keep in sync across main + renderer).
 * Outer radius matches `electron-liquid-glass` `cornerRadius` in `src/main/index.ts`.
 * Gutter matches Tailwind `p-2` on the sidebar column in `NotesApp`.
 */
export const MAC_WINDOW_OUTER_CORNER_RADIUS_PX = 16

export const MAC_SIDEBAR_INSET_GUTTER_PX = 4

/** Concentric inner radius: outer − gutter so the inset panel nests under the window arc. */
export const MAC_SIDEBAR_INSET_PANEL_RADIUS_PX =
  MAC_WINDOW_OUTER_CORNER_RADIUS_PX - MAC_SIDEBAR_INSET_GUTTER_PX

/** True when running inside the Notelab shell (desktop app). */
export function isNotelabApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.notelab)
}

/** True when running in Notelab on macOS (hidden title bar + traffic lights). */
export function isMacNotelab(): boolean {
  return (
    typeof window !== "undefined" &&
    window.notelab?.process?.platform === "darwin"
  )
}

/** True when running in Electron on macOS (hidden-inset title bar + traffic lights). */
export function isMacElectron(): boolean {
  return (
    typeof window !== "undefined" &&
    window.electron?.process?.platform === "darwin"
  )
}

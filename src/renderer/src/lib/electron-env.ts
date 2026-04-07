/** True when running inside the Electron shell (desktop app). */
export function isElectronApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.electron)
}

/** True when running in Electron on macOS (hidden title bar + traffic lights). */
export function isMacElectron(): boolean {
  return (
    typeof window !== "undefined" &&
    window.electron?.process?.platform === "darwin"
  )
}

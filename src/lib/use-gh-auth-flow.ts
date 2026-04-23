import * as React from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { openUrl } from "@tauri-apps/plugin-opener"
import {
  checkGhInstallation,
  startGhAuthLogin,
  type GhAuthCodePayload,
  type GhAuthDonePayload,
  type GhCheckResult,
} from "@/lib/setup-backend"

export type GhAuthFlowState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "waiting"; code: string; url: string }
  | { phase: "success" }
  | { phase: "error"; message: string }

export function useGhAuthFlow(onCheckRefreshed: (result: GhCheckResult) => void) {
  const [state, setState] = React.useState<GhAuthFlowState>({ phase: "idle" })
  // Keep the latest callback in a ref so the effect wiring the Tauri
  // listeners doesn't resubscribe on every parent re-render.
  const onRefreshedRef = React.useRef(onCheckRefreshed)
  React.useEffect(() => {
    onRefreshedRef.current = onCheckRefreshed
  })

  const start = React.useCallback(async () => {
    setState({ phase: "starting" })
    let offCode: UnlistenFn | undefined
    let offDone: UnlistenFn | undefined
    try {
      offCode = await listen<GhAuthCodePayload>("gh-auth-code", (event) => {
        const { code, url } = event.payload
        setState({ phase: "waiting", code, url })
        // Auto-open the verification URL. If the user blocks this, they can
        // still paste the URL from the code card manually.
        void openUrl(url).catch(() => {})
      })
      offDone = await listen<GhAuthDonePayload>("gh-auth-done", async (event) => {
        offCode?.()
        offDone?.()
        if (event.payload.success) {
          setState({ phase: "success" })
          try {
            const refreshed = await checkGhInstallation()
            onRefreshedRef.current(refreshed)
          } catch {
            // Ignore — the success message is enough and the next open of
            // this panel will re-check anyway.
          }
        } else {
          setState({
            phase: "error",
            message: event.payload.error ?? "Sign-in was not completed.",
          })
        }
      })
      await startGhAuthLogin()
    } catch (e) {
      offCode?.()
      offDone?.()
      setState({
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }, [])

  const reset = React.useCallback(() => setState({ phase: "idle" }), [])

  return { state, start, reset }
}

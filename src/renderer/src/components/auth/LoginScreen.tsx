import type { JSX } from "react"
// import { Github } from "lucide-react"

import { Button } from "@/components/ui/button"
import { isMacElectron } from "@/lib/electron-env"
import { cn } from "@/lib/utils"

type Props = {
  onGitHub: () => void
  onGuest: () => void
  busy: boolean
  error: string | null
}

export function LoginScreen({ onGitHub, onGuest, busy, error }: Props): JSX.Element {
  const mac = isMacElectron()

  return (
    <div className="bg-background text-foreground flex h-screen w-full flex-col items-center justify-center gap-6 p-8">
      <div
        className={cn(
          "flex max-w-sm flex-col items-center gap-2 text-center",
          mac && "pt-6"
        )}
      >
        <h1 className="text-2xl font-semibold tracking-tight">gitnotes</h1>
        <p className="text-muted-foreground text-sm">
          Sign in with GitHub, or continue locally and add sync later in Settings.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          type="button"
          size="lg"
          className="gap-2 w-full"
          disabled={busy}
          onClick={onGitHub}
        >
          {busy ? "Opening GitHub…" : "Continue with GitHub"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={onGuest}
        >
          Continue as guest
        </Button>
      </div>
      {error ? (
        <p className="text-destructive max-w-md text-center text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

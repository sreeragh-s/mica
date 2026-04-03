import type { JSX } from "react"
// import { Github } from "lucide-react"

import { Button } from "@/components/ui/button"
import { isMacElectron } from "@/lib/electron-env"
import { cn } from "@/lib/utils"

type Props = {
  onGitHub: () => void
  busy: boolean
  error: string | null
}

export function LoginScreen({ onGitHub, busy, error }: Props): JSX.Element {
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
          Sign in with GitHub to open your notes. Sessions are stored in this app.
        </p>
      </div>
      <Button
        type="button"
        size="lg"
        className="gap-2"
        disabled={busy}
        onClick={onGitHub}
      >
        {/* <Github className="size-5" aria-hidden /> */}
        {busy ? "Opening GitHub…" : "Continue with GitHub"}
      </Button>
      {error ? (
        <p className="text-destructive max-w-md text-center text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

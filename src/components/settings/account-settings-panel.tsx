import * as React from "react"
import { CheckCircle2, Copy, ExternalLink, GitBranchIcon, Loader2 } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  signInWithGitHub,
  signOut,
  clearGuestSession,
  isGuestSession,
  useSession,
} from "@/lib/auth-client"
import {
  checkGhInstallation,
  installGhCli,
  type GhCheckResult,
} from "@/lib/setup-backend"
import { useGhAuthFlow } from "@/lib/use-gh-auth-flow"

const GH_DOWNLOAD_URL = "https://cli.github.com/"
const GH_CHECK_CACHE_TTL_MS = 60_000

let ghCheckCache: { result: GhCheckResult; checkedAt: number } | null = null
let ghCheckPromise: Promise<GhCheckResult> | null = null

function readCachedGhCheck() {
  if (!ghCheckCache) return null
  if (Date.now() - ghCheckCache.checkedAt > GH_CHECK_CACHE_TTL_MS) return null
  return ghCheckCache.result
}

function storeGhCheck(result: GhCheckResult) {
  ghCheckCache = { result, checkedAt: Date.now() }
  return result
}

function loadGhInstallation(force = false) {
  const cached = force ? null : readCachedGhCheck()
  if (cached) return Promise.resolve(cached)
  if (!force && ghCheckPromise) return ghCheckPromise

  const promise = checkGhInstallation()
    .then(storeGhCheck)
    .finally(() => {
      if (ghCheckPromise === promise) {
        ghCheckPromise = null
      }
    })
  ghCheckPromise = promise
  return ghCheckPromise
}

function GitHubAuthCodeCard({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">Enter this code in your browser</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-background px-2 py-1.5 text-center font-mono text-sm font-semibold tracking-[0.2em]">
          {code}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
          <Copy className="mr-1.5 size-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Your browser should have opened automatically. If not,{" "}
        <button
          type="button"
          className="text-foreground underline underline-offset-2"
          onClick={() => void openUrl(url)}
        >
          open the verification page
        </button>
        .
      </p>
    </div>
  )
}

function GitHubCliSection() {
  const [initialCheck] = React.useState(() => readCachedGhCheck())
  const [check, setCheck] = React.useState<GhCheckResult | null>(initialCheck)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(Boolean(initialCheck))

  const applyCheck = React.useCallback((result: GhCheckResult) => {
    setCheck(storeGhCheck(result))
    setLoaded(true)
  }, [])

  const { state: authState, start: startAuth, reset: resetAuth } = useGhAuthFlow(applyCheck)

  const refresh = React.useCallback(async (force = false) => {
    const cached = force ? null : readCachedGhCheck()
    if (cached) {
      applyCheck(cached)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await loadGhInstallation(force)
      applyCheck(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [applyCheck])

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  const handleInstall = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await installGhCli()
      applyCheck(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [applyCheck])

  const handleSignIn = React.useCallback(() => {
    setError(null)
    void startAuth()
  }, [startAuth])

  // Mid-flow: we have a device code to show, regardless of prior install state.
  if (authState.phase === "waiting") {
    return (
      <div className="space-y-2">
        <GitHubAuthCodeCard code={authState.code} url={authState.url} />
        <Button type="button" size="sm" variant="ghost" onClick={resetAuth}>
          Cancel
        </Button>
      </div>
    )
  }

  if (authState.phase === "starting") {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Starting GitHub sign-in…
      </div>
    )
  }

  // Post-flow success: gh finished and re-check already updated `check`.
  // Fall through to the render branches below so "authenticated" takes over.

  // Already set up — collapse into a one-line status so the section stays
  // lightweight in the common case.
  if (check?.installed && check.authenticated) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">GitHub CLI ready</p>
            {check.version ? (
              <p className="truncate text-[11px] text-muted-foreground">{check.version}</p>
            ) : null}
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void refresh(true)}>
          Re-check
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <GitBranchIcon className="mt-0.5 size-4 shrink-0 text-foreground/80" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">GitHub CLI</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Publish a branch to GitHub in one click.
          </p>
        </div>
      </div>

      {!loaded ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Checking…
        </div>
      ) : check?.installed ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            Installed{check.version ? ` (${check.version})` : ""}, not signed in.
          </span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleSignIn}>
            Sign in to GitHub
          </Button>
        </div>
      ) : check?.installer ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void handleInstall()}>
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Install with {check.installer}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void refresh(true)}>
            Re-check
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => openUrl(GH_DOWNLOAD_URL)}>
            <ExternalLink className="mr-1.5 size-3.5" />
            Install GitHub CLI
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void refresh(true)}>
            Re-check
          </Button>
        </div>
      )}

      {authState.phase === "error" ? (
        <p className="text-[11px] text-destructive" role="alert">{authState.message}</p>
      ) : error ? (
        <p className="text-[11px] text-destructive" role="alert">{error}</p>
      ) : null}
    </div>
  )
}

function profileInitials(user: {
  name?: string | null
  email?: string | null
}) {
  const name = user.name?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  const email = user.email?.trim()
  if (email) return email.slice(0, 2).toUpperCase()
  return "?"
}

export const AccountSettingsPanel = React.memo(function AccountSettingsPanel() {
  const [isGuest, setIsGuest] = React.useState(false)
  const [isSigningIn, setIsSigningIn] = React.useState(false)
  const { data: authPayload, isPending: sessionPending } = useSession()
  const accountUser = authPayload?.user

  React.useEffect(() => {
    setIsGuest(isGuestSession())
  }, [])

  const handleContinueWithGitHub = async () => {
    setIsSigningIn(true)
    try {
      await signInWithGitHub()
    } catch (error) {
      console.error("Failed to sign in with GitHub:", error)
      setIsSigningIn(false)
    }
  }

  const handleLogout = async () => {
    try {
      if (accountUser) {
        await signOut()
      } else if (isGuest) {
        clearGuestSession()
      }
      window.location.reload()
    } catch (error) {
      console.error("Failed to sign out:", error)
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/85">Account</h2>
      <div className="mt-3 space-y-2">
        {accountUser ? (
          <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5">
            <Avatar className="size-12 ring-2 ring-background">
              {accountUser.image ? (
                <AvatarImage
                  src={accountUser.image}
                  alt={
                    accountUser.name ??
                    accountUser.email ??
                    "Profile picture"
                  }
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <AvatarFallback className="text-sm font-medium">
                {profileInitials(accountUser)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              <p className="text-[11px] text-muted-foreground">Signed in as</p>
              <p className="text-sm font-medium text-foreground">
                {accountUser.name || accountUser.email || accountUser.id}
              </p>
              {accountUser.email && accountUser.name ? (
                <p className="mt-0.5 truncate text-[11px]">{accountUser.email}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {(isGuest || (!accountUser && !sessionPending)) && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleContinueWithGitHub}
            disabled={isSigningIn}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="mr-2 size-4"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            {isSigningIn ? "Signing in..." : "Continue with GitHub"}
          </Button>
        )}
        <GitHubCliSection />
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="mr-2 size-4">
            <path
              fill="currentColor"
              d="M16 3h5v5a1 1 0 0 1-1 1h-4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5zm-2 3H5v11h9V6zm6 0h2.002L22 6l-2.002.001L20 6h-2v2.999L18 9V6h-2v2.999L16 9l-.001.002L16 6h-2z"
            />
          </svg>
          {isGuest && !accountUser ? "Clear Guest Session" : "Logout"}
        </Button>
      </div>
    </section>
  )
})

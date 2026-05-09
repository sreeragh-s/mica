"use client"

import * as React from "react"
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, ExternalLink, FolderOpen, GitBranchIcon, Loader2 } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setOnboardingComplete } from "@/lib/onboarding"
import {
  checkGhInstallation,
  checkGitInstallation,
  ensureDirectoryExists,
  getDefaultWorkspacePath,
  getGitGlobalIdentity,
  installGhCli,
  setGitGlobalIdentity,
  type GhCheckResult,
  type GitCheckResult,
} from "@/lib/setup-backend"
import { useGhAuthFlow } from "@/lib/use-gh-auth-flow"
import { pickWorkspaceFolder, setCurrentWorkspace } from "@/lib/workspace"
import { cn } from "@/lib/utils"

const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads"
const GH_DOWNLOAD_URL = "https://cli.github.com/"

type OnboardingWizardProps = {
  onComplete: () => void
}

type Step = 0 | 1 | 2

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = React.useState<Step>(0)
  const [gitCheck, setGitCheck] = React.useState<GitCheckResult | null>(null)
  const [gitLoading, setGitLoading] = React.useState(false)
  const [gitName, setGitName] = React.useState("")
  const [gitEmail, setGitEmail] = React.useState("")
  const [gitSaveError, setGitSaveError] = React.useState<string | null>(null)
  const [ghCheck, setGhCheck] = React.useState<GhCheckResult | null>(null)
  const [ghBusy, setGhBusy] = React.useState(false)
  const [ghError, setGhError] = React.useState<string | null>(null)
  const [workspacePath, setWorkspacePath] = React.useState("")
  const [workspaceLoading, setWorkspaceLoading] = React.useState(false)
  const [workspaceError, setWorkspaceError] = React.useState<string | null>(null)
  const [finishBusy, setFinishBusy] = React.useState(false)

  const loadGitStep = React.useCallback(async () => {
    setGitLoading(true)
    setGitSaveError(null)
    try {
      const [check, identity, gh] = await Promise.all([
        checkGitInstallation(),
        getGitGlobalIdentity(),
        checkGhInstallation(),
      ])
      setGitCheck(check)
      setGitName(identity.name ?? "")
      setGitEmail(identity.email ?? "")
      setGhCheck(gh)
    } catch (e) {
      console.error(e)
      setGitCheck({ installed: false, version: null })
    } finally {
      setGitLoading(false)
    }
  }, [])

  const { state: ghAuthState, start: startGhAuth, reset: resetGhAuth } = useGhAuthFlow(
    (result) => setGhCheck(result),
  )

  const handleGhInstall = React.useCallback(async () => {
    setGhBusy(true)
    setGhError(null)
    try {
      const result = await installGhCli()
      setGhCheck(result)
    } catch (e) {
      setGhError(e instanceof Error ? e.message : String(e))
    } finally {
      setGhBusy(false)
    }
  }, [])

  const handleGhSignIn = React.useCallback(() => {
    setGhError(null)
    void startGhAuth()
  }, [startGhAuth])

  const handleGhRecheck = React.useCallback(async () => {
    setGhBusy(true)
    setGhError(null)
    try {
      const refreshed = await checkGhInstallation()
      setGhCheck(refreshed)
    } catch (e) {
      setGhError(e instanceof Error ? e.message : String(e))
    } finally {
      setGhBusy(false)
    }
  }, [])

  const handleCopyGhCode = React.useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    if (step === 1) {
      void loadGitStep()
    }
  }, [step, loadGitStep])

  React.useEffect(() => {
    if (step !== 2) return
    let cancelled = false
    ;(async () => {
      setWorkspaceLoading(true)
      setWorkspaceError(null)
      try {
        const path = await getDefaultWorkspacePath()
        if (!cancelled) setWorkspacePath(path)
      } catch (e) {
        if (!cancelled) {
          setWorkspaceError(
            e instanceof Error ? e.message : "Could not resolve default workspace path.",
          )
        }
      } finally {
        if (!cancelled) setWorkspaceLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step])

  const goNextFromGit = async () => {
    if (!gitCheck?.installed) return
    setGitSaveError(null)
    const name = gitName.trim()
    const email = gitEmail.trim()
    if (!name || !email) {
      setGitSaveError("Enter both your name and email for Git.")
      return
    }
    setGitLoading(true)
    try {
      await setGitGlobalIdentity(name, email)
      setStep(2)
    } catch (e) {
      setGitSaveError(e instanceof Error ? e.message : "Could not save Git identity.")
    } finally {
      setGitLoading(false)
    }
  }

  const handleBrowseWorkspace = async () => {
    const picked = await pickWorkspaceFolder(workspacePath || undefined)
    if (picked) setWorkspacePath(picked)
  }

  const handleFinish = async () => {
    const path = workspacePath.trim()
    if (!path) {
      setWorkspaceError("Choose a workspace folder.")
      return
    }
    setFinishBusy(true)
    setWorkspaceError(null)
    try {
      await ensureDirectoryExists(path)
      setCurrentWorkspace(path)
      setOnboardingComplete()
      onComplete()
    } catch (e) {
      setWorkspaceError(e instanceof Error ? e.message : "Could not use that folder.")
    } finally {
      setFinishBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center p-6 pb-28">
        {step === 0 ? (
          <div className="flex w-full max-w-md flex-1 flex-col justify-between gap-10">
            <div className="flex flex-col items-center gap-4 pt-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-xl bg-sidebar-accent ring-1 ring-foreground/10">
                <span className="font-heading text-lg font-semibold tracking-tight text-sidebar-accent-foreground">
                  N
                </span>
              </div>
              <div className="space-y-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">Mica</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  A calm place for notes and markdown, with your files on disk. Take a minute to
                  connect Git and choose where your workspace lives — then you can sign in or
                  continue as a guest.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <Card className="w-full max-w-md" size="sm">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Git setup</CardTitle>
              <CardDescription>
                Mica uses Git for version history. We check that Git is installed and set your
                global name and email (used by commits on this machine).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {gitLoading && !gitCheck ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Checking Git…
                </div>
              ) : null}

              {gitCheck && !gitCheck.installed ? (
                <div className="space-y-3 rounded-md border border-border/80 bg-muted/30 p-3">
                  <p className="text-sm font-medium text-foreground">Git was not found</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Install Git, restart the app if the installer asks, then verify here. On macOS,
                    Xcode Command Line Tools include <code className="rounded bg-muted px-1">git</code>
                    , or install from the official site.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => openUrl(GIT_DOWNLOAD_URL)}
                    >
                      <ExternalLink className="mr-1.5 size-3.5" />
                      Open Git downloads
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadGitStep()}>
                      I installed Git — check again
                    </Button>
                  </div>
                </div>
              ) : null}

              {gitCheck?.installed ? (
                <>
                  <div className="flex items-start gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-medium text-foreground">Git is ready</p>
                      {gitCheck.version ? (
                        <p className="text-xs text-muted-foreground">{gitCheck.version}</p>
                      ) : null}
                    </div>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="git-name">Your name</FieldLabel>
                      <Input
                        id="git-name"
                        autoComplete="name"
                        placeholder="Ada Lovelace"
                        value={gitName}
                        onChange={(e) => setGitName(e.target.value)}
                        disabled={gitLoading}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="git-email">Email</FieldLabel>
                      <Input
                        id="git-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={gitEmail}
                        onChange={(e) => setGitEmail(e.target.value)}
                        disabled={gitLoading}
                      />
                      <FieldDescription>Stored in your global Git config for this device.</FieldDescription>
                    </Field>
                  </FieldGroup>
                  {gitSaveError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {gitSaveError}
                    </p>
                  ) : null}

                  {/* GitHub CLI: optional. Enables one-click publishing of a
                      branch to GitHub later. Never blocks Next — the user can
                      set this up after onboarding from Settings → Account. */}
                  <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <GitBranchIcon className="mt-0.5 size-4 shrink-0 text-foreground/80" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">GitHub CLI (optional)</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Publish a branch to GitHub in one click. Skip to set up later in Settings → Account.
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Skippable
                      </span>
                    </div>

                    {ghAuthState.phase === "waiting" ? (
                      <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                        <p className="text-xs font-medium text-foreground">
                          Enter this code in your browser
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded bg-background px-2 py-1.5 text-center font-mono text-sm font-semibold tracking-[0.2em]">
                            {ghAuthState.code}
                          </code>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleCopyGhCode(ghAuthState.code)}
                          >
                            <Copy className="mr-1.5 size-3.5" />
                            Copy
                          </Button>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Your browser should have opened automatically. If not,{" "}
                          <button
                            type="button"
                            className="text-foreground underline underline-offset-2"
                            onClick={() => void openUrl(ghAuthState.url)}
                          >
                            open the verification page
                          </button>
                          .
                        </p>
                        <Button type="button" size="sm" variant="ghost" onClick={resetGhAuth}>
                          Cancel
                        </Button>
                      </div>
                    ) : ghAuthState.phase === "starting" ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Starting GitHub sign-in…
                      </div>
                    ) : ghCheck?.installed && ghCheck.authenticated ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                        <span>Ready{ghCheck.version ? ` — ${ghCheck.version}` : ""}</span>
                      </div>
                    ) : ghCheck?.installed ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Installed{ghCheck.version ? ` (${ghCheck.version})` : ""}, not signed in.
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={ghBusy}
                          onClick={handleGhSignIn}
                        >
                          Sign in to GitHub
                        </Button>
                      </div>
                    ) : ghCheck?.installer ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={ghBusy}
                          onClick={() => void handleGhInstall()}
                        >
                          {ghBusy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                          Install with {ghCheck.installer}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={ghBusy}
                          onClick={() => void handleGhRecheck()}
                        >
                          Re-check
                        </Button>
                      </div>
                    ) : ghCheck ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openUrl(GH_DOWNLOAD_URL)}
                        >
                          <ExternalLink className="mr-1.5 size-3.5" />
                          Install GitHub CLI
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={ghBusy}
                          onClick={() => void handleGhRecheck()}
                        >
                          Re-check
                        </Button>
                      </div>
                    ) : null}

                    {ghAuthState.phase === "error" ? (
                      <p className="text-xs text-destructive" role="alert">{ghAuthState.message}</p>
                    ) : ghError ? (
                      <p className="text-xs text-destructive" role="alert">{ghError}</p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </CardContent>
            <CardFooter className="flex justify-between border-t border-border/60 pt-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!gitCheck?.installed || gitLoading}
                onClick={() => void goNextFromGit()}
              >
                Next
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card className="w-full max-w-md" size="sm">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Workspace folder</CardTitle>
              <CardDescription>
                Notes and files live in this folder on your computer. We default to{" "}
                <span className="font-medium text-foreground">Documents/mica</span> and create
                it if needed. You can pick another location anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {workspaceLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Resolving default path…
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="workspace-path">Workspace path</Label>
                <div className="flex gap-2">
                  <Input
                    id="workspace-path"
                    readOnly
                    className="font-mono text-[11px] md:text-xs"
                    value={workspacePath}
                    placeholder="Loading…"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => void handleBrowseWorkspace()}
                    disabled={workspaceLoading}
                  >
                    <FolderOpen className="mr-1.5 size-4" />
                    Change
                  </Button>
                </div>
              </div>
              {workspaceError ? (
                <p className="text-sm text-destructive" role="alert">
                  {workspaceError}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex justify-between border-t border-border/60 pt-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)} disabled={finishBusy}>
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Button>
              <Button type="button" size="sm" disabled={finishBusy || !workspacePath.trim()} onClick={() => void handleFinish()}>
                {finishBusy ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Finishing…
                  </>
                ) : (
                  "Finish setup"
                )}
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        <div className="mt-8 flex justify-center gap-1.5">
          {([0, 1, 2] as const).map((i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                step === i ? "bg-primary" : "bg-muted-foreground/25",
              )}
            />
          ))}
        </div>
      </div>

      {step === 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border/80 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto w-full max-w-md">
            <Button type="button" className="w-full" size="lg" onClick={() => setStep(1)}>
              Start setup
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

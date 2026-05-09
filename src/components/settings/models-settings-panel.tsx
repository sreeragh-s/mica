import * as React from "react"
import { CheckCircle2Icon, LoaderCircleIcon, RefreshCcwIcon, TerminalIcon, XCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ModelSelectorLogo } from "@/components/ai/model-selector"
import { type CliProvider, listCliProviders } from "@/lib/cli-chat"

export const ModelsSettingsPanel = React.memo(function ModelsSettingsPanel() {
  const [providers, setProviders] = React.useState<CliProvider[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    setIsLoading(true)
    try {
      setProviders(await listCliProviders())
    } catch (error) {
      console.error("Failed to load CLI providers:", error)
      setProviders([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const installedCount = providers.filter(provider => provider.installed).length

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/85">
              CLI Providers
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Mica chat connects directly to local Codex, OpenCode, and Claude Code CLI
              installations available on PATH.
            </p>
          </div>
          <Button disabled={isLoading} onClick={() => void refresh()} size="sm" variant="outline">
            {isLoading ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCcwIcon />}
            Refresh
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={installedCount ? "default" : "outline"}>
            {installedCount} installed
          </Badge>
          <Badge variant="outline">{providers.length || 3} supported</Badge>
        </div>

        {!isLoading && installedCount === 0 ? (
          <Alert className="mt-3">
            <TerminalIcon />
            <AlertTitle>No CLI providers detected</AlertTitle>
            <AlertDescription>
              Install at least one supported CLI and make sure it is available on PATH before
              opening the chat sidebar.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="space-y-2">
        {providers.map(provider => (
          <div key={provider.id} className="rounded-lg border border-border/60 bg-card p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background">
                  <ModelSelectorLogo className="size-4" provider={provider.logoProvider} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">{provider.name}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {provider.installed
                      ? provider.version
                        ? `Version ${provider.version}`
                        : "Installed"
                      : provider.error ?? "Not installed or unavailable on PATH."}
                  </div>
                </div>
              </div>

              <Badge variant={provider.installed ? "default" : "outline"}>
                {provider.installed ? (
                  <CheckCircle2Icon className="mr-1 size-3" />
                ) : (
                  <XCircleIcon className="mr-1 size-3" />
                )}
                {provider.installed ? "Ready" : "Unavailable"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

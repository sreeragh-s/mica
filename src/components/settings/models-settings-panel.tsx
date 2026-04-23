import * as React from "react"
import { LoaderCircleIcon, RefreshCcwIcon, SearchIcon, ServerCrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useLocalModels } from "@/hooks/use-local-models"
import { invoke } from "@tauri-apps/api/core"

export const ModelsSettingsPanel = React.memo(function ModelsSettingsPanel() {
  const { isLoading, ollamaStatus, refresh, selectedModelIds, toggleModel } = useLocalModels()
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [searchResults, setSearchResults] = React.useState<string[]>([])
  const [isSearching, setIsSearching] = React.useState(false)

  const hasAvailableModels = ollamaStatus.models.length > 0

  const handleSearch = React.useCallback(async (query: string) => {
    setSearchQuery(query)

    if (query.trim().length === 0) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const results = await invoke<string[]>("search_ollama_models", { query })
      setSearchResults(results)
    } catch (error) {
      console.error("Search failed:", error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleDownload = async () => {
    const modelName = searchQuery.trim()
    if (!modelName) return

    setIsDownloading(true)
    try {
      await invoke("pull_ollama_model", { model: modelName })
      setSearchQuery("")
      setSearchResults([])
      setOpen(false)
      await refresh()
    } catch (error) {
      console.error("Failed to download model:", error)
    } finally {
      setIsDownloading(false)
    }
  }

  const selectModel = (modelName: string) => {
    setSearchQuery(modelName)
    setSearchResults([])
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/85">Local Models</h2>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Connect to Ollama, choose which downloaded models should appear in the app, and keep
              the model switcher limited to models that are actually available right now.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={isLoading} onClick={() => void refresh()} size="sm" variant="outline">
              {isLoading ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCcwIcon />}
              Refresh
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <SearchIcon className="mr-1.5 size-3.5" />
                  Find Models
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Find & Download Models</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Search for a model from the{" "}
                    <a
                      href="https://ollama.com/library"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Ollama library
                    </a>{" "}
                    to download it locally.
                  </p>
                  <div className="relative">
                    <Input
                      placeholder="Search models..."
                      value={searchQuery}
                      onChange={e => void handleSearch(e.target.value)}
                      disabled={isDownloading}
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-auto rounded-lg border bg-popover shadow-md">
                        {searchResults.map(name => (
                          <button
                            key={name}
                            type="button"
                            className="w-full px-3 py-2 text-left text-xs hover:bg-muted"
                            onClick={() => selectModel(name)}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => void handleDownload()}
                    disabled={!searchQuery.trim() || isDownloading}
                  >
                    {isDownloading ? (
                      <>
                        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      "Download Model"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={ollamaStatus.running ? "default" : "outline"}>
            {ollamaStatus.running ? "Ollama running" : "Ollama unavailable"}
          </Badge>
          {hasAvailableModels && (
            <Badge variant="outline">
              {ollamaStatus.models.length} available
            </Badge>
          )}
        </div>

        {!ollamaStatus.running ? (
          <Alert className="mt-3">
            <ServerCrashIcon />
            <AlertTitle>Start Ollama before adding local models</AlertTitle>
            <AlertDescription>
              {ollamaStatus.installed
                ? "Open Ollama so the app can detect your downloaded models. Once it is running, come back here and refresh."
                : "Install Ollama first, launch it, then download at least one model so it can be added here."}
              {ollamaStatus.error ? ` ${ollamaStatus.error}` : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        {ollamaStatus.running && !hasAvailableModels ? (
          <Alert className="mt-3">
            <ServerCrashIcon />
            <AlertTitle>No local models found yet</AlertTitle>
            <AlertDescription>
              Ollama is running, but there are no downloaded models available to add. Download a
              model with Ollama, then refresh this panel.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {hasAvailableModels ? (
        <div className="space-y-2">
          {ollamaStatus.models.map(model => {
            const isSelected =
              selectedModelIds.includes(model.id) ||
              selectedModelIds.includes(model.name) ||
              (model.digest ? selectedModelIds.includes(model.digest) : false)

            return (
              <div
                key={model.id}
                className="rounded-lg border border-border/60 bg-card p-3.5"
              >
                <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground">{model.name}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {model.size ? <span>{model.size}</span> : null}
                      {model.modifiedAt ? <span>{model.modifiedAt}</span> : null}
                    </div>
                  </div>

                  <Switch
                    checked={isSelected}
                    onCheckedChange={() => toggleModel(model.name, [model.digest ?? ""])}
                    aria-label={`Toggle ${model.name}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
})

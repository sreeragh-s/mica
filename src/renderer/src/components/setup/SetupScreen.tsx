import { useCallback, useEffect, useState, type JSX } from 'react'

import { Check, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { backendFetchJson } from '@/lib/backend-api'
import type { GitNotesApi } from '@/lib/auth-bridge'
import { isMacElectron } from '@/lib/electron-env'
import { saveSetupState } from '@/lib/setup-storage'
import { cn } from '@/lib/utils'

import { slugifyRepoSuggestion } from '@/components/notes/notes-app-utils'

type Props = {
  api: GitNotesApi
  onDone: () => void
}

export function SetupScreen({ api, onDone }: Props): JSX.Element {
  const mac = isMacElectron()
  /** Notes folder only — does not block the rest of the screen. */
  const [rootLoading, setRootLoading] = useState(true)
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [gitAvailable, setGitAvailable] = useState<boolean | null>(null)
  const [gitDetail, setGitDetail] = useState<string | null>('Optional — API sync works without Git.')

  const [installBusy, setInstallBusy] = useState(false)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [hasInstallation, setHasInstallation] = useState(false)

  const [repoList, setRepoList] = useState<{ fullName: string; defaultBranch: string }[]>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [manualOwner, setManualOwner] = useState('')
  const [manualRepo, setManualRepo] = useState('')
  const [validateBusy, setValidateBusy] = useState(false)
  const [validateError, setValidateError] = useState<string | null>(null)

  const [newRepoName, setNewRepoName] = useState(() => slugifyRepoSuggestion('gitnotes'))
  const [createBusy, setCreateBusy] = useState(false)

  const runDataRoot = useCallback(async (): Promise<void> => {
    const ws = api.workspace
    if (!ws?.ensureDataRoot) {
      setRootLoading(false)
      return
    }
    setRootLoading(true)
    const root = await ws.ensureDataRoot()
    if (!root.ok) {
      setRootPath(null)
      setGitAvailable(false)
      setGitDetail(root.error)
      setRootLoading(false)
      return
    }
    setRootPath(root.path)
    setGitAvailable(root.gitAvailable)
    setGitDetail(
      root.gitAvailable
        ? 'Available for local git push/pull.'
        : 'Not installed — use GitHub sync above.'
    )
    setRootLoading(false)
  }, [api])

  useEffect(() => {
    queueMicrotask(() => {
      void runDataRoot()
    })
  }, [runDataRoot])

  const loadStatus = useCallback(async () => {
    const r = await backendFetchJson<{
      hasInstallation?: boolean
      linkedRepo?: { fullName: string } | null
    }>('/api/github/status')
    if (r.ok && r.data) {
      setHasInstallation(Boolean(r.data.hasInstallation))
      if (r.data.linkedRepo?.fullName) {
        setSelectedRepo(r.data.linkedRepo.fullName)
      }
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const openInstallPage = useCallback(async () => {
    setInstallBusy(true)
    setStatusMsg(null)
    try {
      const r = await backendFetchJson<{ url?: string }>('/api/github/install-url')
      if (!r.ok || !r.data?.url) {
        setStatusMsg(r.ok ? 'No install URL returned.' : r.message)
        return
      }
      if (api.workspace?.openExternal) {
        await api.workspace.openExternal(r.data.url)
      } else {
        window.open(r.data.url, '_blank', 'noopener,noreferrer')
      }
      setStatusMsg('Complete the install in the browser, then tap “Detect installation”.')
    } finally {
      setInstallBusy(false)
    }
  }, [api])

  const refreshInstallation = useCallback(async () => {
    setRefreshBusy(true)
    setStatusMsg(null)
    try {
      const r = await backendFetchJson<{ ok?: boolean; installationId?: string }>(
        '/api/github/refresh-installation',
        { method: 'POST' }
      )
      if (!r.ok) {
        setStatusMsg(r.message)
        setHasInstallation(false)
        return
      }
      setHasInstallation(true)
      setStatusMsg('GitHub App linked. You can list repositories below.')
      await loadStatus()
      const lr = await backendFetchJson<{
        repositories: { fullName: string; defaultBranch: string }[]
      }>('/api/github/repos?page=1')
      if (lr.ok && lr.data?.repositories) {
        setRepoList(lr.data.repositories)
      }
    } finally {
      setRefreshBusy(false)
    }
  }, [loadStatus])

  const loadRepos = useCallback(async () => {
    const lr = await backendFetchJson<{
      repositories: { fullName: string; defaultBranch: string }[]
    }>('/api/github/repos?page=1')
    if (lr.ok && lr.data?.repositories) {
      setRepoList(lr.data.repositories)
    }
  }, [])

  useEffect(() => {
    if (hasInstallation) {
      void loadRepos()
    }
  }, [hasInstallation, loadRepos])

  const validateAndLink = useCallback(async () => {
    setValidateBusy(true)
    setValidateError(null)
    try {
      let owner: string
      let name: string
      const pick = selectedRepo.trim()
      if (pick.includes('/')) {
        const [o, n] = pick.split('/')
        owner = o?.trim() ?? ''
        name = n?.trim() ?? ''
      } else {
        owner = manualOwner.trim()
        name = manualRepo.trim()
      }
      if (!owner || !name) {
        setValidateError('Enter owner and repository name, or pick from the list.')
        return
      }
      const v = await backendFetchJson<{ ok?: boolean; reason?: string }>(
        '/api/github/validate-repo',
        { method: 'POST', body: { owner, repo: name } }
      )
      if (!v.ok) {
        setValidateError(v.message)
        return
      }
      const data = v.data as { ok?: boolean; reason?: string }
      if (!data?.ok) {
        setValidateError(data?.reason ?? 'This repository is not valid for GitNotes.')
        return
      }
      const link = await backendFetchJson<{ ok?: boolean; fullName?: string; reason?: string }>(
        '/api/github/link-repo',
        { method: 'POST', body: { owner, repo: name } }
      )
      if (!link.ok || !(link.data as { ok?: boolean })?.ok) {
        setValidateError(
          !link.ok ? link.message : (link.data as { reason?: string })?.reason ?? 'Link failed'
        )
        return
      }
      const full = (link.data as { fullName?: string }).fullName ?? `${owner}/${name}`
      const ws = api.workspace
      if (rootPath && ws?.setSyncMode) {
        await ws.setSyncMode({ cwd: rootPath, syncMode: 'github_api' })
      }
      saveSetupState({
        complete: true,
        syncMode: 'github_api',
        githubRepoFullName: full,
      })
      onDone()
    } finally {
      setValidateBusy(false)
    }
  }, [api.workspace, manualOwner, manualRepo, onDone, rootPath, selectedRepo])

  const createRepo = useCallback(async () => {
    setCreateBusy(true)
    setValidateError(null)
    try {
      const n = newRepoName.trim() || slugifyRepoSuggestion('gitnotes')
      const r = await backendFetchJson<{ ok?: boolean; fullName?: string }>(
        '/api/github/repos/create',
        { method: 'POST', body: { name: n, private: false } }
      )
      if (!r.ok || !(r.data as { ok?: boolean })?.ok) {
        setValidateError(!r.ok ? r.message : 'Create failed')
        return
      }
      const full = (r.data as { fullName?: string }).fullName
      if (!full) {
        setValidateError('No repository name in response.')
        return
      }
      const ws = api.workspace
      if (rootPath && ws?.setSyncMode) {
        await ws.setSyncMode({ cwd: rootPath, syncMode: 'github_api' })
      }
      saveSetupState({
        complete: true,
        syncMode: 'github_api',
        githubRepoFullName: full,
      })
      onDone()
    } finally {
      setCreateBusy(false)
    }
  }, [api.workspace, newRepoName, onDone, rootPath])

  const getStarted = useCallback(() => {
    saveSetupState({
      complete: true,
      syncMode: gitAvailable === true ? 'git' : 'local',
    })
    onDone()
  }, [gitAvailable, onDone])

  const rootOk = Boolean(rootPath)

  return (
    <div className="bg-background text-foreground flex h-screen w-full flex-col overflow-hidden">
      <div
        className={cn(
          'mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center gap-4 overflow-x-hidden overflow-y-auto px-6 py-4',
          mac && 'pt-6'
        )}
      >
        <div className="space-y-0.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Set up GitNotes</h1>
          <p className="text-muted-foreground text-sm">
            Connect GitHub to sync, or continue with local notes.
          </p>
        </div>

        <ul className="space-y-2 text-sm">
          <li className="border-border flex items-start gap-3 rounded-lg border px-3 py-2.5">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {rootLoading ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : rootOk ? (
                <Check className="text-foreground size-4" strokeWidth={2} />
              ) : (
                <X className="text-destructive size-4" strokeWidth={2} />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">Notes folder</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-8 shrink-0"
                  disabled={rootLoading}
                  onClick={() => void runDataRoot()}
                  aria-label="Refresh notes folder"
                >
                  {rootLoading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
              {rootPath ? (
                <p className="text-muted-foreground text-xs break-all leading-snug">{rootPath}</p>
              ) : rootLoading ? (
                <p className="text-muted-foreground text-xs">Preparing…</p>
              ) : (
                <p className="text-destructive text-xs">Could not create data folder.</p>
              )}
            </div>
          </li>

          <li className="border-border flex items-start gap-3 rounded-lg border px-3 py-2.5">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {gitAvailable === true ? (
                <Check className="text-foreground size-4" strokeWidth={2} />
              ) : gitAvailable === false ? (
                <span className="text-muted-foreground text-xs font-medium">—</span>
              ) : rootLoading ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : (
                <span className="text-muted-foreground text-xs font-medium">—</span>
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-medium">Git (optional)</p>
              <p className="text-muted-foreground text-xs leading-snug">{gitDetail}</p>
            </div>
          </li>
        </ul>

        <section className="border-border space-y-2 rounded-lg border px-3 py-2.5">
          <h2 className="text-foreground text-sm font-semibold">GitHub App</h2>
          <p className="text-muted-foreground text-xs leading-snug">
            Install the app, then detect the installation here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={installBusy}
              onClick={() => void openInstallPage()}
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Open GitHub install page
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={refreshBusy}
              onClick={() => void refreshInstallation()}
            >
              {refreshBusy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              Detect installation
            </Button>
          </div>
          {statusMsg ? (
            <p className="text-foreground text-xs whitespace-pre-wrap">{statusMsg}</p>
          ) : null}
        </section>

        {hasInstallation ? (
          <section className="border-border space-y-2 rounded-lg border px-3 py-2.5">
            <h2 className="text-foreground text-sm font-semibold">Import a repository</h2>
            <p className="text-muted-foreground text-xs leading-snug">
              <span className="font-mono">gitnotes/workspaces/</span> or empty repo.
            </p>
            {repoList.length > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="setup-repo-select">Your repositories</Label>
                <select
                  id="setup-repo-select"
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  value={selectedRepo}
                  onChange={(e) => {
                    setSelectedRepo(e.target.value)
                    setValidateError(null)
                  }}
                >
                  <option value="">— Select —</option>
                  {repoList.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="setup-owner">Owner</Label>
                <Input
                  id="setup-owner"
                  value={manualOwner}
                  onChange={(e) => setManualOwner(e.target.value)}
                  placeholder="octocat"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-repo">Repository</Label>
                <Input
                  id="setup-repo"
                  value={manualRepo}
                  onChange={(e) => setManualRepo(e.target.value)}
                  placeholder="my-notes"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={validateBusy}
              onClick={() => void validateAndLink()}
            >
              {validateBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Validate &amp; link
            </Button>
            {validateError ? (
              <p className="text-destructive text-xs whitespace-pre-wrap">{validateError}</p>
            ) : null}
          </section>
        ) : null}

        {hasInstallation ? (
          <section className="border-border space-y-2 rounded-lg border px-3 py-2.5">
            <h2 className="text-foreground text-sm font-semibold">Create a new repository</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="setup-new-repo">Repository name</Label>
                <Input
                  id="setup-new-repo"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  placeholder="gitnotes-notes"
                  className="font-mono text-sm"
                />
              </div>
              <Button type="button" disabled={createBusy} onClick={() => void createRepo()}>
                {createBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                Create on GitHub
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      <div className="bg-background shrink-0 px-6 pt-4 pb-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
          <Button type="button" size="lg" className="w-full" onClick={getStarted}>
            Get started
          </Button>
          <p className="text-muted-foreground text-center text-xs leading-snug">
            Local notes; add GitHub sync in Settings anytime.
          </p>
        </div>
      </div>
    </div>
  )
}

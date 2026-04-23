import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  requestOpenWikiLinkGraph,
  requestWorkspaceWikiLinkRebuild,
  useWikiLinkIndexSummary,
} from "@/lib/wikilink-utils"

function formatIndexedTime(value: number | null) {
  if (!value) {
    return "Not indexed yet"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export const WikiSettingsPanel = React.memo(function WikiSettingsPanel() {
  const { isLoading, meta, workspace } = useWikiLinkIndexSummary()

  return (
    <section className="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/85">
            Wiki Index
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Inspect the local wikilink graph and rebuild it for the current workspace when needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!workspace}
            onClick={requestOpenWikiLinkGraph}
          >
            Open Graph
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!workspace || meta?.status === "indexing"}
            onClick={() => requestWorkspaceWikiLinkRebuild(true)}
          >
            {meta?.status === "indexing" ? "Rebuilding…" : "Rebuild Index"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <WikiStatCard label="Status" value={isLoading ? "Loading…" : meta?.status ?? "No index"} />
        <WikiStatCard label="Workspace files" value={String(meta?.totalFiles ?? 0)} />
        <WikiStatCard label="Resolved links" value={String(meta?.totalResolvedLinks ?? 0)} />
        <WikiStatCard label="Dangling links" value={String(meta?.totalDanglingLinks ?? 0)} />
      </div>

      <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span>Last indexed</span>
          <span className="text-right text-foreground/85">{formatIndexedTime(meta?.lastIndexedAt ?? null)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Last processed count</span>
          <span className="text-right text-foreground/85">{meta?.processedFiles ?? 0}</span>
        </div>
        {meta?.lastError ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-destructive">
            {meta.lastError}
          </div>
        ) : null}
      </div>
    </section>
  )
})

function WikiStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

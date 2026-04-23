import * as React from "react"
import { Button } from "@/components/ui/button"
import { Loader2, X } from "lucide-react"

function DiffPane({ diff }: { diff: string }): React.ReactElement {
  const lines = diff.split("\n")
  return (
    <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-[1.6]">
      {lines.map((line, i) => {
        let cls = "text-muted-foreground px-3 whitespace-pre"
        if (line.startsWith("+") && !line.startsWith("+++"))
          cls = "bg-green-500/10 text-green-700 dark:text-green-400 px-3 whitespace-pre"
        else if (line.startsWith("-") && !line.startsWith("---"))
          cls = "bg-red-500/10 text-red-700 dark:text-red-400 px-3 whitespace-pre"
        else if (line.startsWith("@@")) cls = "text-blue-500 dark:text-blue-400 px-3 whitespace-pre"
        else if (
          line.startsWith("diff ") ||
          line.startsWith("index ") ||
          line.startsWith("--- ") ||
          line.startsWith("+++ ")
        )
          cls = "text-foreground font-semibold px-3 whitespace-pre"
        return (
          <div key={i} className={cls}>
            {line || "\u00a0"}
          </div>
        )
      })}
    </div>
  )
}

export interface DiffViewerProps {
  path: string
  diff: string | null
  loading: boolean
  onClose: () => void
}

export function DiffViewer({ path, diff, loading, onClose }: DiffViewerProps): React.ReactElement {
  return (
    <div className="border-border flex min-h-0 flex-1 flex-col border-t bg-background">
      <div className="border-border flex h-7 shrink-0 items-center justify-between border-b px-2 bg-muted/30">
        <span className="text-muted-foreground truncate text-[11px]">{path.split("/").pop()}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground"
          onClick={onClose}
        >
          <X className="size-3" />
        </Button>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        </div>
      ) : diff ? (
        <DiffPane diff={diff} />
      ) : null}
    </div>
  )
}

export { DiffPane }
"use client"

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { serializedStateToMarkdown } from "@/lib/lexical-to-markdown"

export function ImportExportPlugin() {
  const [editor] = useLexicalComposerContext()

  const exportMarkdown = () => {
    const serialized = editor.getEditorState().toJSON()
    const md = serializedStateToMarkdown(serialized)
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `note-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={"ghost"}
          onClick={exportMarkdown}
          title="Export as Markdown"
          aria-label="Export note as Markdown file"
          size={"sm"}
          className="p-2"
        >
          <DownloadIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Export as Markdown</TooltipContent>
    </Tooltip>
  )
}

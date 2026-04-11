'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DownloadIcon } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { convertMarkdownToDocx, downloadDocx } from '@mohtasham/md-to-docx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { serializedStateToMarkdown } from '@/lib/editor/lexical-to-markdown'

const dateString = () => new Date().toISOString().slice(0, 10)

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ImportExportPlugin() {
  const [editor] = useLexicalComposerContext()

  const getMarkdown = () => {
    const serialized = editor.getEditorState().toJSON()
    return serializedStateToMarkdown(serialized)
  }

  const exportMarkdown = () => {
    const md = getMarkdown()
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    downloadBlob(blob, `note-${dateString()}.md`)
  }

  const exportPdf = () => {
    const md = getMarkdown()
    const doc = new jsPDF()
    const lines = doc.splitTextToSize(md, 180)
    doc.text(lines, 14, 20)
    doc.save(`note-${dateString()}.pdf`)
  }

  const exportDoc = async () => {
    const md = getMarkdown()
    const blob = await convertMarkdownToDocx(md)
    downloadDocx(blob, `note-${dateString()}.docx`)
  }

  return (
    <Tooltip>
      <DropdownMenu>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={'ghost'}
              title="Export note"
              aria-label="Export note"
              size={'sm'}
              className="p-2"
            >
              <DownloadIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={exportMarkdown}>Markdown (.md)</DropdownMenuItem>
          <DropdownMenuItem onClick={exportPdf}>PDF (.pdf)</DropdownMenuItem>
          <DropdownMenuItem onClick={exportDoc}>Word (.docx)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent>Export as</TooltipContent>
    </Tooltip>
  )
}

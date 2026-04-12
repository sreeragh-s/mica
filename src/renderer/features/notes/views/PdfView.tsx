import { useEffect, useMemo, useRef, useState, type JSX } from 'react'

import { AlertCircle, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getApi } from '@/bridges/auth/auth-bridge'
import { cn } from '@/lib/utils'

export type PdfViewProps = {
  cwd: string | null
  notePath: string
  title: string
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function PdfView({ cwd, notePath, title }: PdfViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [pageWidth, setPageWidth] = useState(900)
  const [pageCanvases, setPageCanvases] = useState<string[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const viewerTitle = useMemo(() => title.trim() || 'Untitled PDF', [title])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateWidth = (): void => {
      const nextWidth = Math.max(320, Math.floor(el.clientWidth - 48))
      setPageWidth(nextWidth)
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadPdf = async (): Promise<void> => {
      if (!cwd) {
        setLoading(false)
        setError('Workspace path is not available for this PDF.')
        return
      }

      const api = getApi()
      if (!api?.workspace?.readBinaryFile) {
        setLoading(false)
        setError('PDF viewing is unavailable because the workspace file API is missing.')
        return
      }

      setLoading(true)
      setError(null)

      try {
        const [fileResult, pdfjs] = await Promise.all([
          api.workspace.readBinaryFile({ cwd, relativePath: notePath }),
          import('pdfjs-dist/legacy/build/pdf.mjs')
        ])

        if (!fileResult.ok) {
          throw new Error(fileResult.error)
        }

        const workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString()
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

        const doc = await pdfjs.getDocument({
          data: decodeBase64(fileResult.base64)
        }).promise

        const renderedPages: string[] = []
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const page = await doc.getPage(pageNumber)
          const initialViewport = page.getViewport({ scale: 1 })
          const scale = pageWidth / initialViewport.width
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) {
            throw new Error('Could not create a canvas for PDF rendering.')
          }
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          await page.render({
            canvas,
            canvasContext: context,
            viewport
          }).promise
          renderedPages.push(canvas.toDataURL('image/png'))
        }

        if (cancelled) return
        setPageCanvases(renderedPages)
        setPageCount(doc.numPages)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load the PDF.'
        setError(message)
        setPageCanvases([])
        setPageCount(0)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPdf()
    return () => {
      cancelled = true
    }
  }, [cwd, notePath, pageWidth])

  return (
    <div ref={containerRef} className="bg-muted/20 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-border bg-background/80 border-b">
        <div className="flex items-center justify-between gap-3 px-6 py-3">
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-medium">{viewerTitle}</p>
            <p className="text-muted-foreground text-xs">
              {loading ? 'Rendering PDF…' : pageCount > 0 ? `${pageCount} pages` : 'PDF document'}
            </p>
          </div>
          {cwd ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void getApi()?.workspace?.openExternal?.(
                  new URL(notePath, `file://${cwd.replace(/\/?$/, '/')}`).toString()
                )
              }
            >
              Open externally
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-muted-foreground flex min-h-full flex-col items-center justify-center gap-3 text-sm">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            <p>Rendering PDF pages with pdf.js…</p>
          </div>
        ) : error ? (
          <div className="flex min-h-full items-center justify-center">
            <div className="bg-background border-border max-w-md rounded-2xl border px-6 py-5 text-center shadow-sm">
              <AlertCircle className="text-destructive mx-auto mb-3 size-6" aria-hidden />
              <p className="text-foreground text-sm font-medium">Couldn’t open this PDF</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{error}</p>
            </div>
          </div>
        ) : pageCanvases.length === 0 ? (
          <div className="text-muted-foreground flex min-h-full flex-col items-center justify-center gap-3 text-sm">
            <FileText className="size-10 opacity-40" aria-hidden />
            <p>No PDF pages were rendered.</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[960px] flex-col gap-5">
            {pageCanvases.map((src, index) => (
              <div
                key={`${notePath}-page-${index + 1}`}
                className={cn(
                  'bg-background border-border overflow-hidden rounded-2xl border shadow-sm'
                )}
              >
                <img
                  src={src}
                  alt={`${viewerTitle} page ${index + 1}`}
                  className="block h-auto w-full"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { Button } from "@/components/ui/button"
import { DownloadIcon } from "lucide-react"

interface BottomDrawingBarProps {
  onDownload?: () => void
  showDownload?: boolean
}

export function BottomDrawingBar({ onDownload, showDownload = true }: BottomDrawingBarProps) {
  return (
    <div className="bottom-bar bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-full w-full items-center justify-end">
        {showDownload && onDownload && (
          <Button
            size="xs"
            variant="ghost"
            className="size-7"
            onClick={onDownload}
            title="Export as image"
          >
            <DownloadIcon className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
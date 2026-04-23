export function isMarkdownFile(path: string) {
  return path.endsWith(".md")
}

export function isExcalidrawFile(path: string) {
  return path.endsWith(".excalidraw") || path.endsWith(".excalidraw.json")
}

export function isCodeDrawingFile(path: string) {
  return path.endsWith(".codedrawing") || path.endsWith(".codedrawing.json")
}

export function isPdfFile(path: string) {
  return path.toLowerCase().endsWith(".pdf")
}

export function isHtmlFile(path: string) {
  const lower = path.toLowerCase()
  return lower.endsWith(".html") || lower.endsWith(".htm")
}

const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
  ".avif",
  ".heic",
  ".heif",
]

const HEIC_EXTENSIONS = [".heic", ".heif"]

export function isImageFile(path: string) {
  const lower = path.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function isHeicImageFile(path: string) {
  const lower = path.toLowerCase()
  return HEIC_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".ogv",
  ".mkv",
  ".avi",
]

export function isVideoFile(path: string) {
  const lower = path.toLowerCase()
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export type FileTypeIcon =
  | "markdown"
  | "excalidraw"
  | "codedrawing"
  | "pdf"
  | "html"
  | "image"
  | "video"
  | "code"
  | "document"

export function getFileTypeIcon(path: string): FileTypeIcon {
  if (isMarkdownFile(path)) return "markdown"
  if (isExcalidrawFile(path)) return "excalidraw"
  if (isCodeDrawingFile(path)) return "codedrawing"
  if (isPdfFile(path)) return "pdf"
  if (isHtmlFile(path)) return "html"
  if (isImageFile(path)) return "image"
  if (isVideoFile(path)) return "video"

  const lower = path.toLowerCase()
  const codeExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".cpp", ".c", ".h", ".css", ".scss", ".json", ".xml", ".yaml", ".yml", ".toml", ".sh", ".bash", ".zsh"]
  if (codeExtensions.some((ext) => lower.endsWith(ext))) return "code"

  return "document"
}

export function isBrowserUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

export function isSupportedEditorFile(path: string) {
  return (
    isMarkdownFile(path) ||
    isExcalidrawFile(path) ||
    isCodeDrawingFile(path) ||
    isPdfFile(path) ||
    isHtmlFile(path) ||
    isImageFile(path) ||
    isVideoFile(path)
  )
}

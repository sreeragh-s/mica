/**
 * Header-aware markdown chunker.
 *
 * Strategy (header-based + recursive character splitting):
 * 1. Split the document at H1/H2/H3 boundaries, keeping header text in the chunk.
 * 2. If a section exceeds CHUNK_SIZE chars, further split at paragraph/sentence boundaries.
 * 3. Each chunk gets the header breadcrumb prepended so it retains context even in isolation.
 *
 * Target: ~1500 chars per chunk, ~150 char overlap between recursive sub-chunks.
 */

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 150

type Section = {
  heading: string // e.g. "# Title > ## Sub"
  body: string
}

/** Parse markdown into header-scoped sections. */
function splitByHeaders(markdown: string): Section[] {
  const lines = markdown.split('\n')
  const sections: Section[] = []

  const h1h2h3 = /^(#{1,3})\s+(.+)/

  let currentHeadings: string[] = []
  let bodyLines: string[] = []

  function flush(): void {
    const body = bodyLines.join('\n').trim()
    if (body || currentHeadings.length > 0) {
      sections.push({
        heading: currentHeadings.join(' > '),
        body
      })
    }
    bodyLines = []
  }

  for (const line of lines) {
    const m = h1h2h3.exec(line)
    if (m) {
      flush()
      const level = m[1].length // 1, 2, or 3
      const title = m[2].trim()
      // Maintain a breadcrumb at the right depth
      currentHeadings = currentHeadings.slice(0, level - 1)
      currentHeadings[level - 1] = title
    } else {
      bodyLines.push(line)
    }
  }
  flush()

  return sections
}

/** Split a long text into overlapping character windows at paragraph/newline boundaries. */
function splitLargeText(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text]

  const chunks: string[] = []
  // Find natural split points: double newlines (paragraphs), then single newlines, then spaces.
  const separators = ['\n\n', '\n', '. ', ' ']

  let start = 0
  while (start < text.length) {
    let end = Math.min(start + size, text.length)

    if (end < text.length) {
      // Walk back to find a natural boundary.
      let splitAt = -1
      for (const sep of separators) {
        const idx = text.lastIndexOf(sep, end)
        if (idx > start) {
          splitAt = idx + sep.length
          break
        }
      }
      if (splitAt > start) end = splitAt
    }

    chunks.push(text.slice(start, end).trim())

    // Advance with overlap: step back by `overlap` chars but find a clean boundary.
    const nextStart = end - overlap
    if (nextStart <= start) {
      start = end // safety: prevent infinite loop
    } else {
      // Snap to a clean word/line boundary after the overlap point.
      let boundary = -1
      for (const sep of ['\n', ' ']) {
        const idx = text.indexOf(sep, nextStart)
        if (idx !== -1 && idx < end) {
          boundary = idx + 1
          break
        }
      }
      start = boundary > start ? boundary : nextStart
    }
  }

  return chunks.filter((c) => c.length > 0)
}

export type MarkdownChunk = {
  text: string
  /** Human-readable section breadcrumb, e.g. "Introduction > Overview". */
  heading: string
  chunkIndex: number
}

/**
 * Chunk a markdown string into semantically bounded segments suitable for embedding.
 * Returns an empty array if `markdown` is blank.
 */
export function chunkMarkdown(markdown: string): MarkdownChunk[] {
  const trimmed = markdown.trim()
  if (!trimmed) return []

  const sections = splitByHeaders(trimmed)
  const result: MarkdownChunk[] = []

  for (const section of sections) {
    // Compose the full text: heading breadcrumb on top, then body.
    const prefix = section.heading ? `${section.heading}\n\n` : ''
    const full = `${prefix}${section.body}`.trim()
    if (!full) continue

    const subChunks = splitLargeText(full, CHUNK_SIZE, CHUNK_OVERLAP)
    for (const sub of subChunks) {
      if (sub.trim()) {
        result.push({
          text: sub.trim(),
          heading: section.heading,
          chunkIndex: result.length
        })
      }
    }
  }

  return result
}

/** Extract indexable text from an Excalidraw JSON scene. */
export function extractExcalidrawText(json: string): MarkdownChunk[] {
  try {
    const scene = JSON.parse(json) as {
      elements?: { type?: string; text?: string }[]
    }
    if (!Array.isArray(scene.elements)) return []

    const texts = scene.elements
      .filter((el) => el.type === 'text' && typeof el.text === 'string' && el.text.trim())
      .map((el) => el.text!.trim())

    if (texts.length === 0) return []

    // Join all text elements and chunk as if it were a flat document.
    const combined = texts.join('\n\n')
    return splitLargeText(combined, CHUNK_SIZE, CHUNK_OVERLAP)
      .filter((t) => t.trim())
      .map((text, i) => ({ text: text.trim(), heading: '', chunkIndex: i }))
  } catch {
    return []
  }
}

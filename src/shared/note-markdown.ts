export type ParsedFrontmatter = {
  hasFrontmatterBlock: boolean
  properties: Record<string, string>
  body: string
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    return JSON.parse(trimmed) as string
  } catch {
    return trimmed.replace(/^["']|["']$/g, "")
  }
}

function quoteYamlScalar(value: string): string {
  return JSON.stringify(value)
}

export function parseOptionalFrontmatter(markdown: string): ParsedFrontmatter {
  if (!markdown.startsWith("---\n")) {
    return { hasFrontmatterBlock: false, properties: {}, body: markdown }
  }

  const end = markdown.indexOf("\n---\n", 4)
  if (end === -1) {
    return { hasFrontmatterBlock: false, properties: {}, body: markdown }
  }

  const rawFrontmatter = markdown.slice(4, end)
  const body = markdown.slice(end + 5)
  const properties: Record<string, string> = {}

  for (const rawLine of rawFrontmatter.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1)
    if (!key) continue
    properties[key] = unquoteYamlScalar(value)
  }

  return {
    hasFrontmatterBlock: true,
    properties,
    body,
  }
}

export function buildMarkdownWithOptionalFrontmatter(args: {
  hasFrontmatterBlock: boolean
  properties?: Record<string, string | null | undefined>
  body: string
}): string {
  const normalizedBody = args.body.replace(/^\n+/, "")
  const entries = Object.entries(args.properties ?? {}).filter(
    ([key, value]) => key.trim().length > 0 && value != null
  ) as Array<[string, string]>

  if (entries.length === 0) {
    return normalizedBody
  }

  const frontmatterLines = entries.map(([key, value]) => `${key}: ${quoteYamlScalar(value)}`)
  const frontmatter = frontmatterLines.length > 0 ? `${frontmatterLines.join("\n")}\n` : ""
  return `---\n${frontmatter}---\n\n${normalizedBody}`
}

export function stripLeadingTitleHeading(markdown: string): {
  heading: string | null
  body: string
} {
  const normalized = markdown.replace(/^\n+/, "")
  const match = normalized.match(/^#\s+(.+?)\s*(?:\n+|$)/)
  if (!match) {
    return { heading: null, body: normalized }
  }
  return {
    heading: match[1]!.trim(),
    body: normalized.slice(match[0].length),
  }
}

export function buildMarkdownNoteBody(title: string, bodyMarkdown: string): string {
  const trimmedTitle = title.trim() || "Untitled"
  const normalizedBody = bodyMarkdown.replace(/^\n+/, "").trim()
  return normalizedBody
    ? `# ${trimmedTitle}\n\n${normalizedBody}\n`
    : `# ${trimmedTitle}\n`
}

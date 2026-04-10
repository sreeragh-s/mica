export type NotePropertyValue = string | string[]

export type NotePropertyMap = Record<string, NotePropertyValue>

export type ParsedFrontmatter = {
  hasFrontmatterBlock: boolean
  properties: NotePropertyMap
  body: string
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed) as string
  } catch {
    return trimmed.replace(/^["']|["']$/g, '')
  }
}

function quoteYamlScalar(value: string): string {
  return JSON.stringify(value)
}

/** Split inner of `[a, "b, c"]` by top-level commas (respects quotes). */
function splitYamlFlowSequence(inner: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote: '"' | "'" | null = null
  for (let k = 0; k < inner.length; k++) {
    const ch = inner[k]!
    if (inQuote) {
      cur += ch
      if (ch === inQuote) inQuote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      cur += ch
      continue
    }
    if (ch === ',') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function formatYamlBlockListItem(value: string): string {
  const t = value.trim()
  if (t === '' || /[:#[\]{}]|^\[/.test(t) || /\s/.test(t)) {
    return quoteYamlScalar(t)
  }
  return t
}

export function parseOptionalFrontmatter(markdown: string): ParsedFrontmatter {
  if (!markdown.startsWith('---\n')) {
    return { hasFrontmatterBlock: false, properties: {}, body: markdown }
  }

  const end = markdown.indexOf('\n---\n', 4)
  if (end === -1) {
    return { hasFrontmatterBlock: false, properties: {}, body: markdown }
  }

  const rawFrontmatter = markdown.slice(4, end)
  const body = markdown.slice(end + 5)
  const properties: NotePropertyMap = {}

  const lines = rawFrontmatter.split('\n')
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]!
    const lineTrim = raw.trim()
    if (!lineTrim) {
      i++
      continue
    }
    const colon = lineTrim.indexOf(':')
    if (colon <= 0) {
      i++
      continue
    }
    const key = lineTrim.slice(0, colon).trim()
    if (!key) {
      i++
      continue
    }
    let rest = lineTrim.slice(colon + 1).trim()
    const baseIndent = raw.length - raw.trimStart().length

    // Block list: key:\n  - a\n  - b
    if (rest === '') {
      const items: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const L = lines[j]!
        if (L.trim() === '') {
          j++
          continue
        }
        const ind = L.length - L.trimStart().length
        if (ind <= baseIndent) break
        const tm = L.trim()
        const dash = tm.match(/^-\s+(.+)$/)
        if (!dash) break
        items.push(unquoteYamlScalar(dash[1]!))
        j++
      }
      if (items.length > 0) {
        properties[key] = items
        i = j
        continue
      }
    }

    // Flow sequence: [a, b, "c"]
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim()
      if (inner === '') {
        properties[key] = []
        i++
        continue
      }
      const parts = splitYamlFlowSequence(inner)
      properties[key] = parts.map((p) => unquoteYamlScalar(p))
      i++
      continue
    }

    properties[key] = unquoteYamlScalar(rest)
    i++
  }

  return {
    hasFrontmatterBlock: true,
    properties,
    body
  }
}

export function buildMarkdownWithOptionalFrontmatter(args: {
  hasFrontmatterBlock: boolean
  properties?: NotePropertyMap | null | undefined
  body: string
}): string {
  const normalizedBody = args.body.replace(/^\n+/, '')
  const entries = Object.entries(args.properties ?? {}).filter(([key, value]) => {
    if (key.trim().length === 0) return false
    if (value == null) return false
    if (Array.isArray(value)) return value.length > 0
    return true
  }) as Array<[string, NotePropertyValue]>

  if (entries.length === 0) {
    return normalizedBody
  }

  const frontmatterLines: string[] = []
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      frontmatterLines.push(`${key}:`)
      for (const item of value) {
        frontmatterLines.push(`  - ${formatYamlBlockListItem(item)}`)
      }
    } else {
      frontmatterLines.push(`${key}: ${quoteYamlScalar(value)}`)
    }
  }
  const frontmatter = `${frontmatterLines.join('\n')}\n`
  return `---\n${frontmatter}---\n\n${normalizedBody}`
}

export function stripLeadingTitleHeading(markdown: string): {
  heading: string | null
  body: string
} {
  const normalized = markdown.replace(/^\n+/, '')
  const match = normalized.match(/^#\s+(.+?)\s*(?:\n+|$)/)
  if (!match) {
    return { heading: null, body: normalized }
  }
  return {
    heading: match[1]!.trim(),
    body: normalized.slice(match[0].length)
  }
}

export function buildMarkdownNoteBody(title: string, bodyMarkdown: string): string {
  const trimmedTitle = title.trim() || 'Untitled'
  const normalizedBody = bodyMarkdown.replace(/^\n+/, '').trim()
  return normalizedBody ? `# ${trimmedTitle}\n\n${normalizedBody}\n` : `# ${trimmedTitle}\n`
}

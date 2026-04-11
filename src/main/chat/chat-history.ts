import { app, ipcMain } from 'electron'
import { mkdir, writeFile, readFile, readdir } from 'fs/promises'
import { join } from 'path'

const LOG = '[chat-history]'

function chatHistoryDir(): string {
  return join(app.getPath('userData'), 'notelab-chat-history')
}

function sessionFilePath(sessionId: string): string {
  return join(chatHistoryDir(), `${sessionId}.md`)
}

async function ensureDir(): Promise<void> {
  await mkdir(chatHistoryDir(), { recursive: true })
}

export type ChatHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sources?: ChatSourceMeta[]
  chainOfThoughts?: ChainOfThoughtsMeta
}

export type ChatSourceMeta = {
  note: string
  title: string
  folder: string
  chunkText: string
  score?: number
  source?: string
}

export type ChainOfThoughtsMeta = {
  stage: string
  mode: string
  seedNotes: string[]
  connectedNotes: string[]
  finalNotes: string[]
}

export type ChatHistorySession = {
  sessionId: string
  title: string
  createdAt: number
  messages: ChatHistoryMessage[]
}

export type ChatHistoryMeta = {
  sessionId: string
  title: string
  createdAt: number
  messageCount: number
}

function buildMarkdown(payload: ChatHistorySession): string {
  const date = new Date(payload.createdAt).toISOString()
  const lines: string[] = [
    `---`,
    `id: ${payload.sessionId}`,
    `title: ${payload.title.replace(/\n/g, ' ')}`,
    `created: ${date}`,
    `messages: ${payload.messages.length}`,
    `---`,
    ``,
    `# ${payload.title}`,
    ``,
    `*${new Date(payload.createdAt).toLocaleString()}*`,
    ``
  ]
  for (const msg of payload.messages) {
    const role = msg.role === 'user' ? '**You**' : '**Assistant**'
    const time = new Date(msg.timestamp).toLocaleString()
    lines.push(`### ${role}`, `*${time}*`, ``, msg.content, ``)

    if (msg.sources && msg.sources.length > 0) {
      lines.push(`---`, `sources:`)
      for (const src of msg.sources) {
        const chunkText = src.chunkText.replace(/"/g, '\\"').replace(/\n/g, '\\n')
        lines.push(
          `  - note: "${src.note}"`,
          `    title: "${src.title.replace(/"/g, '\\"')}"`,
          `    folder: "${src.folder.replace(/"/g, '\\"')}"`,
          `    chunkText: "${chunkText}"`,
          src.score !== undefined ? `    score: ${src.score}` : '',
          src.source ? `    source: "${src.source}"` : ''
        )
      }
    } else {
      lines.push(`---`, `sources: []`)
    }

    if (msg.chainOfThoughts) {
      const cot = msg.chainOfThoughts
      lines.push(
        `chainOfThoughts:`,
        `  stage: "${cot.stage}"`,
        `  mode: "${cot.mode}"`,
        `  seedNotes: [${cot.seedNotes.map((n) => `"${n}"`).join(', ')}]`,
        `  connectedNotes: [${cot.connectedNotes.map((n) => `"${n}"`).join(', ')}]`,
        `  finalNotes: [${cot.finalNotes.map((n) => `"${n}"`).join(', ')}]`
      )
    } else {
      lines.push(`chainOfThoughts: null`)
    }

    lines.push(`---`, ``)
  }
  return lines.join('\n')
}

function parseSessionMeta(content: string, sessionId: string): ChatHistoryMeta {
  const titleMatch = content.match(/^title: (.+)$/m)
  const createdMatch = content.match(/^created: (.+)$/m)
  const messagesMatch = content.match(/^messages: (\d+)$/m)
  return {
    sessionId,
    title: titleMatch?.[1]?.trim() ?? 'Chat session',
    createdAt: createdMatch?.[1] ? new Date(createdMatch[1].trim()).getTime() : 0,
    messageCount: messagesMatch?.[1] ? parseInt(messagesMatch[1], 10) : 0
  }
}

/** Inverse of {@link buildMarkdown} — restores structured messages for the chat UI. */
export function parseSessionMarkdown(content: string): ChatHistorySession | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return null

  const fm = fmMatch[1]
  const idLine = fm.match(/^id: (.+)$/m)?.[1]?.trim() ?? ''
  const title = fm.match(/^title: (.+)$/m)?.[1]?.trim() ?? 'Chat session'
  const createdRaw = fm.match(/^created: (.+)$/m)?.[1]?.trim()
  const createdAt = createdRaw ? new Date(createdRaw).getTime() : Date.now()

  const afterFm = content.slice(fmMatch[0].length)
  const msgSep = '\n\n---\n\n'
  const msgSepIdx = afterFm.indexOf(msgSep)
  if (msgSepIdx === -1) {
    return { sessionId: idLine, title, createdAt, messages: [] }
  }

  let msgText = afterFm.slice(msgSepIdx + msgSep.length).trimStart()
  const messages: ChatHistoryMessage[] = []

  while (msgText.length > 0) {
    const roleMatch = msgText.match(/^### \*\*(You|Assistant)\*\*/)
    if (!roleMatch) break

    const role: 'user' | 'assistant' = roleMatch[1] === 'You' ? 'user' : 'assistant'
    let pos = roleMatch[0].length

    const rest = msgText.slice(pos)
    const timeMatch = rest.match(/^\n\*([^*]+)\*\n\n/)
    if (!timeMatch) break

    let timestamp = Date.parse(timeMatch[1].trim())
    if (Number.isNaN(timestamp)) {
      timestamp = Date.now()
    }
    pos += timeMatch[0].length

    const bodyStart = msgText.indexOf('\n\n---\nsources:', pos)
    const bodyEnd = bodyStart === -1 ? msgText.indexOf('\n\n---', pos) : bodyStart

    const body = bodyStart === -1 ? msgText.slice(pos).trim() : msgText.slice(pos, bodyEnd).trim()

    let sources: ChatSourceMeta[] | undefined
    let chainOfThoughts: ChainOfThoughtsMeta | undefined

    const yamlStart = msgText.indexOf('\n\n---\nsources:', pos)
    if (yamlStart !== -1) {
      const yamlBlockStart = yamlStart + '\n\n---\nsources:'.length
      const yamlBlockEnd = msgText.indexOf('\n\n---\n\n###', yamlBlockStart)
      const yamlBlock =
        yamlBlockEnd === -1
          ? msgText.slice(yamlBlockStart).trim()
          : msgText.slice(yamlBlockStart, yamlBlockEnd).trim()

      sources = parseSourcesYaml(yamlBlock)
      chainOfThoughts = parseChainOfThoughtsYaml(yamlBlock)
    }

    messages.push({
      role,
      content: body,
      timestamp,
      sources,
      chainOfThoughts
    })

    const nextMsgIdx = msgText.indexOf('\n\n### **', pos)
    if (nextMsgIdx === -1) break
    msgText = msgText.slice(nextMsgIdx + 2)
  }

  return { sessionId: idLine, title, createdAt, messages }
}

function parseSourcesYaml(yamlBlock: string): ChatSourceMeta[] | undefined {
  const sourcesStart = yamlBlock.indexOf('sources:')
  if (sourcesStart === -1) return undefined

  const afterSources = yamlBlock.slice(sourcesStart + 'sources:'.length).trimStart()
  if (afterSources.startsWith('[]')) return []

  const sources: ChatSourceMeta[] = []
  const lines = afterSources.split('\n')
  let current: Partial<ChatSourceMeta> | null = null

  for (const line of lines) {
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0
    if (indent === 0) continue

    const trimmed = line.trim()
    if (trimmed.startsWith('- note:')) {
      if (current && current.note) sources.push(current as ChatSourceMeta)
      current = { note: trimmed.replace('- note:', '').trim().replace(/^"|"$/g, '') }
    } else if (trimmed.startsWith('title:')) {
      current!.title = trimmed.replace('title:', '').trim().replace(/^"|"$/g, '')
    } else if (trimmed.startsWith('folder:')) {
      current!.folder = trimmed.replace('folder:', '').trim().replace(/^"|"$/g, '')
    } else if (trimmed.startsWith('chunkText:')) {
      current!.chunkText = trimmed
        .replace('chunkText:', '')
        .trim()
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
    } else if (trimmed.startsWith('score:')) {
      current!.score = parseFloat(trimmed.replace('score:', '').trim())
    } else if (trimmed.startsWith('source:')) {
      current!.source = trimmed.replace('source:', '').trim().replace(/^"|"$/g, '')
    }
  }
  if (current && current.note) sources.push(current as ChatSourceMeta)

  return sources.length > 0 ? sources : undefined
}

function parseChainOfThoughtsYaml(yamlBlock: string): ChainOfThoughtsMeta | undefined {
  const cotStart = yamlBlock.indexOf('chainOfThoughts:')
  if (cotStart === -1) return undefined

  const afterCot = yamlBlock.slice(cotStart + 'chainOfThoughts:'.length).trimStart()
  if (afterCot.startsWith('null')) return undefined

  const stageMatch = afterCot.match(/stage:\s*"([^"]+)"/)
  const modeMatch = afterCot.match(/mode:\s*"([^"]+)"/)
  const seedMatch = afterCot.match(/seedNotes:\s*\[(.*?)\]/)
  const connectedMatch = afterCot.match(/connectedNotes:\s*\[(.*?)\]/)
  const finalMatch = afterCot.match(/finalNotes:\s*\[(.*?)\]/)

  if (!stageMatch || !modeMatch) return undefined

  const parseNotes = (match: RegExpMatchArray | null): string[] => {
    if (!match) return []
    return match[1]
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
  }

  return {
    stage: stageMatch[1],
    mode: modeMatch[1],
    seedNotes: parseNotes(seedMatch),
    connectedNotes: parseNotes(connectedMatch),
    finalNotes: parseNotes(finalMatch)
  }
}

export function registerChatHistoryIpc(): void {
  ipcMain.handle(
    'chat-history:write',
    async (
      _evt,
      payload: ChatHistorySession
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      console.info(LOG, 'writing session', payload.sessionId, `"${payload.title}"`)
      try {
        await ensureDir()
        const md = buildMarkdown(payload)
        await writeFile(sessionFilePath(payload.sessionId), md, 'utf8')
        console.info(LOG, 'wrote', sessionFilePath(payload.sessionId))
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'write failed:', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'chat-history:list',
    async (): Promise<{ ok: true; sessions: ChatHistoryMeta[] } | { ok: false; error: string }> => {
      console.info(LOG, 'listing sessions in', chatHistoryDir())
      try {
        await ensureDir()
        const files = await readdir(chatHistoryDir())
        const mdFiles = files.filter((f) => f.endsWith('.md'))
        console.info(LOG, `found ${mdFiles.length} session file(s)`)
        const sessions = await Promise.all(
          mdFiles.map(async (f) => {
            const content = await readFile(join(chatHistoryDir(), f), 'utf8')
            return parseSessionMeta(content, f.slice(0, -3))
          })
        )
        sessions.sort((a, b) => b.createdAt - a.createdAt)
        return { ok: true, sessions }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'list failed:', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'chat-history:read',
    async (
      _evt,
      sessionId: string
    ): Promise<{ ok: true; content: string } | { ok: false; error: string }> => {
      console.info(LOG, 'reading session', sessionId)
      try {
        const content = await readFile(sessionFilePath(sessionId), 'utf8')
        return { ok: true, content }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'read failed:', msg)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'chat-history:read-session',
    async (
      _evt,
      sessionId: string
    ): Promise<{ ok: true; session: ChatHistorySession } | { ok: false; error: string }> => {
      console.info(LOG, 'reading session (parsed)', sessionId)
      try {
        const content = await readFile(sessionFilePath(sessionId), 'utf8')
        const session = parseSessionMarkdown(content)
        if (!session) {
          return { ok: false, error: 'Could not parse chat history file' }
        }
        return { ok: true, session }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(LOG, 'read-session failed:', msg)
        return { ok: false, error: msg }
      }
    }
  )
}

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
    ``,
    `---`,
    ``
  ]
  for (const msg of payload.messages) {
    const role = msg.role === 'user' ? '**You**' : '**Assistant**'
    const time = new Date(msg.timestamp).toLocaleString()
    lines.push(`### ${role}`, `*${time}*`, ``, msg.content, ``, `---`, ``)
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
  const sep = '\n\n---\n\n'
  const sepIdx = afterFm.indexOf(sep)
  if (sepIdx === -1) {
    return { sessionId: idLine, title, createdAt, messages: [] }
  }

  let msgText = afterFm.slice(sepIdx + sep.length).trimStart()
  const messages: ChatHistoryMessage[] = []
  let pos = 0
  let i = 0

  while (pos < msgText.length) {
    const slice = msgText.slice(pos)
    const roleMatch = slice.match(/^### \*\*(You|Assistant)\*\*/)
    if (!roleMatch) {
      const next = msgText.indexOf('\n\n### **', pos)
      if (next === -1) break
      pos = next + 2
      continue
    }

    const role: 'user' | 'assistant' = roleMatch[1] === 'You' ? 'user' : 'assistant'
    pos += roleMatch[0].length
    const rest = msgText.slice(pos)
    const timeMatch = rest.match(/^\n\*([^*]+)\*\n\n/)
    if (!timeMatch) break

    let timestamp = Date.parse(timeMatch[1].trim())
    if (Number.isNaN(timestamp)) {
      timestamp = createdAt + i * 1000
    }
    pos += timeMatch[0].length

    const endDelim = msgText.indexOf('\n\n---\n\n', pos)
    const contentEnd = endDelim === -1 ? msgText.length : endDelim
    let body = msgText.slice(pos, contentEnd)
    if (body.endsWith('\n')) body = body.slice(0, -1)

    messages.push({ role, content: body, timestamp })
    pos = endDelim === -1 ? msgText.length : endDelim + sep.length
    i++
  }

  return { sessionId: idLine, title, createdAt, messages }
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

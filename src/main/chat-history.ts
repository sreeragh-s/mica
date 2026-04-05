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
    ``,
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
    messageCount: messagesMatch?.[1] ? parseInt(messagesMatch[1], 10) : 0,
  }
}

export function registerChatHistoryIpc(): void {
  ipcMain.handle(
    'chat-history:write',
    async (_evt, payload: ChatHistorySession): Promise<{ ok: true } | { ok: false; error: string }> => {
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
    async (): Promise<
      | { ok: true; sessions: ChatHistoryMeta[] }
      | { ok: false; error: string }
    > => {
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
    async (_evt, sessionId: string): Promise<
      | { ok: true; content: string }
      | { ok: false; error: string }
    > => {
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
}

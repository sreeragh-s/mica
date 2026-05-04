import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export type CliProvider = {
  id: "codex" | "opencode" | "claude" | (string & {})
  name: string
  logoProvider: string
  installed: boolean
  version: string | null
  error: string | null
}

export type CliProviderModel = {
  id: string
  name: string
}

export type CliChatMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

type CliChatChunkPayload = {
  chatId: string
  delta: string
  done: boolean
  error: string | null
}

type CliChatLogPayload = {
  chatId: string
  providerId: string
  level: "debug" | "info" | "error" | (string & {})
  message: string
}

type CliChatFileChangedPayload = {
  chatId: string
  path: string
}

export type SmoothStreamOptions = {
  delayInMs?: number | null
  chunking?: "word" | "line" | RegExp
}

export type StreamCliChatOptions = {
  chatId: string
  providerId: string
  model?: string | null
  cwd?: string | null
  messages: CliChatMessage[]
  onDelta: (delta: string) => void
  onFileChanged?: (path: string) => void
  onLog?: (payload: CliChatLogPayload) => void
  signal?: AbortSignal
  smooth?: SmoothStreamOptions | false
}

const CHUNKING_REGEXPS = {
  word: /\S+\s+/m,
  line: /\n+/m,
}

function createSmoother(options: SmoothStreamOptions, onEmit: (text: string) => void) {
  const delayInMs = options.delayInMs ?? 10
  const chunking = options.chunking ?? "word"
  const regex = chunking instanceof RegExp ? chunking : CHUNKING_REGEXPS[chunking]

  let buffer = ""
  let queue: Promise<void> = Promise.resolve()
  let finished = false

  const delay = (ms: number | null) =>
    ms == null || ms <= 0
      ? Promise.resolve()
      : new Promise<void>(resolve => setTimeout(resolve, ms))

  const drain = async () => {
    let match: RegExpExecArray | null
    while (!finished && (match = regex.exec(buffer)) != null) {
      const slice = buffer.slice(0, match.index) + match[0]
      buffer = buffer.slice(slice.length)
      onEmit(slice)
      await delay(delayInMs)
    }
  }

  return {
    push(text: string) {
      if (!text) return
      buffer += text
      queue = queue.then(drain)
    },
    async flush() {
      await queue
      if (!finished && buffer.length > 0) {
        onEmit(buffer)
        buffer = ""
      }
    },
    cancel() {
      finished = true
      buffer = ""
    },
  }
}

export function listCliProviders() {
  return invoke<CliProvider[]>("list_cli_providers")
}

export function listCliProviderModels(providerId: string) {
  return invoke<CliProviderModel[]>("list_cli_provider_models", { providerId })
}

export async function streamCliChat({
  chatId,
  providerId,
  model,
  cwd,
  messages,
  onDelta,
  onFileChanged,
  onLog,
  signal,
  smooth,
}: StreamCliChatOptions): Promise<void> {
  const unlistenRef: { current: UnlistenFn | null } = { current: null }
  const logUnlistenRef: { current: UnlistenFn | null } = { current: null }
  const fileChangedUnlistenRef: { current: UnlistenFn | null } = { current: null }
  let settled = false

  const cleanup = () => {
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }
    if (logUnlistenRef.current) {
      logUnlistenRef.current()
      logUnlistenRef.current = null
    }
    if (fileChangedUnlistenRef.current) {
      fileChangedUnlistenRef.current()
      fileChangedUnlistenRef.current = null
    }
  }

  const smoother = smooth === false ? null : createSmoother(smooth ?? {}, onDelta)

  const pushDelta = (delta: string) => {
    if (smoother) {
      smoother.push(delta)
    } else {
      onDelta(delta)
    }
  }

  const completion = new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      settled = true
      smoother?.cancel()
      cleanup()
      reject(new DOMException("Chat request was cancelled.", "AbortError"))
    }

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener("abort", onAbort, { once: true })
    }

    listen<CliChatChunkPayload>(`cli-chat-chunk:${chatId}`, event => {
      const payload = event.payload
      if (payload.error) {
        settled = true
        smoother?.cancel()
        cleanup()
        reject(new Error(payload.error))
        return
      }

      if (payload.delta) {
        pushDelta(payload.delta)
      }

      if (payload.done) {
        settled = true
        cleanup()
        resolve()
      }
    })
      .then(stopListening => {
        if (settled) {
          stopListening()
          return
        }
        unlistenRef.current = stopListening
      })
      .catch(reject)

    listen<CliChatLogPayload>(`cli-chat-log:${chatId}`, event => {
      const payload = event.payload
      onLog?.(payload)
      const log = payload.level === "error" ? console.error : console.debug
      log(
        `[cli-chat:${payload.providerId}:${payload.chatId}:${payload.level}] ${payload.message}`,
      )
    })
      .then(stopListening => {
        if (settled) {
          stopListening()
          return
        }
        logUnlistenRef.current = stopListening
      })
      .catch(error => {
        console.debug("[cli-chat] failed to attach log listener", error)
      })

    listen<CliChatFileChangedPayload>(`cli-chat-file-changed:${chatId}`, event => {
      const payload = event.payload
      console.debug("[cli-chat] changed file event", payload)
      onFileChanged?.(payload.path)
    })
      .then(stopListening => {
        if (settled) {
          stopListening()
          return
        }
        fileChangedUnlistenRef.current = stopListening
      })
      .catch(error => {
        console.debug("[cli-chat] failed to attach changed file listener", error)
      })
  })

  try {
    console.debug("[cli-chat] invoking provider stream", {
      chatId,
      providerId,
      model,
      cwd,
      messages: messages.length,
    })
    await Promise.all([
      invoke<void>("chat_with_cli_provider_stream", {
        chatId,
        providerId,
        model,
        cwd,
        messages,
      }),
      completion,
    ])
    if (smoother) {
      await smoother.flush()
    }
  } catch (error) {
    smoother?.cancel()
    throw error
  } finally {
    cleanup()
  }
}

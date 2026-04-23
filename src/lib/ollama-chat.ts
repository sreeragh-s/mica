import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export type OllamaChatMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

type OllamaChunkPayload = {
  chatId: string
  delta: string
  done: boolean
  error: string | null
}

export type SmoothStreamOptions = {
  delayInMs?: number | null
  chunking?: "word" | "line" | RegExp
}

export type StreamOllamaChatOptions = {
  chatId: string
  model: string
  messages: OllamaChatMessage[]
  onDelta: (delta: string) => void
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

export async function streamOllamaChat({
  chatId,
  model,
  messages,
  onDelta,
  signal,
  smooth,
}: StreamOllamaChatOptions): Promise<void> {
  const unlistenRef: { current: UnlistenFn | null } = { current: null }
  let settled = false

  const cleanup = () => {
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }
  }

  const smoother =
    smooth === false ? null : createSmoother(smooth ?? {}, onDelta)

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

    listen<OllamaChunkPayload>(`ollama-chat-chunk:${chatId}`, event => {
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
  })

  try {
    await Promise.all([
      invoke<void>("chat_with_ollama_stream", {
        chatId,
        model,
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

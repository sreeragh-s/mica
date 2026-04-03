/// <reference types="vite/client" />

/** Web Speech API (Chromium / Electron) — not always in TS lib. */
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  addEventListener(
    type: "result",
    listener: (ev: SpeechRecognitionEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: "end",
    listener: (ev: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: "error",
    listener: (ev: SpeechRecognitionErrorEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

interface ImportMetaEnv {
  /** Same base URL as Worker `BETTER_AUTH_URL` (used in UI hints only; auth runs in the main process). */
  readonly VITE_AUTH_URL?: string
  /** Set to `"true"` to show the speech-to-text toolbar control (Web Speech API). */
  readonly VITE_ENABLE_SPEECH_TO_TEXT?: string
  /** Set to `"true"` to show the share-content toolbar control. */
  readonly VITE_ENABLE_SHARE_CONTENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

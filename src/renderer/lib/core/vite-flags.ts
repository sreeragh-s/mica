/** Vite `import.meta.env` helpers (strings only at build time). */

export const enableSpeechToText = import.meta.env.VITE_ENABLE_SPEECH_TO_TEXT === 'true'

export const enableShareContent = import.meta.env.VITE_ENABLE_SHARE_CONTENT === 'true'

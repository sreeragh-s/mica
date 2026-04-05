import type { NotelabApi } from '@/lib/auth-bridge'

function getClipboardBridge(): NotelabApi['clipboard'] | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { api?: NotelabApi }
  return w.api?.clipboard ?? null
}

function copyViaExecCommand(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  ta.style.top = '0'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(ta)
  }
}

/**
 * Copies plain text to the system clipboard. Prefer this over `navigator.clipboard.writeText`
 * alone: packaged Electron loads `file://` pages where the Async Clipboard API often fails.
 */
export async function copyPlainTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Non-secure contexts (e.g. file://) reject; try fallbacks.
    }
  }

  const bridge = getClipboardBridge()
  if (bridge?.writeText) {
    const res = await bridge.writeText(text)
    if (res.ok) return
  }

  if (copyViaExecCommand(text)) return

  throw new Error('All clipboard copy strategies failed')
}

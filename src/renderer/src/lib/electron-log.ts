import { getApi } from '@/lib/auth-bridge'

type LogLevel = 'info' | 'warn' | 'error'

function normalizeArg(value: unknown): string | number | boolean | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Error) {
    return value.stack ?? value.message
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function createElectronLogger(scope: string): {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
} {
  const emit = (level: LogLevel, ...args: unknown[]): void => {
    const consoleMethod =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
    consoleMethod(scope, ...args)
    const logger = getApi()?.log?.[level]
    if (!logger) return
    logger(scope, ...args.map(normalizeArg))
  }

  return {
    info: (...args: unknown[]) => emit('info', ...args),
    warn: (...args: unknown[]) => emit('warn', ...args),
    error: (...args: unknown[]) => emit('error', ...args),
  }
}

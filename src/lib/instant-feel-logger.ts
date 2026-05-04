const PREFIX = "[InstantFeel]"

type LogDetails = Record<string, unknown> | undefined

function formatMessage(message: string) {
  return `${PREFIX} ${message}`
}

export function logInstantFeel(message: string, details?: LogDetails) {
  if (details) {
    console.info(formatMessage(message), details)
    return
  }
  console.info(formatMessage(message))
}

export function warnInstantFeel(message: string, details?: LogDetails) {
  if (details) {
    console.warn(formatMessage(message), details)
    return
  }
  console.warn(formatMessage(message))
}

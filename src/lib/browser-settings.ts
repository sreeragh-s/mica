export const BROWSER_SETTINGS_STORAGE_KEY = "browser-settings"
export const BROWSER_SETTINGS_EVENT = "browser-settings-changed"
export const OPEN_IN_APP_BROWSER_EVENT = "open-in-app-browser"
export const UPDATE_BROWSER_TAB_EVENT = "update-browser-tab"

export type BrowserTabUpdate = {
  path: string
  name?: string
  faviconUrl?: string | null
}

type StoredBrowserSettings = {
  openLinksInApp?: boolean
}

const DEFAULT_OPEN_LINKS_IN_APP = false

export function loadOpenLinksInApp(): boolean {
  if (typeof window === "undefined") {
    return DEFAULT_OPEN_LINKS_IN_APP
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_OPEN_LINKS_IN_APP
    }

    const parsed = JSON.parse(raw) as StoredBrowserSettings
    if (typeof parsed.openLinksInApp !== "boolean") {
      return DEFAULT_OPEN_LINKS_IN_APP
    }

    return parsed.openLinksInApp
  } catch {
    return DEFAULT_OPEN_LINKS_IN_APP
  }
}

export function saveOpenLinksInApp(value: boolean) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(
    BROWSER_SETTINGS_STORAGE_KEY,
    JSON.stringify({ openLinksInApp: value } satisfies StoredBrowserSettings),
  )
  window.dispatchEvent(
    new CustomEvent(BROWSER_SETTINGS_EVENT, { detail: { openLinksInApp: value } }),
  )
}

export function requestOpenInAppBrowser(url: string) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent(OPEN_IN_APP_BROWSER_EVENT, { detail: { url } }),
  )
}

export function requestBrowserTabUpdate(update: BrowserTabUpdate) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent(UPDATE_BROWSER_TAB_EVENT, { detail: update }),
  )
}

export function getFaviconUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return `${parsed.protocol}//${parsed.hostname}/favicon.ico`
  } catch {
    return null
  }
}

export function getDisplayNameForUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname || url
  } catch {
    return url
  }
}

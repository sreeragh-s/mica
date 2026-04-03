import { BrowserWindow, ipcMain, session } from 'electron'

const AUTH_PARTITION = 'persist:gitnotes-auth'
const LOG = '[gitnotes-auth]'

function baseUrl(): string {
  const u = __APP_AUTH_URL__ ?? ''
  return u.replace(/\/$/, '')
}

/** Better Auth validates `Origin` when the request carries cookies; Electron `fetch` omits it by default. */
function jsonHeadersWithOrigin(base: string): HeadersInit {
  const origin = new URL(base).origin
  return {
    'Content-Type': 'application/json',
    Origin: origin,
  }
}

export function registerAuthIpc(): void {
  // Session APIs are only valid after `app.whenReady()` — do not call at module load.
  const authSession = session.fromPartition(AUTH_PARTITION)

  ipcMain.handle('auth:get-session', async () => {
    const base = baseUrl()
    if (!base) return { ok: false as const, error: 'missing_env' }
    try {
      const res = await authSession.fetch(`${base}/api/auth/get-session`)
      const data = (await res.json()) as unknown
      return { ok: true as const, data }
    } catch (e) {
      return { ok: false as const, error: String(e) }
    }
  })

  ipcMain.handle('auth:sign-in-github', async () => {
    const base = baseUrl()
    if (!base) {
      throw new Error('Set VITE_AUTH_URL in gitnotes/.env (Worker / tunnel base URL)')
    }

    const signInUrl = `${base}/api/auth/sign-in/social`
    const payload = {
      provider: 'github',
      disableRedirect: true,
      callbackURL: `${base}/`,
    }
    console.info(LOG, 'POST', signInUrl, { callbackURL: payload.callbackURL })

    const res = await authSession.fetch(signInUrl, {
      method: 'POST',
      headers: jsonHeadersWithOrigin(base),
      body: JSON.stringify(payload),
    })

    const rawText = await res.text()
    console.info(LOG, 'sign-in/social response', res.status, rawText.slice(0, 2000))

    if (!res.ok) {
      throw new Error(`Sign-in failed (${res.status}): ${rawText}`)
    }

    let body: { url?: string; redirect?: boolean }
    try {
      body = JSON.parse(rawText) as { url?: string; redirect?: boolean }
    } catch {
      throw new Error(`Bad JSON from sign-in: ${rawText.slice(0, 500)}`)
    }

    if (!body.url) throw new Error('No OAuth URL from server')

    let oauthUrl: URL
    try {
      oauthUrl = new URL(body.url)
    } catch {
      console.error(LOG, 'Invalid OAuth URL string:', body.url)
      throw new Error('Server returned an invalid OAuth URL')
    }
    console.info(LOG, 'Opening OAuth URL:', {
      href: oauthUrl.href,
      host: oauthUrl.host,
      pathname: oauthUrl.pathname,
      client_id: oauthUrl.searchParams.get('client_id'),
      redirect_uri: oauthUrl.searchParams.get('redirect_uri'),
      scope: oauthUrl.searchParams.get('scope'),
      state:
        oauthUrl.searchParams.get('state') != null
          ? `${oauthUrl.searchParams.get('state')!.slice(0, 20)}…`
          : null,
    })

    const authWin = new BrowserWindow({
      width: 520,
      height: 720,
      autoHideMenuBar: true,
      webPreferences: {
        session: authSession,
        sandbox: false,
      },
    })

    const wc = authWin.webContents
    wc.on('did-navigate', (_e, url) => {
      console.info(LOG, 'did-navigate', url)
    })
    wc.on('did-fail-load', (_e, code, desc, url) => {
      console.error(LOG, 'did-fail-load', { code, desc, url })
    })
    wc.on('will-redirect', (_e, url) => {
      console.info(LOG, 'will-redirect', url)
    })

    authWin.webContents.setWindowOpenHandler(({ url: target }) => {
      console.info(LOG, 'window open (loading in same window)', target)
      void authWin.loadURL(target)
      return { action: 'deny' }
    })

    console.info(LOG, 'loadURL →', body.url)
    await authWin.loadURL(body.url)

    return await new Promise<{ user: unknown }>((resolve, reject) => {
      let done = false

      const poll = setInterval(() => {
        void (async () => {
          if (done) return
          try {
            const s = await authSession.fetch(`${base}/api/auth/get-session`)
            const j = (await s.json()) as { user?: unknown } | null
            if (j && j.user) {
              done = true
              clearInterval(poll)
              if (!authWin.isDestroyed()) authWin.close()
              resolve({ user: j.user })
            }
          } catch {
            /* ignore transient errors while GitHub redirects */
          }
        })()
      }, 700)

      authWin.on('closed', () => {
        if (done) return
        done = true
        clearInterval(poll)
        reject(new Error('Login window closed'))
      })
    })
  })

  ipcMain.handle('auth:sign-out', async () => {
    const base = baseUrl()
    if (!base) return { ok: false as const }
    try {
      await authSession.fetch(`${base}/api/auth/sign-out`, {
        method: 'POST',
        headers: jsonHeadersWithOrigin(base),
        body: JSON.stringify({}),
      })
      return { ok: true as const }
    } catch {
      return { ok: false as const }
    }
  })
}

import { shell } from 'electron'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readAccountAuth, writeAccountAuth, clearAccountAuth } from './accountAuthStore.ts'
import type { AccountAuthStatus, AccountLoginResult } from '../src/shared/types.ts'

// Read from process.env lazily (inside functions), not into a module-level
// const -- ES module imports are all evaluated before this file's own
// top-level code runs, which is before main.ts's dotenv.config() call fires.
// A module-level `const X = process.env.Y` here would permanently capture
// an empty string, since .env hasn't been loaded yet at that point.
function getSupabaseConfig(): { url: string; anonKey: string } {
  return {
    url: process.env.ZONE_SUPABASE_URL ?? '',
    anonKey: process.env.ZONE_SUPABASE_ANON_KEY ?? '',
  }
}

// Least-privilege scope requested alongside the standard sign-in scopes, in
// the SAME consent screen (see accountAuth's signInWithOAuth call below) --
// this is the "TimeRex-style" unified signup+calendar-grant flow.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const CALLBACK_TIMEOUT_MS = 120_000
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig()
  return Boolean(url && anonKey)
}

function createAnonClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig()
  // flowType 'pkce' makes the redirect carry `?code=...` as a query param;
  // the default implicit flow puts the session in a URL *fragment*, which
  // never reaches this app's loopback HTTP server (fragments are client-side
  // only and are not sent in the actual HTTP request). detectSessionInUrl/
  // persistSession are browser-only behaviors that don't apply in this
  // Node.js main-process context.
  return createClient(url, anonKey, {
    auth: { flowType: 'pkce', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function callbackPage(message: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:80px;">
    <h2>${message}</h2><p>このタブは閉じて構いません。</p></body></html>`
}

interface CallbackResult {
  code: string
}

/**
 * Same loopback-server technique as the (now retired) standalone calendar
 * OAuth flow, but the authorize URL comes from Supabase's `signInWithOAuth`
 * (which brokers the actual Google exchange on its own backend) instead of
 * hitting Google directly.
 */
function waitForCallback(client: SupabaseClient): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      server.close()
      action()
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/auth/callback') {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (error) {
        res
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(callbackPage('ログインがキャンセルされました'))
        finish(() => reject(new Error('access_denied')))
        return
      }
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(callbackPage('検証に失敗しました'))
        finish(() => reject(new Error('missing code')))
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(callbackPage('ログインが完了しました'))
      finish(() => resolve({ code }))
    })

    const timeoutHandle = setTimeout(() => {
      finish(() => reject(new Error('ログインの応答がありませんでした(タイムアウト)')))
    }, CALLBACK_TIMEOUT_MS)

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null
      if (!address) {
        finish(() => reject(new Error('ローカルサーバーの起動に失敗しました')))
        return
      }
      const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`
      client.auth
        .signInWithOAuth({
          provider: 'google',
          options: {
            scopes: CALENDAR_SCOPE,
            queryParams: { access_type: 'offline', prompt: 'consent' },
            redirectTo: redirectUri,
            skipBrowserRedirect: true,
          },
        })
        .then(({ data, error: authError }) => {
          if (authError || !data.url) {
            finish(() => reject(new Error(authError?.message ?? '認可URLの取得に失敗しました')))
            return
          }
          void shell.openExternal(data.url)
        })
    })
  })
}

export async function loginWithGoogle(): Promise<AccountLoginResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error:
        'アカウント機能が設定されていません。apps/desktop/.envにZONE_SUPABASE_URL/ZONE_SUPABASE_ANON_KEYを設定してアプリを再起動してください。',
    }
  }
  try {
    const client = createAnonClient()
    const { code } = await waitForCallback(client)
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    if (error || !data.session) {
      return { ok: false, error: error?.message ?? 'セッションの取得に失敗しました' }
    }
    const session = data.session

    await writeAccountAuth({
      userId: session.user.id,
      email: session.user.email ?? null,
      supabaseAccessToken: session.access_token,
      supabaseRefreshToken: session.refresh_token,
      googleAccessToken: session.provider_token ?? null,
      googleRefreshToken: session.provider_refresh_token ?? null,
      googleAccessTokenExpiresAt: session.provider_token ? Date.now() + 55 * 60 * 1000 : null,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function logout(): Promise<void> {
  const auth = await readAccountAuth()
  await clearAccountAuth()
  if (auth && isSupabaseConfigured()) {
    const client = createAnonClient()
    await client.auth.setSession({ access_token: auth.supabaseAccessToken, refresh_token: auth.supabaseRefreshToken })
    await client.auth.signOut().catch(() => {})
  }
}

export async function getAccountStatus(): Promise<AccountAuthStatus> {
  const auth = await readAccountAuth()
  return { loggedIn: auth !== null, email: auth?.email ?? null }
}

export async function getUserId(): Promise<string | null> {
  const auth = await readAccountAuth()
  return auth?.userId ?? null
}

/** An authenticated Supabase client for the current account (session refreshed automatically by the SDK). */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  const auth = await readAccountAuth()
  if (!auth || !isSupabaseConfigured()) return null
  const client = createAnonClient()
  await client.auth.setSession({ access_token: auth.supabaseAccessToken, refresh_token: auth.supabaseRefreshToken })
  return client
}

/**
 * Used by googleCalendarClient.ts. Supabase does not refresh the Google
 * provider token on its own, so this app refreshes it directly against
 * Google using the SAME OAuth client credentials registered in Supabase's
 * Google provider settings (must also be set in this app's .env).
 */
export async function getValidGoogleAccessToken(): Promise<string | null> {
  const auth = await readAccountAuth()
  if (!auth || !auth.googleRefreshToken) return null
  if (
    auth.googleAccessTokenExpiresAt &&
    auth.googleAccessTokenExpiresAt - Date.now() > 60_000 &&
    auth.googleAccessToken
  ) {
    return auth.googleAccessToken
  }

  const clientId = process.env.ZONE_GOOGLE_CLIENT_ID ?? ''
  const clientSecret = process.env.ZONE_GOOGLE_CLIENT_SECRET ?? ''
  if (!clientId || !clientSecret) return null

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: auth.googleRefreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!tokenRes.ok) return null
  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number }
  await writeAccountAuth({
    ...auth,
    googleAccessToken: tokenData.access_token,
    googleAccessTokenExpiresAt: Date.now() + tokenData.expires_in * 1000,
  })
  return tokenData.access_token
}

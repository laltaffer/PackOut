// PackOut account API (spec #19), as pure (request, env) handlers so the
// engine-style node tests cover them with a mocked KV and a mocked Google
// verifier. The thin files under functions/api/ wire these to Pages routes.

import { createSession, verifySession, sessionCookie, clearedCookie, readCookie, COOKIE_NAME } from './session.js'
import { validateImport } from '../../js/engine.js'

const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token='
// KV allows 25 MB; a decade of trips is well under 1. Anything bigger is abuse.
const MAX_STATE_BYTES = 4 * 1024 * 1024

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

async function session(request, env, now) {
  const token = readCookie(request.headers.get('cookie'), COOKIE_NAME)
  return verifySession(token, env.SESSION_SECRET, now)
}

export async function handleAuth({ request, env, fetcher = fetch, now = Date.now() }) {
  let credential
  try { ({ credential } = await request.json()) } catch { return json({ error: 'Bad request.' }, 400) }
  if (typeof credential !== 'string' || !credential) return json({ error: 'Bad request.' }, 400)

  // Google validates the token's signature; we enforce what it was FOR:
  // minted for this app (aud), for a verified address, and still fresh.
  const res = await fetcher(TOKENINFO + encodeURIComponent(credential))
  if (!res.ok) return json({ error: 'Sign-in rejected.' }, 401)
  const info = await res.json()
  if (info.aud !== env.GOOGLE_CLIENT_ID) return json({ error: 'Sign-in rejected.' }, 401)
  if (info.email_verified !== 'true') return json({ error: 'Sign-in rejected.' }, 401)
  if (!info.sub || Number(info.exp) * 1000 <= now) return json({ error: 'Sign-in rejected.' }, 401)

  const profile = { sub: info.sub, name: info.name ?? info.email ?? '' }
  const token = await createSession(profile, env.SESSION_SECRET, now)
  return json({ sub: profile.sub, name: profile.name }, 200, { 'set-cookie': sessionCookie(token) })
}

export async function handleMe({ request, env, now = Date.now() }) {
  const s = await session(request, env, now)
  return s ? json(s) : json({ error: 'Signed out.' }, 401)
}

export async function handleLogout() {
  return json({ ok: true }, 200, { 'set-cookie': clearedCookie() })
}

export async function handleStateGet({ request, env, now = Date.now() }) {
  const s = await session(request, env, now)
  if (!s) return json({ error: 'Signed out.' }, 401)
  const stored = await env.PACKOUT_KV.get(`state:${s.sub}`, 'json')
  return json(stored ?? { state: null, updatedAt: 0 })
}

export async function handleStatePut({ request, env, now = Date.now() }) {
  const s = await session(request, env, now)
  if (!s) return json({ error: 'Signed out.' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Bad request.' }, 400) }
  const { state, updatedAt } = body ?? {}
  if (!state || typeof updatedAt !== 'number') return json({ error: 'Bad request.' }, 400)
  const v = validateImport(state)
  if (!v.ok) return json({ error: v.error }, 422)
  const serialized = JSON.stringify({ state, updatedAt })
  if (serialized.length > MAX_STATE_BYTES) return json({ error: 'State too large.' }, 413)

  // Last write wins, but a stale writer never silently destroys newer data:
  // it gets a 409 with the server clock and pulls before pushing again.
  const existing = await env.PACKOUT_KV.get(`state:${s.sub}`, 'json')
  if (existing && existing.updatedAt > updatedAt) {
    return json({ error: 'Server copy is newer.', updatedAt: existing.updatedAt }, 409)
  }
  await env.PACKOUT_KV.put(`state:${s.sub}`, serialized)
  return json({ ok: true, updatedAt })
}

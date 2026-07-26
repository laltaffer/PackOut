// PackOut account API (spec #19), as pure (request, env) handlers so the
// engine-style node tests cover them with a mocked KV and a mocked Google
// verifier. The thin files under functions/api/ wire these to Pages routes.

import { createSession, verifySession, sessionCookie, clearedCookie, readCookie, COOKIE_NAME } from './session.js'
import { extractProduct } from './extract.js'
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
  // Signed-out is a normal state, not an error — a 401 here would paint a
  // red console line on every anonymous page load.
  const s = await session(request, env, now)
  return json(s ?? { signedIn: false })
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

// Product-page fetch cap: enough for any real product page's <head>.
const MAX_SCRAPE_BYTES = 1_500_000

// Session-gated so the endpoint can't be used as an open fetch proxy, and
// host-guarded so it can't reach anything private (SSRF). IP-literal hosts
// are refused wholesale — no real product page lives at a bare IP. Hostname
// checks can't beat DNS tricks (127.0.0.1.nip.io); keeping fetches off
// private networks in production is the Workers runtime's job — this guard
// is for what strings CAN catch, and for wrangler pages dev.
function blockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.+$/, '') // localhost. == localhost
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true
  if (/^\d+(\.\d+){3}$/.test(h)) return true       // IPv4 literal
  if (h.includes(':') || h.startsWith('[')) return true // IPv6 literal
  return false
}

// Default ports only — anything else turns the endpoint into a port scanner.
const blockedPort = url => url.port !== '' && url.port !== '80' && url.port !== '443'

// Canonical catalog key (spec #25): one key per product regardless of share
// tracking noise — lowercase host, path only, no query/fragment, no trailing
// slash. Values are objective facts (name, weight, macros), safe to share.
export function normalizeProductUrl(u) {
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname
  return `${u.protocol}//${u.hostname.toLowerCase()}${path}`
}

// A hit short-circuits the scrape, so entries can only refresh by expiring.
const CATALOG_TTL_S = 90 * 24 * 3600

export async function handleScrape({ request, env, fetcher = fetch, now = Date.now() }) {
  const s = await session(request, env, now)
  if (!s) return json({ error: 'Signed out.' }, 401)
  let url
  try { ({ url } = await request.json()) } catch { return json({ error: 'Bad request.' }, 400) }
  let target
  try { target = new URL(String(url ?? '')) } catch { return json({ error: 'Not a valid URL.' }, 400) }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return json({ error: 'Only http(s) URLs.' }, 400)
  if (blockedHost(target.hostname)) return json({ error: 'That host is not allowed.' }, 400)
  if (blockedPort(target)) return json({ error: 'That port is not allowed.' }, 400)

  // Catalog first: someone already scraped this product — answer from the
  // shared copy, no re-fetch, and it works even after the page rots.
  const catalogKey = `catalog:${normalizeProductUrl(target)}`
  if (env.PACKOUT_KV) {
    let hit = null
    try { hit = await env.PACKOUT_KV.get(catalogKey, 'json') } catch { /* catalog down ≠ scrape down */ }
    if (hit) {
      const { sourceUrl, at, ...product } = hit
      return json({ found: true, ...product, catalog: true })
    }
  }

  // Redirects are followed by hand so EVERY hop passes the same host guard —
  // redirect: 'follow' would let a public page bounce the fetch to a private
  // address after the one pre-check.
  let res
  let href = target.href
  for (let hop = 0; ; hop++) {
    try {
      res = await fetcher(href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'PackOutBot/1.0 (+https://packout.pages.dev)', accept: 'text/html' },
      })
    } catch {
      return json({ error: 'Could not reach that page.' }, 502)
    }
    const location = res.headers.get('location')
    if (res.status < 300 || res.status >= 400 || !location) break
    if (hop >= 3) return json({ error: 'Too many redirects.' }, 502)
    let next
    try { next = new URL(location, href) } catch { return json({ error: 'Could not reach that page.' }, 502) }
    if (next.protocol !== 'https:' && next.protocol !== 'http:') return json({ error: 'Only http(s) URLs.' }, 400)
    if (blockedHost(next.hostname)) return json({ error: 'That host is not allowed.' }, 400)
    if (blockedPort(next)) return json({ error: 'That port is not allowed.' }, 400)
    href = next.href
  }
  if (!res.ok) return json({ error: `The page answered ${res.status}.` }, 502)
  if (!(res.headers.get('content-type') ?? '').includes('html')) {
    return json({ error: 'Not an HTML page.' }, 422)
  }
  const html = await readCapped(res, MAX_SCRAPE_BYTES)

  // Hostile markup must never escape as a Worker exception — an extraction
  // failure is just "nothing found".
  let product
  try { product = extractProduct(html) } catch {
    product = { name: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, perServing: false }
  }
  const found = ['name', 'kcal', 'proteinG', 'carbsG', 'fatG', 'weightOz'].some(k => product[k] !== null)

  // Publish to the shared catalog only when the scrape answered the question
  // the catalog exists for (a weight). Failures never fail the scrape.
  if (env.PACKOUT_KV && product.weightOz !== null) {
    try {
      await env.PACKOUT_KV.put(catalogKey,
        JSON.stringify({ ...product, sourceUrl: String(url), at: now }),
        { expirationTtl: CATALOG_TTL_S })
    } catch { /* the user still gets their scrape */ }
  }
  return json({ found, ...product })
}

// Read at most `max` characters without buffering the whole body — the cap
// must hold against chunked responses that never declare content-length.
async function readCapped(res, max) {
  if (!res.body?.getReader) return (await res.text()).slice(0, max)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (out.length < max) {
    const { done, value } = await reader.read()
    if (done) return out
    out += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => {})
  return out.slice(0, max)
}

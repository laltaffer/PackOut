// PackOut account API (spec #19), as pure (request, env) handlers so the
// engine-style node tests cover them with a mocked KV and a mocked Google
// verifier. The thin files under functions/api/ wire these to Pages routes.

import { createSession, verifySession, sessionCookie, clearedCookie, readCookie, COOKIE_NAME } from './session.js'
import { extractProduct } from './extract.js'
import { lookupPlace } from './place.js'
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

// Google validates the token's signature; we enforce what it was FOR: minted
// for this app (aud), for a verified address, and still fresh. Null means no.
async function verifyGoogleCredential(credential, env, fetcher, now) {
  if (typeof credential !== 'string' || !credential) return null
  const res = await fetcher(TOKENINFO + encodeURIComponent(credential))
  if (!res.ok) return null
  const info = await res.json()
  if (info.aud !== env.GOOGLE_CLIENT_ID) return null
  if (info.email_verified !== 'true') return null
  if (!info.sub || Number(info.exp) * 1000 <= now) return null
  return { sub: info.sub, name: info.name ?? info.email ?? '' }
}

export async function handleAuth({ request, env, fetcher = fetch, now = Date.now() }) {
  let credential
  try { ({ credential } = await request.json()) } catch { return json({ error: 'Bad request.' }, 400) }
  if (typeof credential !== 'string' || !credential) return json({ error: 'Bad request.' }, 400)
  const profile = await verifyGoogleCredential(credential, env, fetcher, now)
  if (!profile) return json({ error: 'Sign-in rejected.' }, 401)
  const token = await createSession(profile, env.SESSION_SECRET, now)
  return json({ sub: profile.sub, name: profile.name }, 200, { 'set-cookie': sessionCookie(token) })
}

// Google Identity Services runs a popup and calls our JS callback — until it
// can't. In an in-app browser (a link opened from Messages) or where
// third-party storage is restricted it falls back to REDIRECT mode, and POSTs
// the credential to the page URL instead. A static host answers that POST with
// 405 and an empty body: a blank page, and "confirm form resubmission" on
// refresh — which is exactly what Lawrence's friend hit (2026-07-27).
//
// So the site root accepts that POST and finishes the job. The reply is a 303
// so the browser turns it back into a GET: no resubmit prompt, ever.
const seeOther = (location, cookie) =>
  new Response(null, { status: 303, headers: { location, ...(cookie ? { 'set-cookie': cookie } : {}) } })

export async function handleAuthRedirect({ request, env, fetcher = fetch, now = Date.now() }) {
  let form
  try { form = await request.formData() } catch { return seeOther('/?signin=failed') }
  // Redirect mode has no same-origin JS to defend it, so Google uses a
  // double-submit cookie: the same token arrives as a cookie AND in the body,
  // and only a real Google post can have set both.
  const bodyToken = form.get('g_csrf_token')
  const cookieToken = readCookie(request.headers.get('cookie'), 'g_csrf_token')
  if (!bodyToken || !cookieToken || bodyToken !== cookieToken) return seeOther('/?signin=failed')

  const profile = await verifyGoogleCredential(form.get('credential'), env, fetcher, now)
  if (!profile) return seeOther('/?signin=failed')
  const token = await createSession(profile, env.SESSION_SECRET, now)
  return seeOther('/', sessionCookie(token))
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

// Outbound fetch cap (product pages and sheet CSVs alike): enough for any
// real product page's <head> or a packing spreadsheet.
const MAX_FETCH_BYTES = 1_500_000

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

// Stale-while-revalidate: entries never expire (a rotted page keeps its
// captured facts forever); hits older than the fresh window pay one live
// re-scrape, falling back to the stored copy when the page has died.
const CATALOG_FRESH_MS = 7 * 24 * 3600 * 1000

const catalogResponse = hit => {
  const { sourceUrl, at, ...product } = hit
  return json({ found: true, ...product, catalog: true })
}

// Only finite positive weights may enter the shared catalog — schema.org junk
// (zero, negative) must not become a canonical fact that blocks re-scraping.
const publishableWeight = w => typeof w === 'number' && Number.isFinite(w) && w > 0

// What a failure means to the person who pasted the link, which is the only
// thing worth saying. Three outcomes need three different sentences: this
// store will never answer a robot (so stop retrying and type it), the link is
// wrong (so look at it again), or the site is having a bad day (so come back).
// "The page answered 403." told nobody which of those they were in.
const BLOCKED_MSG = 'That store blocks automated lookups — enter the item by hand.'
const DEAD_MSG = 'That page is gone — check the link.'

function httpMessage(status) {
  if (status === 401 || status === 403 || status === 429) return BLOCKED_MSG
  if (status === 404 || status === 410) return DEAD_MSG
  if (status >= 500) return `That store’s site is failing right now (${status}) — try again later.`
  return `That page answered ${status} — enter the item by hand.`
}

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

  // Catalog first: someone already scraped this product — a fresh entry
  // answers instantly; a stale one is kept as the fallback if the live
  // scrape below fails, so link rot never loses captured facts.
  const catalogKey = `catalog:${normalizeProductUrl(target)}`
  let stale = null
  if (env.PACKOUT_KV) {
    let hit = null
    try { hit = await env.PACKOUT_KV.get(catalogKey, 'json') } catch { /* catalog down ≠ scrape down */ }
    if (hit) {
      // Entries captured before brands were extracted hold a brandless name.
      // Serving one would keep handing back the old answer for a week, so a
      // record with no brand key is treated as stale — re-scraped now, still
      // the fallback if the page has since died.
      const branded = hit.brand !== undefined
      if (branded && now - (hit.at ?? 0) < CATALOG_FRESH_MS) return catalogResponse(hit)
      stale = hit
    }
  }
  const fallback = errRes => stale ? catalogResponse(stale) : errRes

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
      return fallback(json({ error: 'Couldn’t reach that site — check the link.' }, 502))
    }
    const location = res.headers.get('location')
    if (res.status < 300 || res.status >= 400 || !location) break
    if (hop >= 3) return fallback(json({ error: 'That link keeps redirecting — open it in a browser and paste where it lands.' }, 502))
    let next
    try { next = new URL(location, href) } catch { return fallback(json({ error: 'Couldn’t reach that site — check the link.' }, 502)) }
    if (next.protocol !== 'https:' && next.protocol !== 'http:') return fallback(json({ error: 'Only http(s) URLs.' }, 400))
    if (blockedHost(next.hostname)) return fallback(json({ error: 'That host is not allowed.' }, 400))
    if (blockedPort(next)) return fallback(json({ error: 'That port is not allowed.' }, 400))
    href = next.href
  }
  if (!res.ok) return fallback(json({ error: httpMessage(res.status) }, 502))
  if (!(res.headers.get('content-type') ?? '').includes('html')) {
    return fallback(json({ error: 'That link isn’t a web page — paste the product page’s URL.' }, 422))
  }
  const html = await readCapped(res, MAX_FETCH_BYTES)

  // Hostile markup must never escape as a Worker exception — an extraction
  // failure is just "nothing found".
  let product
  try { product = extractProduct(html) } catch {
    product = { name: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, perServing: false, problem: null }
  }
  const found = ['name', 'kcal', 'proteinG', 'carbsG', 'fatG', 'weightOz'].some(k => product[k] !== null)
  // A page that lost its structured data is a worse answer than the facts
  // we already captured from it.
  if (!found && stale) return catalogResponse(stale)
  // A bot wall answers 200 with a challenge page, so the status code said
  // nothing — the page itself is what names the problem.
  if (product.problem === 'blocked') return json({ error: BLOCKED_MSG }, 422)
  if (product.problem === 'dead') return json({ error: DEAD_MSG }, 422)

  // Publish to the shared catalog only when the scrape answered the question
  // the catalog exists for (a real weight). Failures never fail the scrape.
  if (env.PACKOUT_KV && publishableWeight(product.weightOz)) {
    try {
      await env.PACKOUT_KV.put(catalogKey,
        JSON.stringify({ ...product, sourceUrl: String(url), at: now }))
    } catch { /* the user still gets their scrape */ }
  }
  return json({ found, ...product })
}

// A pasted Google Sheets link names only an id and a tab — the fetch URL is
// built here against the fixed docs.google.com export endpoint, so unlike
// /api/scrape there is no user-controlled host and no SSRF surface.
export function extractSheetRef(url) {
  let u
  try { u = new URL(String(url ?? '')) } catch { return null }
  if (u.hostname !== 'docs.google.com') return null
  const m = u.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return null
  const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get('gid') ?? null
  return { id: m[1], gid }
}

export async function handleSheet({ request, env, fetcher = fetch, now = Date.now() }) {
  const s = await session(request, env, now)
  if (!s) return json({ error: 'Signed out.' }, 401)
  let url
  try { ({ url } = await request.json()) } catch { return json({ error: 'Bad request.' }, 400) }
  const ref = extractSheetRef(url)
  if (!ref) return json({ error: 'That is not a Google Sheets link.' }, 400)
  const exportUrl = `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=csv` +
    (ref.gid ? `&gid=${ref.gid}` : '')
  let res
  try {
    res = await fetcher(exportUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'PackOutBot/1.0 (+https://packout.pages.dev)' },
    })
  } catch {
    return json({ error: 'Could not reach Google Sheets.' }, 502)
  }
  // A sheet that isn't link-shared redirects to the Google login page — an
  // HTML answer where CSV belongs. That is a fixable user situation, not a
  // failure, so the error says exactly what to click.
  if ((res.headers.get('content-type') ?? '').includes('html')) {
    return json({ error: 'That sheet is not shared. In Google Sheets: Share → General access → "Anyone with the link", then try again.' }, 403)
  }
  if (!res.ok) return json({ error: `Google Sheets answered ${res.status}.` }, 502)
  // A body that fills the cap was cut mid-sheet. A silently truncated list
  // reads as complete and imports as one — refusing is the honest answer
  // (Codex, 2026-07-28). Real packing sheets are kilobytes.
  const csv = await readCapped(res, MAX_FETCH_BYTES)
  if (csv.length >= MAX_FETCH_BYTES) return json({ error: 'That sheet is too large to import.' }, 413)
  return json({ csv })
}

// Session-gated like every other outbound call: signed-out visitors don't get
// to spend the app's upstream quota.
export async function handlePlace({ request, env, fetcher = fetch, now = Date.now() }) {
  const s = await session(request, env, now)
  if (!s) return json({ error: 'Signed out.' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Bad request.' }, 400) }
  const { query, startDate, days } = body ?? {}
  const result = await lookupPlace({
    query, startDate,
    days: typeof days === 'number' && Number.isFinite(days) ? days : null,
    fetcher, now, kv: env.PACKOUT_KV ?? null,
  })
  return json(result.body, result.status)
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

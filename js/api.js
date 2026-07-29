// Client callers for the Pages Functions endpoints, plus the one piece of
// shared form wiring built on them (Fetch-from-product-page). Never throws —
// a dead service is a message, not a broken screen.

import { extractProduct } from './extract.js'

export async function fetchProduct(url) {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.status === 401) return { ok: false, error: 'Sign in to fetch product pages.' }
    const data = await res.json().catch(() => null)
    // The server's message already names the problem AND the next step —
    // appending a blanket "Enter it by hand" to it produced advice that
    // contradicted itself on the ones worth retrying.
    if (!res.ok || !data) {
      return { ok: false, error: data?.error ?? `Couldn’t fetch that page (HTTP ${res.status}) — enter it by hand.` }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: 'Couldn’t reach the fetch service — enter it by hand.' }
  }
}

// ---------- the second way to read a product page ----------
// Cloudflare's egress is refused by most Shopify storefronts — Stone Glacier
// answers a bare bot user-agent from a laptop and blocks a polite one from a
// Worker, so the block is the network, not what we call ourselves (measured
// 2026-07-29). The person pasting the link is not blocked: their browser, on
// their own connection, is just a browser. Shopify serves storefront pages
// with permissive CORS, so the page they pasted can be read here and handed to
// the SAME extractor the Worker uses.
//
// This is not a way around a wall. It is a normal cross-origin read the site
// explicitly allows, of a page the person is looking at, one at a time. Their
// cookies are never sent (credentials: 'omit'), so nothing is fetched as them,
// and the HTML is only ever string-matched — never parsed into the document.

// Enough to reach the weight, which is not in the <head>. A 600 KB cap looked
// thrifty and cost HMG's quilt every one of its six stated weights — they sit
// past 900 KB of its 1.2 MB page, and a lookup that returns a name without a
// weight has failed at the only job that matters. Matches the server's own cap.
// The page was already downloaded once by the person who copied the URL out of
// it, so this is a second copy, not a surprise.
const MAX_BROWSER_BYTES = 1_500_000

async function readCapped(res, max) {
  const reader = res.body?.getReader()
  // No stream to meter (a mocked or already-buffered response): the bytes are
  // paid for either way, so this only bounds what the extractor has to chew.
  if (!reader) return (await res.text()).slice(0, max)
  const decoder = new TextDecoder()
  let out = ''
  let bytes = 0
  try {
    while (bytes < max) {
      const { done, value } = await reader.read()
      if (done) {
        out += decoder.decode()   // flush any character the last chunk began
        break
      }
      // The cap has to hold against ONE chunk too: a server is free to hand
      // over the whole megabyte at once, and counting after the fact would
      // have already paid for it (Codex, 2026-07-29 — measured 1.86 MB read
      // against a 600 KB cap on a stream of three-byte characters).
      const room = max - bytes
      const slice = value.byteLength > room ? value.subarray(0, room) : value
      bytes += slice.byteLength
      // stream: true so a character split across two chunks is held back and
      // finished by the next one, instead of landing as a replacement char.
      out += decoder.decode(slice, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return out
}

export async function fetchProductInBrowser(url) {
  try {
    // Only what a product page can be. A javascript:/data: URL here would be
    // the user's own paste, but there is no reason to hand one to fetch.
    const target = new URL(url)
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return null
    const res = await fetch(target.href, {
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    if (!(res.headers.get('content-type') ?? '').includes('html')) return null
    const product = extractProduct(await readCapped(res, MAX_BROWSER_BYTES))
    // A page the extractor called a bot wall or a dead link is not a product,
    // even when something on it parses. A Cloudflare interstitial carrying
    // "Weight: 18.9 oz" in its body would otherwise hand that number to a pack
    // total — the Worker already refuses this, and so must this leg (Codex,
    // 2026-07-29).
    if (product.problem) return null
    const found = ['name', 'kcal', 'proteinG', 'carbsG', 'fatG', 'weightOz'].some(k => product[k] !== null)
    return found ? { ok: true, found: true, ...product, viaBrowser: true } : null
  } catch {
    // CORS refusal, offline, timeout — all just "this way didn't work".
    return null
  }
}

// A product read here joins the shared catalog, so the next person to paste
// that link gets it without anyone fetching anything (Lawrence 2026-07-29: "if
// the product is coming from a URL I think it should go into the shared
// library"). It has to work this way now — the Worker is refused by most
// storefronts, so if only Worker reads could publish, the catalog would have
// stopped growing the day the blocks started.
//
// Fire and forget, deliberately: the lookup has already succeeded and the user
// is looking at their answer. A catalog that is full, down, or unreachable is
// not their problem, and must never turn a good lookup into a red message.
export function shareToCatalog(url, product) {
  const { ok, found, catalog, viaBrowser, ...facts } = product
  try {
    fetch('/api/catalog', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,          // survives the user navigating away mid-flight
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, product: facts }),
    }).catch(() => {})
  } catch { /* no network, no share */ }
}

const PRODUCT_FIELDS = ['name', 'brand', 'kcal', 'proteinG', 'carbsG', 'fatG', 'weightOz']

// Everything the server found, plus what it left blank and the browser could
// see. The server's own values win: it may be answering from the shared
// catalog, and a captured weight outranks a fresh guess at the same page.
function fillBlanks(server, browser) {
  const out = { ...server }
  const tookNutrition = []
  for (const k of PRODUCT_FIELDS) {
    if (out[k] == null && browser[k] != null) {
      out[k] = browser[k]
      if (k !== 'name' && k !== 'brand' && k !== 'weightOz') tookNutrition.push(k)
    }
  }
  if (!out.weightOptions?.length && browser.weightOptions?.length) out.weightOptions = browser.weightOptions
  // Numbers borrowed from the browser carry the browser's per-serving caution,
  // or the UI would state them as whole-item without saying so.
  if (tookNutrition.length && browser.perServing) out.perServing = true
  return out
}

// Did this answer the question a packer actually asked? A name alone does not:
// a soft wall can answer 200 with nothing but a <title>, which reads as
// "found" while telling us nothing (Codex, 2026-07-29). A page that states
// SEVERAL weights has answered — it narrowed them honestly, and re-reading the
// same page in the browser would only narrow them the same way, which for
// packs and quilts is the common case.
const answered = r => r.weightOz !== null || r.weightOptions?.length > 0

// The server first: it holds the shared catalog, so a product someone has
// already looked up answers instantly and costs no one a fetch. The browser is
// the rescue, and it runs whenever the server came back short — which, since
// the egress blocks, is most storefronts. When both fail the server's message
// is what the user sees, because it is the one that knows whether the page was
// blocked, gone, or simply not a product page.
export async function lookupProduct(url, {
  server = fetchProduct, browser = fetchProductInBrowser, share = shareToCatalog, onRetry,
} = {}) {
  const first = await server(url)
  // Catalog hits are not automatically terminal any more: now that a browser
  // read can publish a name and brand without a weight, a hit may be the
  // partial one somebody else filed, and the second look is what upgrades it.
  if (first.ok && first.found && answered(first)) return first
  onRetry?.()
  const second = await browser(url)
  if (!second) return first
  // What this browser just read is what the next person gets for free. Guarded
  // here rather than trusted to the callee: fire-and-forget is the intent of
  // this call, so a broken share must not cost the user the answer they have.
  try { share(url, second) } catch { /* the catalog can wait */ }
  if (!first.ok || !first.found) return second
  return fillBlanks(first, second)
}

// Sheet import (issue #26): a pasted Google Sheets link comes back as CSV.
export async function fetchSheet(url) {
  try {
    const res = await fetch('/api/sheet', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.status === 401) return { ok: false, error: 'Sign in to import a sheet.' }
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      return { ok: false, error: data?.error ?? `Couldn’t fetch that sheet (HTTP ${res.status}).` }
    }
    return { ok: true, csv: data.csv }
  } catch {
    return { ok: false, error: 'Couldn’t reach the import service — check your connection.' }
  }
}

// Destination lookup (Lawrence 2026-07-27). Advisory: a miss leaves the typed
// destination exactly as typed and the trip saves anyway.
export async function lookupDestination(query, startDate, days) {
  try {
    const res = await fetch('/api/place', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, startDate, days }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return { ok: false, error: data?.error ?? 'Lookup unavailable.' }
    return { ok: true, place: data }
  } catch {
    return { ok: false, error: 'Lookup unavailable — the trip keeps what you typed.' }
  }
}

// Scrape-to-prefill (issue #23): fetch product data for the pasted URL and
// fill only the still-blank fields — never clobber typed values, never save.
// JSON-LD nutrition is per serving; PackOut kcal is whole-item-as-packed, so
// any filled nutrition number carries an explicit scale-it-yourself caution.
const SCRAPE_LABELS = { name: 'name', kcal: 'calories', carbsG: 'carbs', fatG: 'fat', proteinG: 'protein', weightOz: 'weight' }

export function wireScrape(form, fields) {
  const btn = form.querySelector('#scrape-btn')
  const status = form.querySelector('#scrape-status')
  const say = (msg, isError) => {
    status.textContent = msg
    status.classList.toggle('field-error', !!isError)
  }
  btn.addEventListener('click', async () => {
    const url = form.elements['url'].value.trim()
    if (!url) { say('Paste a product URL first.'); return }
    btn.disabled = true
    say('Fetching…')
    // The browser leg can take a few seconds on a big storefront page, so it
    // says so rather than looking hung.
    const data = await lookupProduct(url, { onRetry: () => say('Reading it from your browser…') })
    btn.disabled = false
    // A fetch that failed reads as a failure — it used to sit in the same grey
    // as "Filled name, weight.", which is how a bot wall passed for a result.
    if (!data.ok) { say(data.error, true); return }
    const filled = fields.filter(name => {
      const input = form.elements[name]
      if (!input || input.value !== '' || data[name] == null) return false
      input.value = data[name]
      return true
    })
    if (!filled.length) {
      if (weightsAmbiguous(form, data, say)) return
      if (data.found) say('Nothing new to fill — the blank fields weren’t on that page.')
      else say('That page publishes no product data — enter it by hand.', true)
      return
    }
    const nutrition = filled.some(k => ['kcal', 'carbsG', 'fatG', 'proteinG'].includes(k))
    const filledMsg = `Filled ${filled.map(k => SCRAPE_LABELS[k]).join(', ')}.` +
      (nutrition && data.perServing ? ' Nutrition is per serving — scale to the whole item as you pack it.' : '')
    const options = data.weightOptions ?? []
    if (options.length > 1 && form.elements['weightOz']?.value === '') {
      say(`${filledMsg} Page lists multiple weights (${options.join(' / ')} oz) — enter the one for your setup.`, true)
    } else {
      say(filledMsg)
    }
  })
}

// A page that states several weights has narrowed the answer without giving
// it — a tripod lists its long and short columns, a pack tables four models.
// Say so and stop: nothing in the markup says which one is on your back, and
// guessing would put a wrong number in a pack total. Lawrence 2026-07-27:
// "this is pretty common for these types of products so the user will
// understand" — so it is a sentence, not a picker.
function weightsAmbiguous(form, data, say) {
  const options = data.weightOptions ?? []
  const input = form.elements['weightOz']
  if (options.length < 2 || !input || input.value !== '') return false
  say(`Page lists multiple weights (${options.join(' / ')} oz) — enter the one for your setup.`, true)
  return true
}

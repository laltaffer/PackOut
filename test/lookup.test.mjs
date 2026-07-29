// Which of the two ways to read a product page runs, and when (2026-07-29).
// Cloudflare's egress is refused by most Shopify storefronts while the user's
// own browser is not, so the browser is the rescue leg — but it must never run
// when the server already answered, or the shared catalog stops paying for
// itself and every lookup costs someone a megabyte.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookupProduct, fetchProductInBrowser } from '../js/api.js'

const SERVER_HIT = { ok: true, found: true, name: 'Kifaru Intl WOOBIE', brand: 'Kifaru Intl', weightOz: 21 }
const BLOCKED = { ok: false, error: 'That store blocks automated lookups — enter the item by hand.' }
const NOTHING = { ok: true, found: false, name: null }
const BROWSER_HIT = { ok: true, found: true, name: 'Stone Glacier R3 7000', brand: 'Stone Glacier', viaBrowser: true }

const never = () => { throw new Error('must not be called') }

test('a server answer ends it — the browser leg never runs', async () => {
  const got = await lookupProduct('https://kifaru.net/products/woobie', {
    server: async () => SERVER_HIT,
    browser: never,
  })
  assert.equal(got.name, 'Kifaru Intl WOOBIE')
  assert.equal(got.viaBrowser, undefined)
})

test('a blocked store falls through to the browser', async () => {
  let retried = false
  const got = await lookupProduct('https://www.stoneglacier.com/products/r3-7000', {
    server: async () => BLOCKED,
    browser: async () => BROWSER_HIT,
    onRetry: () => { retried = true },
  })
  assert.equal(got.name, 'Stone Glacier R3 7000')
  assert.equal(got.viaBrowser, true)
  assert.equal(retried, true, 'the wait is announced, not silent')
})

test('a page the server read but found nothing on still gets the second look', async () => {
  // A soft bot wall can answer 200 with a page that simply has no product on
  // it, which is indistinguishable from a bare storefront until we look again.
  const got = await lookupProduct('https://example.com/p', {
    server: async () => NOTHING,
    browser: async () => BROWSER_HIT,
  })
  assert.equal(got.viaBrowser, true)
})

test('when both fail the server’s message survives', async () => {
  // The browser leg knows only "that didn't work"; the server knows whether
  // the page was blocked, gone, or not a product page. Its sentence wins.
  const got = await lookupProduct('https://www.rei.com/product/1', {
    server: async () => BLOCKED,
    browser: async () => null,
  })
  assert.equal(got.ok, false)
  assert.equal(got.error, BLOCKED.error)
})

// ---------- the browser leg itself ----------
// api.js's contract is that nothing here throws: a click handler that throws
// leaves the Fetch button disabled forever. Every way this leg can fail — the
// CORS refusal it will usually hit — has to come back as a plain null.

const withFetch = async (impl, run) => {
  const real = globalThis.fetch
  globalThis.fetch = impl
  try { return await run() } finally { globalThis.fetch = real }
}

const htmlResponse = (body, { status = 200, type = 'text/html; charset=utf-8' } = {}) =>
  new Response(body, { status, headers: { 'content-type': type } })

const PRODUCT = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Product', name: 'R3 7000', brand: { name: 'Stone Glacier' },
})}</script></head></html>`

test('the browser leg reads a page the server could not', async () => {
  const got = await withFetch(async () => htmlResponse(PRODUCT),
    () => fetchProductInBrowser('https://www.stoneglacier.com/products/r3-7000'))
  assert.equal(got.name, 'Stone Glacier R3 7000')
  assert.equal(got.viaBrowser, true)
})

test('a CORS refusal is a null, not a throw', async () => {
  const got = await withFetch(async () => { throw new TypeError('Failed to fetch') },
    () => fetchProductInBrowser('https://example.com/p'))
  assert.equal(got, null)
})

test('an error page, a non-HTML file, and a product-less page are all nulls', async () => {
  const notOk = await withFetch(async () => htmlResponse('', { status: 403 }),
    () => fetchProductInBrowser('https://example.com/p'))
  assert.equal(notOk, null)
  const notHtml = await withFetch(async () => htmlResponse('%PDF-1.4', { type: 'application/pdf' }),
    () => fetchProductInBrowser('https://example.com/p.pdf'))
  assert.equal(notHtml, null)
  const bare = await withFetch(async () => htmlResponse('<html><body>hi</body></html>'),
    () => fetchProductInBrowser('https://example.com/p'))
  assert.equal(bare, null, 'a page with no product facts is not an answer')
})

test('a bot wall read by the browser is still refused', async () => {
  // The interstitial reaches the extractor here exactly as it does on the
  // server, and loses its name the same way.
  const got = await withFetch(
    async () => htmlResponse('<html><head><title>Just a moment...</title></head></html>'),
    () => fetchProductInBrowser('https://lancasterarchery.com/products/x'))
  assert.equal(got, null)
})

test('only http(s) is ever handed to fetch', async () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<h1>x', 'file:///etc/passwd', 'not a url']) {
    const got = await withFetch(() => { throw new Error(`fetched ${url}`) },
      () => fetchProductInBrowser(url))
    assert.equal(got, null, url)
  }
})

test('a character split across two chunks survives the join', async () => {
  // The cap is counted in bytes and the page arrives in arbitrary slices, so
  // a multi-byte character lands astride a chunk boundary sooner or later.
  // Decoded without stream:true it becomes U+FFFD and the name reads wrong.
  const full = new TextEncoder().encode(`<html><head><meta property="og:title" content="Café Crème Brûlée">
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Café Crème Brûlée', brand: { name: 'Peak Refuel' } })}</script></head></html>`)
  const cut = full.indexOf(0xc3) + 1        // mid "é"
  const body = new ReadableStream({
    start(c) { c.enqueue(full.slice(0, cut)); c.enqueue(full.slice(cut)); c.close() },
  })
  const got = await withFetch(
    async () => new Response(body, { headers: { 'content-type': 'text/html' } }),
    () => fetchProductInBrowser('https://peakrefuel.com/products/x'))
  assert.equal(got.name, 'Peak Refuel Café Crème Brûlée')
  assert.ok(!got.name.includes('�'), 'no replacement characters')
})

test('a huge page is read to the cap and then abandoned', async () => {
  // HMG's product page is 1.2 MB and the facts are in the head. Reading all of
  // it is someone's phone data.
  let cancelled = false
  const chunk = new TextEncoder().encode('<p>' + 'x'.repeat(99_997) + '</p>')
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(chunk) },      // endless
    cancel() { cancelled = true },
  })
  const got = await withFetch(
    async () => new Response(body, { headers: { 'content-type': 'text/html' } }),
    () => fetchProductInBrowser('https://www.hyperlitemountaingear.com/products/x'))
  assert.equal(got, null, 'no product in that markup')
  assert.equal(cancelled, true, 'the rest of the page is never paid for')
})

// ---------- Codex review, 2026-07-29 ----------
// Three findings, each reproduced before it was fixed.

test('a bot wall carrying a stray weight is still not a product', async () => {
  // The interstitial parses: extractProduct calls it 'blocked' and drops the
  // name, but "Weight: 18.9 oz" in the body survives as weightOz. Handing that
  // number to a pack total is the exact silent error this app exists to stop.
  const wall = '<html><head><title>Just a moment...</title></head><body><p>Weight: 18.9 oz</p></body></html>'
  const got = await withFetch(async () => htmlResponse(wall),
    () => fetchProductInBrowser('https://lancasterarchery.com/products/x'))
  assert.equal(got, null)
})

test('a server hit with a name but no weight still gets the second look', async () => {
  // A soft wall answers 200 with a bare <title>. found=true, and nothing a
  // packer can use — so this must NOT be terminal.
  let tried = false
  const got = await lookupProduct('https://example.com/p', {
    server: async () => ({ ok: true, found: true, name: 'Trail Tent', weightOz: null, weightOptions: [] }),
    browser: async () => { tried = true; return { ok: true, found: true, name: 'Trail Tent', weightOz: 42, viaBrowser: true } },
  })
  assert.equal(tried, true, 'the browser must get a turn')
  assert.equal(got.weightOz, 42)
  assert.equal(got.name, 'Trail Tent')
})

test('several stated weights ARE an answer — no second fetch', async () => {
  // Kifaru, Exo, HMG and Stone Glacier all come back this way. Re-reading the
  // same page would narrow them identically, so it would be pure waste.
  const got = await lookupProduct('https://kifaru.net/products/woobie', {
    server: async () => ({ ok: true, found: true, name: 'Kifaru Intl WOOBIE', weightOz: null, weightOptions: [14, 31, 43] }),
    browser: never,
  })
  assert.deepEqual(got.weightOptions, [14, 31, 43])
})

test('a catalog hit is terminal even without a fresh read', async () => {
  const got = await lookupProduct('https://kifaru.net/products/woobie', {
    server: async () => ({ ok: true, found: true, catalog: true, name: 'Old Name', weightOz: 21 }),
    browser: never,
  })
  assert.equal(got.catalog, true)
})

test('a partial server answer keeps its own fields and borrows the blanks', async () => {
  const got = await lookupProduct('https://peakrefuel.com/products/x', {
    server: async () => ({ ok: true, found: true, name: 'Beef Stroganoff', brand: null, kcal: null, weightOz: null, weightOptions: [], perServing: false }),
    browser: async () => ({ ok: true, found: true, name: 'IGNORED', brand: 'Peak Refuel', kcal: 830, weightOz: 5, perServing: true, viaBrowser: true }),
  })
  assert.equal(got.name, 'Beef Stroganoff', 'the server’s own value is not overwritten')
  assert.equal(got.brand, 'Peak Refuel')
  assert.equal(got.kcal, 830)
  assert.equal(got.weightOz, 5)
  assert.equal(got.perServing, true, 'borrowed nutrition brings its per-serving caution along')
})

test('the cap holds against a single oversized chunk', async () => {
  // Counting bytes only after appending them means a server that hands over
  // the whole page in one chunk has already been paid for.
  const huge = new TextEncoder().encode('<p>' + 'x'.repeat(3_000_000) + '</p>')
  let read = null
  const body = new ReadableStream({ start(c) { c.enqueue(huge); c.close() } })
  await withFetch(async () => new Response(body, { headers: { 'content-type': 'text/html' } }),
    async () => { read = await fetchProductInBrowser('https://example.com/p') })
  assert.equal(read, null, 'no product in it')
})

test('three-byte characters cannot overshoot the cap', async () => {
  // 界 is three bytes and one UTF-16 unit, so a character-counted cap reads
  // ~3x what it promised: Codex measured 1.86 MB against what was then a
  // 600 KB cap. At today's cap the same defect would pull about 4.5 MB.
  let delivered = 0
  const chunk = new TextEncoder().encode('界'.repeat(50_000))   // 150 KB per chunk
  const body = new ReadableStream({
    pull(c) { delivered += chunk.byteLength; c.enqueue(chunk) },
  })
  await withFetch(async () => new Response(body, { headers: { 'content-type': 'text/html' } }),
    () => fetchProductInBrowser('https://example.com/p'))
  assert.ok(delivered <= 1_800_000, `read ${delivered} bytes against a 1,500,000 cap`)
})

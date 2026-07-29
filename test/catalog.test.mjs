import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleScrape, handleCatalogPut, cleanProduct, normalizeProductUrl } from '../functions/lib/handlers.js'
import { createSession, COOKIE_NAME } from '../functions/lib/session.js'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const NOW = 1_800_000_000_000

function fakeKV(seed = {}) {
  const store = new Map(Object.entries(seed))
  return {
    store,
    async get(key, type) {
      const v = store.get(key) ?? null
      return v !== null && type === 'json' ? JSON.parse(v) : v
    },
    async put(key, value) { store.set(key, value) },
  }
}

const env = (kv) => ({ SESSION_SECRET: SECRET, PACKOUT_KV: kv })

async function scrapeReq(url, { authed = true } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (authed) {
    const token = await createSession({ sub: 'g-123', name: 'Lawrence' }, SECRET, NOW)
    headers.cookie = `${COOKIE_NAME}=${token}`
  }
  return new Request('https://packout.pages.dev/api/scrape', {
    method: 'POST', headers, body: JSON.stringify({ url }),
  })
}

const PRODUCT_WITH_WEIGHT = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Product', name: 'Ultra Tent 2', weight: { '@type': 'QuantitativeValue', value: 32, unitCode: 'ONZ' },
})}</script></head></html>`

const PRODUCT_NO_WEIGHT = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Product', name: 'Mystery Widget',
})}</script></head></html>`

const htmlPage = body =>
  async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })

// ---------- normalization ----------

test('normalize: tracking params, fragments, case, and trailing slash collapse to one key', () => {
  const a = normalizeProductUrl(new URL('https://WWW.REI.com/product/12345/?utm_source=x&ref=share#reviews'))
  const b = normalizeProductUrl(new URL('https://www.rei.com/product/12345'))
  assert.equal(a, b)
})

test('normalize: different paths stay distinct', () => {
  const a = normalizeProductUrl(new URL('https://rei.com/product/1'))
  const b = normalizeProductUrl(new URL('https://rei.com/product/2'))
  assert.notEqual(a, b)
})

// ---------- read path ----------

test('catalog: a hit answers from KV without fetching the page', async () => {
  const key = 'catalog:' + normalizeProductUrl(new URL('https://rei.com/product/1'))
  const kv = fakeKV({ [key]: JSON.stringify({ name: 'Ultra Tent 2', brand: 'Ultra', kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: 32, perServing: false, sourceUrl: 'https://rei.com/product/1', at: NOW - 1000 }) })
  let fetched = 0
  const res = await handleScrape({
    request: await scrapeReq('https://rei.com/product/1?utm_source=share'),
    env: env(kv), fetcher: async () => { fetched++; throw new Error('no') }, now: NOW,
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.found, true)
  assert.equal(body.weightOz, 32)
  assert.equal(body.catalog, true)
  assert.equal(fetched, 0)
})

test('catalog: signed out never reads the catalog', async () => {
  const kv = fakeKV({ ['catalog:' + normalizeProductUrl(new URL('https://rei.com/p'))]: '{}' })
  const res = await handleScrape({ request: await scrapeReq('https://rei.com/p', { authed: false }), env: env(kv), fetcher: htmlPage(''), now: NOW })
  assert.equal(res.status, 401)
})

// ---------- write path ----------

test('catalog: a scrape that finds a weight publishes the canonical item', async () => {
  const kv = fakeKV()
  const res = await handleScrape({ request: await scrapeReq('https://rei.com/product/9?utm=x'), env: env(kv), fetcher: htmlPage(PRODUCT_WITH_WEIGHT), now: NOW })
  assert.equal(res.status, 200)
  const key = 'catalog:' + normalizeProductUrl(new URL('https://rei.com/product/9'))
  const stored = JSON.parse(kv.store.get(key))
  assert.equal(stored.name, 'Ultra Tent 2')
  assert.equal(stored.weightOz, 32)
  assert.equal(stored.at, NOW)
  assert.equal(stored.sourceUrl, 'https://rei.com/product/9?utm=x')
})

test('catalog: no weight means nothing is published', async () => {
  const kv = fakeKV()
  await handleScrape({ request: await scrapeReq('https://rei.com/product/9'), env: env(kv), fetcher: htmlPage(PRODUCT_NO_WEIGHT), now: NOW })
  assert.equal(kv.store.size, 0)
})

const staleEntry = (at = NOW - 30 * 24 * 3600 * 1000) => JSON.stringify({
  name: 'Old Tent', kcal: null, proteinG: null, carbsG: null, fatG: null,
  weightOz: 40, perServing: false, sourceUrl: 'https://rei.com/product/9', at,
})

test('catalog: a stale hit revalidates — a live page overwrites the entry', async () => {
  const key = 'catalog:' + normalizeProductUrl(new URL('https://rei.com/product/9'))
  const kv = fakeKV({ [key]: staleEntry() })
  const res = await handleScrape({ request: await scrapeReq('https://rei.com/product/9'), env: env(kv), fetcher: htmlPage(PRODUCT_WITH_WEIGHT), now: NOW })
  const body = await res.json()
  assert.equal(body.name, 'Ultra Tent 2')
  const stored = JSON.parse(kv.store.get(key))
  assert.equal(stored.weightOz, 32)
  assert.equal(stored.at, NOW)
})

test('catalog: a stale hit survives a dead page — captured facts are the fallback', async () => {
  const key = 'catalog:' + normalizeProductUrl(new URL('https://rei.com/product/9'))
  const kv = fakeKV({ [key]: staleEntry() })
  const res = await handleScrape({ request: await scrapeReq('https://rei.com/product/9'), env: env(kv), fetcher: async () => { throw new Error('gone') }, now: NOW })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.weightOz, 40)
  assert.equal(body.catalog, true)
})

test('catalog: a page that lost its structured data falls back to the stale entry', async () => {
  const key = 'catalog:' + normalizeProductUrl(new URL('https://rei.com/product/9'))
  const kv = fakeKV({ [key]: staleEntry() })
  const res = await handleScrape({ request: await scrapeReq('https://rei.com/product/9'), env: env(kv), fetcher: htmlPage('<html><body>nothing here</body></html>'), now: NOW })
  const body = await res.json()
  assert.equal(body.found, true)
  assert.equal(body.weightOz, 40)
  assert.equal(body.catalog, true)
})

// Entries captured before brands were extracted hold a brandless name, so a
// fresh-looking one must still re-scrape — otherwise the fix is invisible for
// a week on exactly the products people already looked up.
test('catalog: a brandless entry re-scrapes even inside the fresh window', async () => {
  const key = 'catalog:' + normalizeProductUrl(new URL('https://kifaru.net/products/woobie'))
  const kv = fakeKV({ [key]: staleEntry(NOW - 1000) })
  let fetched = 0
  const page = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'WOOBIE', brand: { '@type': 'Brand', name: 'Kifaru Intl' },
    weight: { '@type': 'QuantitativeValue', value: 21, unitCode: 'ONZ' },
  })}</script></head></html>`
  const res = await handleScrape({
    request: await scrapeReq('https://kifaru.net/products/woobie'),
    env: env(kv), fetcher: async () => { fetched++; return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } }) }, now: NOW,
  })
  assert.equal(fetched, 1)
  assert.equal((await res.json()).name, 'Kifaru Intl WOOBIE')
  assert.equal(JSON.parse(kv.store.get(key)).brand, 'Kifaru Intl')
})

test('catalog: zero and negative weights are never published', async () => {
  for (const value of [0, -3]) {
    const kv = fakeKV()
    const page = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Junk', weight: { '@type': 'QuantitativeValue', value, unitCode: 'ONZ' },
    })}</script></head></html>`
    await handleScrape({ request: await scrapeReq('https://rei.com/product/junk'), env: env(kv), fetcher: htmlPage(page), now: NOW })
    assert.equal(kv.store.size, 0, `weight ${value} must not publish`)
  }
})

test('catalog: KV failures never fail the scrape', async () => {
  const kv = {
    async get() { throw new Error('kv down') },
    async put() { throw new Error('kv down') },
  }
  const res = await handleScrape({ request: await scrapeReq('https://rei.com/product/9'), env: env(kv), fetcher: htmlPage(PRODUCT_WITH_WEIGHT), now: NOW })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).found, true)
})

test('catalog: no KV binding degrades to plain scrape', async () => {
  const res = await handleScrape({ request: await scrapeReq('https://rei.com/product/9'), env: { SESSION_SECRET: SECRET }, fetcher: htmlPage(PRODUCT_WITH_WEIGHT), now: NOW })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).weightOz, 32)
})

// ---------- what a failure tells the person who pasted the link (2026-07-29) ----------
// Three outcomes need three different sentences: this store will never answer
// a robot, the link is wrong, or the site is having a bad day. "The page
// answered 403." told nobody which one they were in.

const statusPage = status => async () => new Response('', { status, headers: { 'content-type': 'text/html' } })

test('a store that refuses robots says so, and says to type it', async () => {
  for (const status of [401, 403, 429]) {
    const res = await handleScrape({
      request: await scrapeReq('https://www.rei.com/product/1'), env: env(fakeKV()),
      fetcher: statusPage(status), now: NOW,
    })
    const { error } = await res.json()
    assert.match(error, /blocks automated lookups/, `status ${status}`)
    assert.match(error, /by hand/, `status ${status} must say what to do instead`)
  }
})

test('a dead link and a failing site are told apart', async () => {
  const gone = await handleScrape({
    request: await scrapeReq('https://example.com/p'), env: env(fakeKV()), fetcher: statusPage(404), now: NOW,
  })
  assert.match((await gone.json()).error, /gone — check the link/)
  const down = await handleScrape({
    request: await scrapeReq('https://example.com/p'), env: env(fakeKV()), fetcher: statusPage(503), now: NOW,
  })
  const { error } = await down.json()
  assert.match(error, /failing right now \(503\)/)
  assert.match(error, /try again later/, 'a transient failure must not tell them to give up')
})

test('a bot wall answering 200 is still reported as a bot wall', async () => {
  // Lancaster's Cloudflare interstitial: HTTP 200, a title, no product.
  const wall = `<html><head><title>Just a moment...</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></head></html>`
  const res = await handleScrape({
    request: await scrapeReq('https://lancasterarchery.com/products/x'), env: env(fakeKV()),
    fetcher: htmlPage(wall), now: NOW,
  })
  const body = await res.json()
  assert.match(body.error, /blocks automated lookups/)
  assert.equal(body.name, undefined, 'the interstitial’s title must never come back as a name')
})

test('captured facts still win over a bot wall', async () => {
  // The store started blocking us; what we already know about the item does
  // not stop being true.
  const key = 'catalog:' + normalizeProductUrl(new URL('https://rei.com/product/9'))
  const kv = fakeKV({ [key]: staleEntry() })
  const res = await handleScrape({
    request: await scrapeReq('https://rei.com/product/9'), env: env(kv), fetcher: statusPage(403), now: NOW,
  })
  const body = await res.json()
  assert.equal(body.weightOz, 40)
  assert.equal(body.catalog, true)
})

// ---------- the catalog grows from browser reads (2026-07-29) ----------
// Lawrence: "if the product is coming from a URL i think it should go into the
// shared library." It has to: the Worker is refused by most storefronts, so a
// catalog only the Worker can write is a catalog that stopped growing. The
// difference is trust — a browser is a client, and a client can send anything.

const catalogReq = async (body, { authed = true } = {}) => {
  const headers = { 'content-type': 'application/json' }
  if (authed) {
    const token = await createSession({ sub: 'g-123', name: 'Lawrence' }, SECRET, NOW)
    headers.cookie = `${COOKIE_NAME}=${token}`
  }
  return new Request('https://packout.pages.dev/api/catalog', {
    method: 'POST', headers, body: JSON.stringify(body),
  })
}

const BROWSER_FACTS = {
  name: 'Stone Glacier R3 7000', brand: 'Stone Glacier', kcal: null, proteinG: null,
  carbsG: null, fatG: null, weightOz: null, weightOptions: [32, 80], perServing: false, problem: null,
}

test('catalog: a browser read publishes under the canonical key', async () => {
  const kv = fakeKV()
  const res = await handleCatalogPut({
    request: await catalogReq({ url: 'https://www.stoneglacier.com/products/r3-7000?utm_source=x', product: BROWSER_FACTS }),
    env: env(kv), now: NOW,
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).stored, true)
  const key = 'catalog:' + normalizeProductUrl(new URL('https://www.stoneglacier.com/products/r3-7000'))
  const stored = JSON.parse(kv.store.get(key))
  assert.equal(stored.name, 'Stone Glacier R3 7000')
  assert.deepEqual(stored.weightOptions, [32, 80])
  assert.equal(stored.via, 'browser', 'provenance is recorded')
  assert.equal(stored.at, NOW)
  assert.equal('sub' in stored, false, 'a shared record names no author')
})

test('catalog: signed out cannot write', async () => {
  const kv = fakeKV()
  const res = await handleCatalogPut({
    request: await catalogReq({ url: 'https://example.com/p', product: BROWSER_FACTS }, { authed: false }),
    env: env(kv), now: NOW,
  })
  assert.equal(res.status, 401)
  assert.equal(kv.store.size, 0)
})

test('catalog: nothing a client sends is taken on faith', () => {
  // Only known fields, only in the extractor's own ranges.
  const clean = cleanProduct({
    name: 'x'.repeat(500), brand: 'y'.repeat(500), kcal: -5, proteinG: 'lots',
    weightOz: 99_999, weightOptions: [12, 'nope', -1, 5000, 18.9], perServing: 'yes',
    admin: true, id: 'gc-hijack', favorite: true,
  })
  assert.equal(clean.name.length, 200)
  assert.equal(clean.brand.length, 60)
  assert.equal(clean.kcal, null, 'a negative calorie count is not a fact')
  assert.equal(clean.proteinG, null)
  assert.equal(clean.weightOz, null, '99,999 oz is not a backcountry item')
  assert.deepEqual(clean.weightOptions, [12, 18.9], 'junk and out-of-range weights drop out')
  assert.equal(clean.perServing, false, 'a truthy string is not true')
  assert.equal('admin' in clean, false)
  assert.equal('id' in clean, false, 'a client cannot choose a catalog id')
  assert.equal('favorite' in clean, false)
})

test('catalog: a bot wall cannot be published as a product', async () => {
  const kv = fakeKV()
  const res = await handleCatalogPut({
    request: await catalogReq({
      url: 'https://lancasterarchery.com/products/x',
      product: { ...BROWSER_FACTS, problem: 'blocked', weightOz: 18.9 },
    }),
    env: env(kv), now: NOW,
  })
  assert.equal(res.status, 422)
  assert.equal(kv.store.size, 0, 'an interstitial must not become everyone’s idea of that product')
})

test('catalog: an empty read is not worth sharing', async () => {
  const kv = fakeKV()
  const res = await handleCatalogPut({
    request: await catalogReq({ url: 'https://example.com/p', product: { name: null, weightOz: null, weightOptions: [] } }),
    env: env(kv), now: NOW,
  })
  assert.equal(res.status, 422)
  assert.equal(kv.store.size, 0)
})

test('catalog: a weightless read never overwrites a captured weight', async () => {
  // Two people read the same page; one of them got the spec table and one did
  // not. The number must survive.
  const key = 'catalog:' + normalizeProductUrl(new URL('https://kifaru.net/products/woobie'))
  const kv = fakeKV({ [key]: JSON.stringify({ name: 'Kifaru Intl WOOBIE', brand: 'Kifaru Intl', weightOz: 21, at: NOW - 5000 }) })
  const res = await handleCatalogPut({
    request: await catalogReq({ url: 'https://kifaru.net/products/woobie', product: { name: 'Kifaru Intl WOOBIE', brand: 'Kifaru Intl', weightOz: null, weightOptions: [] } }),
    env: env(kv), now: NOW,
  })
  assert.equal((await res.json()).stored, false)
  assert.equal(JSON.parse(kv.store.get(key)).weightOz, 21)
})

test('catalog: a private or malformed URL is refused', async () => {
  for (const url of ['http://localhost/p', 'https://127.0.0.1/p', 'not-a-url', 'ftp://example.com/p']) {
    const kv = fakeKV()
    const res = await handleCatalogPut({ request: await catalogReq({ url, product: BROWSER_FACTS }), env: env(kv), now: NOW })
    assert.equal(res.status, 400, url)
    assert.equal(kv.store.size, 0, url)
  }
})

test('catalog: a KV failure is never the user’s problem', async () => {
  const kv = { async get() { throw new Error('kv down') }, async put() { throw new Error('kv down') } }
  const res = await handleCatalogPut({ request: await catalogReq({ url: 'https://example.com/p', product: BROWSER_FACTS }), env: env(kv), now: NOW })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).stored, false)
})

test('catalog: a published browser read answers the next lookup without a fetch', async () => {
  // The whole point, end to end: publish, then scrape the same URL and see the
  // catalog answer it while the fetcher stays untouched.
  const kv = fakeKV()
  await handleCatalogPut({
    request: await catalogReq({ url: 'https://www.stoneglacier.com/products/r3-7000', product: { ...BROWSER_FACTS, weightOz: 32, weightOptions: [] } }),
    env: env(kv), now: NOW,
  })
  let fetched = 0
  const res = await handleScrape({
    request: await scrapeReq('https://www.stoneglacier.com/products/r3-7000'),
    env: env(kv), fetcher: async () => { fetched++; throw new Error('should not fetch') }, now: NOW + 1000,
  })
  const body = await res.json()
  assert.equal(fetched, 0)
  assert.equal(body.catalog, true)
  assert.equal(body.name, 'Stone Glacier R3 7000')
  assert.equal(body.weightOz, 32)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleScrape, normalizeProductUrl } from '../functions/lib/handlers.js'
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
  const kv = fakeKV({ [key]: JSON.stringify({ name: 'Ultra Tent 2', kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: 32, perServing: false, sourceUrl: 'https://rei.com/product/1', at: NOW - 1000 }) })
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

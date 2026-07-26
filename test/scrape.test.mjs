import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleScrape } from '../functions/lib/handlers.js'
import { createSession, COOKIE_NAME } from '../functions/lib/session.js'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const NOW = 1_800_000_000_000
const env = () => ({ SESSION_SECRET: SECRET })

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

const htmlPage = (body, init = {}) =>
  async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' }, ...init })

const PRODUCT_HTML = `<html><head>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'Peak Refuel Chicken Teriyaki',
    nutrition: { '@type': 'NutritionInformation', calories: '250 calories' },
  })}</script>
</head></html>`

test('scrape: signed out is a 401', async () => {
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p', { authed: false }), env: env(), fetcher: htmlPage(''), now: NOW })
  assert.equal(res.status, 401)
})

test('scrape: happy path returns extracted fields', async () => {
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher: htmlPage(PRODUCT_HTML), now: NOW })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.found, true)
  assert.equal(body.name, 'Peak Refuel Chicken Teriyaki')
  assert.equal(body.kcal, 250)
  assert.equal(body.perServing, true)
})

test('scrape: page with no product data reports found: false', async () => {
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher: htmlPage('<html><body>hi</body></html>'), now: NOW })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).found, false)
})

test('scrape: malformed body and non-URLs are 400s', async () => {
  const bad = new Request('https://packout.pages.dev/api/scrape', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=${await createSession({ sub: 'g', name: '' }, SECRET, NOW)}` },
    body: 'nope',
  })
  assert.equal((await handleScrape({ request: bad, env: env(), fetcher: htmlPage(''), now: NOW })).status, 400)
  assert.equal((await handleScrape({ request: await scrapeReq('not a url'), env: env(), fetcher: htmlPage(''), now: NOW })).status, 400)
  assert.equal((await handleScrape({ request: await scrapeReq('ftp://example.com/x'), env: env(), fetcher: htmlPage(''), now: NOW })).status, 400)
})

test('scrape: localhost, .local, and IP-literal hosts are refused', async () => {
  for (const url of [
    'http://localhost/admin',
    'http://foo.local/x',
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://[::1]/x',
  ]) {
    const res = await handleScrape({ request: await scrapeReq(url), env: env(), fetcher: htmlPage(''), now: NOW })
    assert.equal(res.status, 400, `${url} should be refused`)
  }
})

test('scrape: upstream failure is a 502', async () => {
  const boom = async () => { throw new Error('network down') }
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher: boom, now: NOW })
  assert.equal(res.status, 502)
  const res2 = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher: htmlPage('', { status: 404 }), now: NOW })
  assert.equal(res2.status, 502)
})

test('scrape: redirect to a blocked host is refused, not followed', async () => {
  const redirecting = async () =>
    new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher: redirecting, now: NOW })
  assert.equal(res.status, 400)
})

test('scrape: a legitimate redirect is followed to the product page', async () => {
  let calls = 0
  const fetcher = async url => {
    calls++
    if (calls === 1) return new Response(null, { status: 301, headers: { location: 'https://www.example.com/p' } })
    assert.equal(url, 'https://www.example.com/p')
    return new Response(PRODUCT_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
  }
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher, now: NOW })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).name, 'Peak Refuel Chicken Teriyaki')
})

test('scrape: endless redirect chains give up with a 502', async () => {
  const loop = async () =>
    new Response(null, { status: 302, headers: { location: 'https://example.com/again' } })
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher: loop, now: NOW })
  assert.equal(res.status, 502)
})

test('scrape: oversized chunked bodies are truncated, not buffered whole', async () => {
  // Product data in the first chunk, then far more filler than the cap —
  // extraction must still succeed from the truncated prefix.
  const enc = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(PRODUCT_HTML))
      for (let i = 0; i < 40; i++) controller.enqueue(enc.encode('x'.repeat(65_536)))
      controller.close()
    },
  })
  const fetcher = async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
  const res = await handleScrape({ request: await scrapeReq('https://example.com/p'), env: env(), fetcher, now: NOW })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).name, 'Peak Refuel Chicken Teriyaki')
})

test('scrape: non-HTML content type is refused', async () => {
  const pdf = async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })
  const res = await handleScrape({ request: await scrapeReq('https://example.com/f.pdf'), env: env(), fetcher: pdf, now: NOW })
  assert.equal(res.status, 422)
})

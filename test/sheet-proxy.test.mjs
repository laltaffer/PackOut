import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSheetRef, handleSheet } from '../functions/lib/handlers.js'
import { createSession, COOKIE_NAME } from '../functions/lib/session.js'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const NOW = 1_800_000_000_000
const env = () => ({ SESSION_SECRET: SECRET })

const SHARE_URL = 'https://docs.google.com/spreadsheets/d/1--nH9Ztl6gGDQE1MwrE5vzGtVowtLAUlRfpRIAyS5wg/edit?usp=sharing'

test('extractSheetRef reads the id from a share link', () => {
  assert.deepEqual(extractSheetRef(SHARE_URL),
    { id: '1--nH9Ztl6gGDQE1MwrE5vzGtVowtLAUlRfpRIAyS5wg', gid: null })
})

test('extractSheetRef keeps the tab the user was looking at', () => {
  assert.deepEqual(
    extractSheetRef('https://docs.google.com/spreadsheets/d/abc_123/edit#gid=456'),
    { id: 'abc_123', gid: '456' })
})

test('extractSheetRef refuses anything that is not a Google Sheets link', () => {
  assert.equal(extractSheetRef('https://example.com/spreadsheets/d/abc/edit'), null)
  assert.equal(extractSheetRef('https://docs.google.com/document/d/abc/edit'), null)
  assert.equal(extractSheetRef('not a url'), null)
})

async function sheetReq(url, { authed = true } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (authed) {
    const token = await createSession({ sub: 'g-123', name: 'Lawrence' }, SECRET, NOW)
    headers.cookie = `${COOKIE_NAME}=${token}`
  }
  return new Request('https://packout.pages.dev/api/sheet', {
    method: 'POST', headers, body: JSON.stringify({ url }),
  })
}

const answer = (body, type, status = 200) =>
  async url => {
    answer.lastUrl = url
    return new Response(body, { status, headers: { 'content-type': type } })
  }

test('sheet: signed out is a 401', async () => {
  const res = await handleSheet({ request: await sheetReq(SHARE_URL, { authed: false }), env: env(), fetcher: answer('a,b', 'text/csv'), now: NOW })
  assert.equal(res.status, 401)
})

test('sheet: a link-shared sheet comes back as CSV, fetched from the fixed export endpoint', async () => {
  const fetcher = answer('PERSONAL ITEMS,,\nWipes,,', 'text/csv')
  const res = await handleSheet({ request: await sheetReq(SHARE_URL + '#gid=99'), env: env(), fetcher, now: NOW })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).csv, 'PERSONAL ITEMS,,\nWipes,,')
  assert.equal(answer.lastUrl,
    'https://docs.google.com/spreadsheets/d/1--nH9Ztl6gGDQE1MwrE5vzGtVowtLAUlRfpRIAyS5wg/export?format=csv&gid=99')
})

test('sheet: a non-Sheets link is a 400, and no fetch happens', async () => {
  answer.lastUrl = null
  const res = await handleSheet({ request: await sheetReq('https://evil.example/x'), env: env(), fetcher: answer('x', 'text/csv'), now: NOW })
  assert.equal(res.status, 400)
  assert.equal(answer.lastUrl, null)
})

test('sheet: an HTML answer means the sheet is not link-shared, and the error says how to fix it', async () => {
  const res = await handleSheet({ request: await sheetReq(SHARE_URL), env: env(), fetcher: answer('<html>login</html>', 'text/html'), now: NOW })
  assert.equal(res.status, 403)
  assert.match((await res.json()).error, /Anyone with the link/)
})

test('sheet: an upstream failure is reported plainly', async () => {
  const res = await handleSheet({ request: await sheetReq(SHARE_URL), env: env(), fetcher: answer('missing', 'text/plain', 404), now: NOW })
  assert.equal(res.status, 502)
})

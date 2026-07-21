import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSession, verifySession, sessionCookie, clearedCookie, readCookie } from '../functions/lib/session.js'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const NOW = 1_800_000_000_000 // fixed clock, ms

test('a session round-trips: sign then verify returns the profile', async () => {
  const token = await createSession({ sub: 'g-123', name: 'Lawrence' }, SECRET, NOW)
  const s = await verifySession(token, SECRET, NOW + 1000)
  assert.equal(s.sub, 'g-123')
  assert.equal(s.name, 'Lawrence')
})

test('an expired session verifies to null', async () => {
  const token = await createSession({ sub: 'g-123', name: 'L' }, SECRET, NOW)
  const thirtyOneDays = NOW + 31 * 24 * 3600 * 1000
  assert.equal(await verifySession(token, SECRET, thirtyOneDays), null)
})

test('a tampered payload is rejected', async () => {
  const token = await createSession({ sub: 'g-123', name: 'L' }, SECRET, NOW)
  const [payload, sig] = token.split('.')
  const forged = btoa(JSON.stringify({ sub: 'g-999', name: 'Mallory', exp: NOW + 9e9 }))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  assert.equal(await verifySession(`${forged}.${sig}`, SECRET, NOW), null)
  assert.equal(await verifySession(`${payload}.AAAA`, SECRET, NOW), null)
  assert.equal(await verifySession('garbage', SECRET, NOW), null)
  assert.equal(await verifySession('', SECRET, NOW), null)
})

test('a session signed with a different secret is rejected', async () => {
  const token = await createSession({ sub: 'g-123', name: 'L' }, SECRET, NOW)
  assert.equal(await verifySession(token, 'other-secret', NOW), null)
})

test('cookie helpers: HttpOnly attributes present; cleared cookie expires; reader finds the value', () => {
  const c = sessionCookie('abc.def')
  assert.match(c, /^po_session=abc\.def/)
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=']) {
    assert.ok(c.includes(attr), `cookie carries ${attr}`)
  }
  assert.match(clearedCookie(), /Max-Age=0/)
  assert.equal(readCookie('a=1; po_session=tok.sig; b=2', 'po_session'), 'tok.sig')
  assert.equal(readCookie('', 'po_session'), null)
  assert.equal(readCookie(null, 'po_session'), null)
})

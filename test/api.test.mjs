import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleAuth, handleMe, handleLogout, handleStateGet, handleStatePut } from '../functions/lib/handlers.js'
import { createSession, COOKIE_NAME } from '../functions/lib/session.js'

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const NOW = 1_800_000_000_000

function mockKV(store = new Map()) {
  return {
    store,
    async get(key, type) {
      const v = store.get(key)
      if (v === undefined) return null
      return type === 'json' ? JSON.parse(v) : v
    },
    async put(key, value) { store.set(key, value) },
  }
}

function env(kv = mockKV()) {
  return { SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: CLIENT_ID, PACKOUT_KV: kv }
}

function tokeninfo(payload, status = 200) {
  return async () => new Response(JSON.stringify(payload), { status })
}

const GOOD_TOKEN = {
  aud: CLIENT_ID, sub: 'g-123', name: 'Lawrence', email_verified: 'true',
  exp: String(Math.floor(NOW / 1000) + 300),
}

function authReq(credential = 'tok') {
  return new Request('https://packout.pages.dev/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
}

async function sessionRequest(url, { method = 'GET', body, sub = 'g-123' } = {}) {
  const token = await createSession({ sub, name: 'Lawrence' }, SECRET, NOW)
  return new Request(url, {
    method,
    headers: { cookie: `${COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const STATE = {
  schemaVersion: 1,
  trips: [{ id: 't1', name: 'Alaska', destination: 'AK', startDate: '2026-08-01', weightLbs: 205, days: [{ intensity: 'medium' }] }],
  library: [{ id: 'f1', name: 'Bar', kcal: 400, carbsG: 44, fatG: 8, proteinG: 12, weightOz: 3, favorite: false }],
}

test('auth: a valid Google token yields a session cookie and the profile', async () => {
  const res = await handleAuth({ request: authReq(), env: env(), fetcher: tokeninfo(GOOD_TOKEN), now: NOW })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('set-cookie'), new RegExp(`^${COOKIE_NAME}=`))
  const body = await res.json()
  assert.equal(body.name, 'Lawrence')
})

test('auth: wrong audience, unverified email, and expired tokens are all rejected', async () => {
  for (const bad of [
    { ...GOOD_TOKEN, aud: 'someone-else' },
    { ...GOOD_TOKEN, email_verified: 'false' },
    { ...GOOD_TOKEN, exp: String(Math.floor(NOW / 1000) - 10) },
  ]) {
    const res = await handleAuth({ request: authReq(), env: env(), fetcher: tokeninfo(bad), now: NOW })
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('set-cookie'), null, 'no cookie on rejection')
  }
  const googleDown = await handleAuth({ request: authReq(), env: env(), fetcher: tokeninfo({}, 400), now: NOW })
  assert.equal(googleDown.status, 401)
})

test('me: valid session returns the profile; signed-out is a clean 200, never a console-red 401', async () => {
  const ok = await handleMe({ request: await sessionRequest('https://x/api/me'), env: env(), now: NOW })
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).sub, 'g-123')
  const anon = await handleMe({ request: new Request('https://x/api/me'), env: env(), now: NOW })
  assert.equal(anon.status, 200)
  assert.deepEqual(await anon.json(), { signedIn: false })
})

test('logout clears the cookie', async () => {
  const res = await handleLogout()
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/)
})

test('state get: empty profile returns null state; stored profile returns blob + updatedAt', async () => {
  const kv = mockKV()
  const empty = await handleStateGet({ request: await sessionRequest('https://x/api/state'), env: env(kv), now: NOW })
  assert.equal(empty.status, 200)
  assert.deepEqual(await empty.json(), { state: null, updatedAt: 0 })
  await kv.put('state:g-123', JSON.stringify({ state: STATE, updatedAt: 111 }))
  const full = await handleStateGet({ request: await sessionRequest('https://x/api/state'), env: env(kv), now: NOW })
  const body = await full.json()
  assert.equal(body.updatedAt, 111)
  assert.equal(body.state.trips[0].name, 'Alaska')
})

test('state put: stores the blob keyed by the session sub', async () => {
  const kv = mockKV()
  const res = await handleStatePut({
    request: await sessionRequest('https://x/api/state', { method: 'PUT', body: { state: STATE, updatedAt: 500 } }),
    env: env(kv), now: NOW,
  })
  assert.equal(res.status, 200)
  const stored = JSON.parse(kv.store.get('state:g-123'))
  assert.equal(stored.updatedAt, 500)
})

test('state put: a stale write never clobbers a newer server copy — 409 with the server updatedAt', async () => {
  const kv = mockKV()
  await kv.put('state:g-123', JSON.stringify({ state: STATE, updatedAt: 900 }))
  const res = await handleStatePut({
    request: await sessionRequest('https://x/api/state', { method: 'PUT', body: { state: STATE, updatedAt: 500 } }),
    env: env(kv), now: NOW,
  })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).updatedAt, 900)
  assert.equal(JSON.parse(kv.store.get('state:g-123')).updatedAt, 900, 'server copy untouched')
})

test('state endpoints require a session; put validates the blob shape', async () => {
  const anonGet = await handleStateGet({ request: new Request('https://x/api/state'), env: env(), now: NOW })
  assert.equal(anonGet.status, 401)
  const anonPut = await handleStatePut({ request: new Request('https://x/api/state', { method: 'PUT' }), env: env(), now: NOW })
  assert.equal(anonPut.status, 401)
  const garbage = await handleStatePut({
    request: await sessionRequest('https://x/api/state', { method: 'PUT', body: { state: { schemaVersion: 1, trips: [{ id: '"><img>', name: 'x' }], library: [] }, updatedAt: 1 } }),
    env: env(), now: NOW,
  })
  assert.equal(garbage.status, 422)
})

test('state put: profiles are isolated by sub', async () => {
  const kv = mockKV()
  await handleStatePut({
    request: await sessionRequest('https://x/api/state', { method: 'PUT', body: { state: STATE, updatedAt: 1 }, sub: 'g-buddy' }),
    env: env(kv), now: NOW,
  })
  assert.ok(kv.store.has('state:g-buddy'))
  assert.ok(!kv.store.has('state:g-123'))
})

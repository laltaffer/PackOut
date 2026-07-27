import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookupPlace } from '../functions/lib/place.js'

const NOW = Date.UTC(2026, 6, 27) // 2026-07-27

const GEO = {
  results: [{
    name: 'Brooks Range', admin1: 'Alaska', country_code: 'US',
    latitude: 68.12345, longitude: -150.98765, elevation: 378,
  }],
}
const daily = (n, { hi = 52, lo = 38, rain = 0.3 } = {}) => ({
  daily: {
    temperature_2m_max: Array(n).fill(hi),
    temperature_2m_min: Array(n).fill(lo),
    precipitation_sum: Array(n).fill(rain),
  },
})

// A fetcher that answers by host and records what it was asked for.
function stub(routes) {
  const calls = []
  return {
    calls,
    fetcher: async url => {
      calls.push(url)
      const key = Object.keys(routes).find(k => url.includes(k))
      if (!key) throw new Error(`unrouted ${url}`)
      const r = routes[key]
      if (r instanceof Error) throw r
      return { ok: true, json: async () => r }
    },
  }
}

function memKv() {
  const m = new Map()
  return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, JSON.parse(v)) } }
}

test('a destination resolves to coordinates, elevation and a label', async () => {
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': daily(5) })
  const res = await lookupPlace({ query: ' Brooks Range ', startDate: '2026-08-01', days: 5, fetcher: s.fetcher, now: NOW })
  assert.equal(res.ok, true)
  assert.equal(res.body.label, 'Brooks Range, Alaska, US')
  assert.equal(res.body.lat, 68.1235)
  // 4 dp is ~11 m; Math.round breaks negative halves upward and that is fine.
  assert.equal(res.body.lon, -150.9876)
  assert.equal(res.body.elevationFt, 1240) // 378 m
  assert.equal(res.body.at, NOW)
})

test('a trip inside the forecast horizon gets the forecast, for its own dates', async () => {
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': daily(5, { rain: 0.4 }) })
  const res = await lookupPlace({ query: 'Brooks Range', startDate: '2026-08-01', days: 5, fetcher: s.fetcher, now: NOW })
  assert.equal(res.body.climate.source, 'forecast')
  assert.equal(res.body.climate.tempHiF, 52)
  assert.equal(res.body.climate.tempLoF, 38)
  assert.equal(res.body.climate.precipDays, 5)
  assert.equal(res.body.climate.days, 5)
  assert.equal(res.body.climate.precipIn, 2)
  const asked = s.calls.find(u => u.includes('forecast'))
  assert.ok(asked.includes('start_date=2026-08-01'))
  assert.ok(asked.includes('end_date=2026-08-05'), 'five days ends on the fifth')
})

test('a trip beyond the horizon falls back to last year, and says so', async () => {
  const s = stub({ 'geocoding-api': GEO, 'archive-api': daily(4) })
  const res = await lookupPlace({ query: 'Brooks Range', startDate: '2026-11-01', days: 4, fetcher: s.fetcher, now: NOW })
  assert.equal(res.body.climate.source, 'last-year')
  const asked = s.calls.find(u => u.includes('archive'))
  assert.ok(asked.includes('start_date=2025-11-01'), asked)
})

test('a dry week reads as dry: only real rain counts a day wet', async () => {
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': daily(5, { rain: 0.02 }) })
  const res = await lookupPlace({ query: 'x', startDate: '2026-08-01', days: 5, fetcher: s.fetcher, now: NOW })
  assert.equal(res.body.climate.precipDays, 0)
})

test('missing days are dropped, never counted as dry', async () => {
  const s = stub({
    'geocoding-api': GEO,
    'api.open-meteo.com/v1/forecast': {
      daily: {
        temperature_2m_max: [50, null, 54],
        temperature_2m_min: [40, null, 42],
        precipitation_sum: [0.5, null, 0.5],
      },
    },
  })
  const res = await lookupPlace({ query: 'x', startDate: '2026-08-01', days: 3, fetcher: s.fetcher, now: NOW })
  assert.equal(res.body.climate.days, 2)
  assert.equal(res.body.climate.precipDays, 2)
  assert.equal(res.body.climate.tempHiF, 52)
})

test('an unknown place is a clean 404, not a crash', async () => {
  const s = stub({ 'geocoding-api': { results: [] } })
  const res = await lookupPlace({ query: 'Nowhere At All', fetcher: s.fetcher, now: NOW })
  assert.equal(res.ok, false)
  assert.equal(res.status, 404)
  assert.match(res.body.error, /keeps what you typed/)
})

test('an empty or oversized query never reaches the network', async () => {
  const s = stub({})
  assert.equal((await lookupPlace({ query: '   ', fetcher: s.fetcher, now: NOW })).status, 400)
  assert.equal((await lookupPlace({ query: 'x'.repeat(200), fetcher: s.fetcher, now: NOW })).status, 400)
  assert.equal(s.calls.length, 0)
})

test('a dead weather host still yields the place — conditions are the bonus', async () => {
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': new Error('down') })
  const res = await lookupPlace({ query: 'Brooks Range', startDate: '2026-08-01', days: 5, fetcher: s.fetcher, now: NOW })
  assert.equal(res.ok, true)
  assert.equal(res.body.climate, null)
})

test('a dead geocoder is a 502, not a bad place', async () => {
  const s = stub({ 'geocoding-api': new Error('down') })
  const res = await lookupPlace({ query: 'Brooks Range', fetcher: s.fetcher, now: NOW })
  assert.equal(res.status, 502)
})

test('a missing start date skips the weather call entirely', async () => {
  const s = stub({ 'geocoding-api': GEO })
  const res = await lookupPlace({ query: 'Brooks Range', fetcher: s.fetcher, now: NOW })
  assert.equal(res.body.climate, null)
  assert.equal(s.calls.length, 1)
})

test('the second ask for the same trip is served from KV, not the network', async () => {
  const kv = memKv()
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': daily(5) })
  const args = { query: 'Brooks Range', startDate: '2026-08-01', days: 5, fetcher: s.fetcher, kv, now: NOW }
  await lookupPlace(args)
  const before = s.calls.length
  const again = await lookupPlace({ ...args, query: 'brooks range' }) // key is case-folded
  assert.equal(s.calls.length, before, 'no second round trip')
  assert.equal(again.body.cached, true)
  assert.equal(again.body.label, 'Brooks Range, Alaska, US')
})

test('a different trip window is a different question', async () => {
  const kv = memKv()
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': daily(5) })
  const args = { query: 'Brooks Range', startDate: '2026-08-01', days: 5, fetcher: s.fetcher, kv, now: NOW }
  await lookupPlace(args)
  await lookupPlace({ ...args, days: 6 })
  assert.equal(s.calls.filter(u => u.includes('geocoding')).length, 2)
})

test('a broken KV never breaks the lookup', async () => {
  const dead = { get: async () => { throw new Error('kv down') }, put: async () => { throw new Error('kv down') } }
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': daily(5) })
  const res = await lookupPlace({ query: 'Brooks Range', startDate: '2026-08-01', days: 5, fetcher: s.fetcher, kv: dead, now: NOW })
  assert.equal(res.ok, true)
})

test('the query is encoded, so a hostile destination cannot forge a request', async () => {
  const s = stub({ 'geocoding-api': GEO })
  await lookupPlace({ query: 'Denali&latitude=0#x', fetcher: s.fetcher, now: NOW })
  const asked = s.calls[0]
  assert.ok(asked.includes('name=Denali%26latitude%3D0%23x'), asked)
  assert.equal(asked.split('&').length, 4, 'no injected parameters')
})

test('an absurd trip length is capped before it reaches the archive', async () => {
  const s = stub({ 'geocoding-api': GEO, 'archive-api': daily(30) })
  await lookupPlace({ query: 'x', startDate: '2027-01-01', days: 9999, fetcher: s.fetcher, now: NOW })
  const asked = s.calls.find(u => u.includes('archive'))
  assert.ok(asked.includes('start_date=2026-01-01') && asked.includes('end_date=2026-01-30'), asked)
})

test('a nonsense date or length simply yields no conditions', async () => {
  const s = stub({ 'geocoding-api': GEO })
  for (const args of [{ startDate: 'soon', days: 5 }, { startDate: '2026-08-01', days: 0 }, { startDate: '2026-08-01', days: -3 }]) {
    const res = await lookupPlace({ query: 'x', ...args, fetcher: s.fetcher, now: NOW })
    assert.equal(res.body.climate, null)
  }
  assert.equal(s.calls.length, 3, 'geocode only, never a weather call')
})

test('a weather outage is not cached — the next ask tries again', async () => {
  // Codex 2026-07-27: null climate fell into the 30-day history TTL, so one
  // upstream blip suppressed conditions for a month.
  const kv = memKv()
  const s = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': new Error('down') })
  const args = { query: 'Brooks Range', startDate: '2026-08-01', days: 5, kv, now: NOW }
  const first = await lookupPlace({ ...args, fetcher: s.fetcher })
  assert.equal(first.body.climate, null)
  assert.equal(kv.m.size, 0, 'nothing worth remembering')
  const healthy = stub({ 'geocoding-api': GEO, 'api.open-meteo.com/v1/forecast': daily(5) })
  const second = await lookupPlace({ ...args, fetcher: healthy.fetcher })
  assert.equal(second.body.climate.source, 'forecast')
})

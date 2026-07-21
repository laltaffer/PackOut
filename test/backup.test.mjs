import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateImport } from '../js/engine.js'

const GOOD = {
  schemaVersion: 1,
  trips: [{ id: 't1', name: 'Alaska', destination: 'AK', startDate: '2026-08-01', weightLbs: 205, days: [{ intensity: 'medium' }] }],
  library: [{ id: 'f1', name: 'Bar', kcal: 400, carbsG: 44, fatG: 8, proteinG: 12, weightOz: 3, favorite: false }],
}

test('a valid export round-trips through JSON unchanged and validates', () => {
  const parsed = JSON.parse(JSON.stringify(GOOD))
  const r = validateImport(parsed)
  assert.equal(r.ok, true)
  assert.deepEqual(parsed, GOOD)
})

test('rejects wrong schema version with a clear message', () => {
  const r = validateImport({ ...GOOD, schemaVersion: 99 })
  assert.equal(r.ok, false)
  assert.match(r.error, /version/i)
})

test('rejects missing or malformed collections', () => {
  assert.equal(validateImport({ schemaVersion: 1, trips: [] }).ok, false)
  assert.equal(validateImport({ schemaVersion: 1, library: [] }).ok, false)
  assert.equal(validateImport(null).ok, false)
  assert.equal(validateImport('nope').ok, false)
})

test('rejects foods and trips that lack required fields', () => {
  const badFood = { ...GOOD, library: [{ id: 'x', name: '' }] }
  assert.equal(validateImport(badFood).ok, false)
  const badTrip = { ...GOOD, trips: [{ id: 't', name: 'No days' }] }
  assert.equal(validateImport(badTrip).ok, false)
})

function withDay(day) {
  return JSON.parse(JSON.stringify({ ...GOOD, trips: [{ ...GOOD.trips[0], days: [day] }] }))
}

test('rejects partial meals objects that would crash totals', () => {
  const r = validateImport(withDay({ intensity: 'medium', meals: { dinner: [] } }))
  assert.equal(r.ok, false)
})

test('rejects malformed entries, quantities, intensities, and packed maps', () => {
  assert.equal(validateImport(withDay({ intensity: 'brutal' })).ok, false)
  const badQty = { intensity: 'medium', meals: { electrolytes: [], breakfast: [], lunch: [], dinner: [{ foodId: 'f1', qty: 0 }], snacks: [] } }
  assert.equal(validateImport(withDay(badQty)).ok, false)
  const badSnack = { intensity: 'medium', meals: { electrolytes: [], breakfast: [], lunch: [], dinner: [], snacks: [{ nope: true }] } }
  assert.equal(validateImport(withDay(badSnack)).ok, false)
  assert.equal(validateImport(withDay({ intensity: 'easy', packed: { f1: 'yes' } })).ok, false)
})

test('rejects non-numeric macros (markup cannot reach the DOM through numbers)', () => {
  const evil = { ...GOOD, library: [{ ...GOOD.library[0], kcal: '<img onerror=1>' }] }
  assert.equal(validateImport(evil).ok, false)
  const evilMacro = { ...GOOD, library: [{ ...GOOD.library[0], carbsG: '44<b>' }] }
  assert.equal(validateImport(evilMacro).ok, false)
})

test('rejects ids outside the safe charset (attribute-injection vector)', () => {
  const evilFoodId = { ...GOOD, library: [{ ...GOOD.library[0], id: '"><img src=x onerror=alert(1)>' }] }
  assert.equal(validateImport(evilFoodId).ok, false)
  const evilTripId = { ...GOOD, trips: [{ ...GOOD.trips[0], id: 'a" onmouseover="x' }] }
  assert.equal(validateImport(evilTripId).ok, false)
  const evilEntryId = withDay({
    intensity: 'medium',
    meals: { electrolytes: [], breakfast: [{ foodId: '<script>', qty: 1 }], lunch: [], dinner: [], snacks: [] },
  })
  assert.equal(validateImport(evilEntryId).ok, false)
  const evilPackedKey = withDay({ intensity: 'medium', packed: { '"><i>': 1 } })
  assert.equal(validateImport(evilPackedKey).ok, false)
})

test('rejects duplicate ids and zero-day trips', () => {
  const dup = { ...GOOD, library: [GOOD.library[0], { ...GOOD.library[0] }] }
  assert.equal(validateImport(dup).ok, false)
  const zeroDays = { ...GOOD, trips: [{ ...GOOD.trips[0], days: [] }] }
  assert.equal(validateImport(zeroDays).ok, false)
})

test('meal style: accepts partial valid values, rejects unknown slots and styles', () => {
  const sitdown = { ...GOOD, trips: [{ ...GOOD.trips[0], mealStyle: { breakfast: 'sitdown' } }] }
  assert.equal(validateImport(sitdown).ok, true)
  const badStyle = { ...GOOD, trips: [{ ...GOOD.trips[0], mealStyle: { breakfast: 'zorp' } }] }
  assert.equal(validateImport(badStyle).ok, false)
  const badSlot = { ...GOOD, trips: [{ ...GOOD.trips[0], mealStyle: { brunch: 'mobile' } }] }
  assert.equal(validateImport(badSlot).ok, false)
  const notObject = { ...GOOD, trips: [{ ...GOOD.trips[0], mealStyle: 'mobile' }] }
  assert.equal(validateImport(notObject).ok, false)
})

test('accepts a valid full day plan with packed quantities', () => {
  const good = withDay({
    intensity: 'medium',
    meals: { electrolytes: [], breakfast: [{ foodId: 'f1', qty: 2 }], lunch: [], dinner: [], snacks: [{ items: [{ foodId: 'f1', qty: 1 }] }] },
    packed: { f1: 2 },
  })
  assert.equal(validateImport(good).ok, true)
})

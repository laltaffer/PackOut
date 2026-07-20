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

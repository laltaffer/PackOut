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

test('customKcal imports as a positive number or not at all (issue #27)', () => {
  assert.equal(validateImport(withDay({ intensity: 'medium', customKcal: 3000 })).ok, true)
  assert.equal(validateImport(withDay({ intensity: 'medium', customKcal: null })).ok, true)
  assert.equal(validateImport(withDay({ intensity: 'medium', customKcal: '3000' })).ok, false)
  assert.equal(validateImport(withDay({ intensity: 'medium', customKcal: -100 })).ok, false)
  assert.equal(validateImport(withDay({ intensity: 'medium', customKcal: 0 })).ok, false)
  // NaN can't ride JSON (withDay round-trips it to null), so inject it raw —
  // the gate also guards hand-built objects on the sync path.
  const nanDay = { ...GOOD, trips: [{ ...GOOD.trips[0], days: [{ intensity: 'medium', customKcal: NaN }] }] }
  assert.equal(validateImport(nanDay).ok, false)
})

test('rejects non-string food urls (objects would crash the edit form)', () => {
  const evil = { ...GOOD, library: [{ ...GOOD.library[0], url: { toString: null } }] }
  assert.equal(validateImport(evil).ok, false)
  const fine = { ...GOOD, library: [{ ...GOOD.library[0], url: 'https://example.com/p' }] }
  assert.equal(validateImport(fine).ok, true)
  const alsoFine = { ...GOOD, library: [{ ...GOOD.library[0], url: null }] }
  assert.equal(validateImport(alsoFine).ok, true)
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
    meals: { electrolytes: [], breakfast: [{ foodId: 'f1', qty: 2 }], lunch: [], dinner: [], snacks: [{ foodId: 'f1', qty: 1 }] },
    packed: { f1: 2 },
  })
  assert.equal(validateImport(good).ok, true)
})

test('accepts the legacy snack-bundle shape — old backups still import', () => {
  const legacy = withDay({
    intensity: 'medium',
    meals: { electrolytes: [], breakfast: [], lunch: [], dinner: [], snacks: [{ items: [{ foodId: 'f1', qty: 1 }] }] },
  })
  assert.equal(validateImport(legacy).ok, true)
})

test('validateImport: the gear library is gated like everything else that renders', () => {
  // Codex 2026-07-27 (high): gearLibrary went unvalidated, and a gear weight
  // is interpolated into innerHTML — a crafted backup could carry markup.
  const base = {
    schemaVersion: 1, library: [], trips: [{
      id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200, days: [{ intensity: 'medium' }],
    }],
  }
  const withGear = gearLibrary => validateImport({ ...base, gearLibrary })
  const ok = { id: 'ob-tent', name: 'Kifaru SuperTarp', category: 'Shelter/Sleeping', weightOz: 40 }
  assert.equal(withGear([ok]).ok, true)
  assert.equal(withGear([{ ...ok, weightOz: null }]).ok, true)
  assert.equal(withGear(undefined).ok, true, 'a backup predating gear still imports')
  assert.equal(withGear([]).ok, true)

  assert.equal(withGear([{ ...ok, weightOz: '<img src=x onerror=alert(1)>' }]).ok, false)
  assert.equal(withGear([{ ...ok, weightOz: 'heavy' }]).ok, false)
  assert.equal(withGear([{ ...ok, name: '<script>x</script>'.padEnd(300, 'y') }]).ok, false)
  assert.equal(withGear([{ ...ok, name: '' }]).ok, false)
  assert.equal(withGear([{ ...ok, category: 42 }]).ok, false)
  assert.equal(withGear([{ ...ok, id: 'has spaces' }]).ok, false)
  assert.equal(withGear([ok, ok]).ok, false, 'duplicate ids')
  assert.equal(withGear([{ ...ok, url: 5 }]).ok, false)
  assert.equal(withGear('nope').ok, false)
  assert.equal(withGear([null]).ok, false)
})

test('validateImport: gear categories and weights must be usable, not merely typed', () => {
  // Codex round 2: an unknown category makes an item invisible in the gear
  // screen's fixed grouping while still counting toward weight and packed
  // totals; a zero or negative ounce subtracts from the pack.
  const base = {
    schemaVersion: 1, library: [], trips: [{
      id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200, days: [{ intensity: 'medium' }],
    }],
  }
  const g = extra => validateImport({
    ...base,
    gearLibrary: [{ id: 'ob-tent', name: 'Tent', category: 'Shelter/Sleeping', weightOz: 40, ...extra }],
  }).ok
  assert.equal(g({}), true)
  assert.equal(g({ weightOz: null }), true)
  assert.equal(g({ category: 'Pack' }), true, 'legacy names pass the gate, migration renames them')
  assert.equal(g({ category: 'Food kit' }), true)

  assert.equal(g({ category: 'Nowhere' }), false)
  assert.equal(g({ category: '' }), false)
  assert.equal(g({ weightOz: 0 }), false)
  assert.equal(g({ weightOz: -5 }), false)
  assert.equal(g({ weightOz: Infinity }), false)
})

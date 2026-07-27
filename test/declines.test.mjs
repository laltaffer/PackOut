import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftDay, draftEmptyDays, declinedIds, validateImport } from '../js/engine.js'

// A library where the same slot can be filled by a starred food or an
// unstarred one, so "favorites first" and "declines stick" are both visible.
const LIB = [
  { id: 'curry', name: 'Peak Chicken Curry', kcal: 850, carbsG: 66, fatG: 44, proteinG: 44, weightOz: 5.4, favorite: true, slotHint: 'dinner' },
  { id: 'marinara', name: 'Peak Beef Marinara', kcal: 900, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.4, favorite: true, slotHint: 'dinner' },
  { id: 'pico', name: 'Packit Happy Hour Pico de Gallo', kcal: 500, carbsG: 60, fatG: 20, proteinG: 10, weightOz: 4, favorite: false, slotHint: 'dinner' },
  { id: 'bar', name: 'ProBar Peanut Butter', kcal: 400, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3, favorite: true, slotHint: 'breakfast' },
  { id: 'oats', name: 'Store-brand oats', kcal: 300, carbsG: 54, fatG: 5, proteinG: 8, weightOz: 3, favorite: false, slotHint: 'breakfast' },
  { id: 'gummy', name: 'Haribo Goldbears', kcal: 100, carbsG: 22, fatG: 0, proteinG: 1, weightOz: 1, favorite: true, slotHint: 'snack' },
  { id: 'waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: 5, proteinG: 1, weightOz: 1, favorite: true, slotHint: 'snack' },
  { id: 'gel', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: 0, proteinG: 0, weightOz: 1.1, favorite: true, slotHint: 'snack' },
  { id: 'chalk', name: 'Unloved chalk bar', kcal: 100, carbsG: 20, fatG: 2, proteinG: 1, weightOz: 1, favorite: false, slotHint: 'snack' },
  { id: 'stick', name: 'FATTY Meat Stick', kcal: 200, carbsG: 2, fatG: 15, proteinG: 13, weightOz: 2, favorite: true, slotHint: 'snack' },
]

const NONE = new Set()
const mkTrip = (days = 3, extra = {}) => ({
  id: 't', name: 'T', weightLbs: 200, startDate: '2026-08-01',
  days: Array.from({ length: days }, () => ({ intensity: 'medium' })),
  ...extra,
})

const allIds = meals => [
  ...meals.electrolytes, ...meals.breakfast, ...meals.lunch, ...meals.dinner,
  ...meals.snacks.flatMap(s => s.items),
].map(e => e.foodId)

test('declinedIds: tolerates a trip with no declines, or a junk value', () => {
  assert.equal(declinedIds(mkTrip()).size, 0)
  assert.equal(declinedIds({ declined: 'nope' }).size, 0)
  assert.equal(declinedIds(null).size, 0)
  assert.deepEqual([...declinedIds({ declined: ['a', 'b'] })], ['a', 'b'])
})

test('a declined food never comes back on a re-draft (the pico de gallo loop)', () => {
  // Lawrence's live repro: pico is the only main left once the pouches he
  // likes are off the table, so an undeclined draft reaches for it.
  const noPouches = mkTrip(3, { declined: ['curry', 'marinara'] })
  assert.ok(allIds(draftDay(noPouches, 0, LIB, NONE, 'usual')).includes('pico'),
    'precondition: the draft would otherwise pick it')
  const declined = mkTrip(3, { declined: ['curry', 'marinara', 'pico'] })
  assert.ok(!allIds(draftDay(declined, 0, LIB, NONE, 'usual')).includes('pico'))
  assert.ok(!allIds(draftDay(declined, 0, LIB, NONE, 'optimized')).includes('pico'))
})

test('every food a draft placed stays gone once declined', () => {
  const trip = mkTrip(1)
  const placed = [...new Set(allIds(draftDay(trip, 0, LIB, NONE, 'usual')))]
  assert.ok(placed.length > 0)
  const after = allIds(draftDay(mkTrip(1, { declined: placed }), 0, LIB, NONE, 'usual'))
  for (const id of placed) assert.ok(!after.includes(id), `${id} came back`)
})

test('declines hold across a whole-trip draft, not just one day', () => {
  const trip = mkTrip(4, { declined: ['pico', 'chalk'] })
  for (const { meals } of draftEmptyDays(trip, LIB, NONE, 'usual')) {
    for (const id of allIds(meals)) {
      assert.ok(id !== 'pico' && id !== 'chalk', `${id} was declined for this trip`)
    }
  }
})

test('declining everything leaves an empty day rather than throwing', () => {
  const trip = mkTrip(1, { declined: LIB.map(f => f.id) })
  assert.deepEqual(allIds(draftDay(trip, 0, LIB, NONE, 'usual')), [])
})

test('drafts exhaust the starred options in a slot before reaching outside them', () => {
  // Favorites used to be only a sort key, so an unstarred pouch could land
  // while a starred one was still available (Lawrence 2026-07-27). Now every
  // pick tries the starred subset first: within a slot, no unstarred food may
  // appear before a starred one.
  const meals = draftDay(mkTrip(), 0, LIB, NONE, 'usual')
  const starred = new Set(LIB.filter(f => f.favorite).map(f => f.id))
  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    const ids = meals[slot].map(e => e.foodId)
    const firstUnstarred = ids.findIndex(id => !starred.has(id))
    if (firstUnstarred === -1) continue
    assert.ok(ids.slice(0, firstUnstarred).every(id => starred.has(id)))
    assert.ok(ids.slice(firstUnstarred).every(id => !starred.has(id)),
      `${slot} went back to a favorite after reaching outside: ${ids.join(', ')}`)
  }
})

test('the dinner main is a favorite whenever two starred mains exist', () => {
  for (const strategy of ['usual', 'optimized']) {
    const meals = draftDay(mkTrip(), 0, LIB, NONE, strategy)
    const main = meals.dinner[0]?.foodId
    assert.ok(['curry', 'marinara'].includes(main), `${strategy} drafted ${main} as the main`)
  }
})

test('unstarred food still fills a day no favorite can', () => {
  // Favorites-first is a preference, not a cage: with every starred food
  // declined, the draft still feeds the day from what is left.
  const starred = LIB.filter(f => f.favorite).map(f => f.id)
  const meals = draftDay(mkTrip(1, { declined: starred }), 0, LIB, NONE, 'usual')
  const ids = allIds(meals)
  assert.ok(ids.length > 0, 'the day has to get fed somehow')
  assert.ok(ids.includes('pico') || ids.includes('oats') || ids.includes('chalk'))
})

test('validateImport: declines and the flying flag are validated, not trusted', () => {
  const base = {
    schemaVersion: 1, library: [], trips: [{
      id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200,
      days: [{ intensity: 'medium' }],
    }],
  }
  const withTrip = extra => ({ ...base, trips: [{ ...base.trips[0], ...extra }] })
  assert.equal(validateImport(withTrip({ declined: ['pico'] })).ok, true)
  assert.equal(validateImport(withTrip({ declined: [] })).ok, true)
  assert.equal(validateImport(withTrip({ declined: ['<img src=x>'] })).ok, false)
  assert.equal(validateImport(withTrip({ declined: 'pico' })).ok, false)
  assert.equal(validateImport(withTrip({ flying: true })).ok, true)
  assert.equal(validateImport(withTrip({ flying: 'yes' })).ok, false)
})

test('validateImport: a destination must be numbers and plain text, or nothing', () => {
  const base = {
    schemaVersion: 1, library: [], trips: [{
      id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200,
      days: [{ intensity: 'medium' }],
    }],
  }
  const withPlace = place => validateImport({ ...base, trips: [{ ...base.trips[0], place }] }).ok
  const good = { label: 'Brooks Range, AK', lat: 68.1, lon: -150.2, elevationFt: 1240, at: 1, climate: null }
  assert.equal(withPlace(good), true)
  assert.equal(withPlace(null), true)
  assert.equal(withPlace({ ...good, climate: { tempLoF: 38, tempHiF: 52, precipIn: 1.2, precipDays: 5, days: 7 } }), true)
  assert.equal(withPlace({ ...good, lat: 'north' }), false)
  assert.equal(withPlace({ ...good, lat: 120 }), false)
  assert.equal(withPlace({ ...good, elevationFt: 'high' }), false)
  assert.equal(withPlace({ ...good, label: 'x'.repeat(400) }), false)
  assert.equal(withPlace({ ...good, climate: { tempLoF: 'cold' } }), false)
})

test('a day planned entirely with declined food is NOT treated as empty', () => {
  // Codex 2026-07-27: draftEmptyDays judged emptiness against the filtered
  // library, so a day whose only food was declined read as empty and got
  // silently overwritten — the opposite of "planned days untouched".
  const trip = mkTrip(3, { declined: ['pico'] })
  trip.days[1].meals = {
    electrolytes: [], breakfast: [], lunch: [], dinner: [{ foodId: 'pico', qty: 1 }], snacks: [],
  }
  const drafted = draftEmptyDays(trip, LIB, NONE, 'usual').map(d => d.dayIndex)
  assert.deepEqual(drafted, [0, 2], 'day 1 already has a plan, declined or not')
})

test('a lone starred main still beats a denser stranger, and still rotates', () => {
  // Codex round 2: the >=2 rotation-pool floor widened to every main before
  // density ranking, so the optimizer picked an unstarred main over the only
  // starred one. Tier first, rank within the tier.
  const lib = [
    { id: 'liked', name: 'The one I like', kcal: 800, carbsG: 60, fatG: 40, proteinG: 40, weightOz: 8, favorite: true, slotHint: 'dinner' },
    { id: 'dense', name: 'Denser stranger', kcal: 900, carbsG: 60, fatG: 45, proteinG: 45, weightOz: 4, favorite: false, slotHint: 'dinner' },
    { id: 'other', name: 'Another stranger', kcal: 850, carbsG: 60, fatG: 42, proteinG: 42, weightOz: 5, favorite: false, slotHint: 'dinner' },
    { id: 'bar', name: 'Bar', kcal: 400, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3, favorite: true, slotHint: 'breakfast' },
    { id: 'gummy', name: 'Gummies', kcal: 100, carbsG: 22, fatG: 0, proteinG: 1, weightOz: 1, favorite: true, slotHint: 'snack' },
  ]
  for (const strategy of ['usual', 'optimized']) {
    const meals = draftDay(mkTrip(3), 0, lib, NONE, strategy)
    assert.equal(meals.dinner[0]?.foodId, 'liked', `${strategy} skipped the only starred main`)
  }
  // Across a week the avoid set steps past it — one favorite is not a life
  // sentence to the same dinner.
  const week = mkTrip(3)
  const mains = draftEmptyDays(week, lib, NONE, 'usual').map(d => d.meals.dinner[0]?.foodId)
  assert.equal(mains[0], 'liked')
  assert.ok(new Set(mains).size > 1, `dinners still rotate: ${mains.join(', ')}`)
})

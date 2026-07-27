import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gearStats, readiness, emptyMeals } from '../js/engine.js'
import { GEAR_SEED, applySeedMigrations } from '../js/seed.js'

const GEAR_LIB = [
  { id: 'tent', name: 'Kifaru SuperTarp', category: 'Shelter/Sleeping', weightOz: 40 },
  { id: 'bag', name: 'WM TerraLite 25', category: 'Shelter/Sleeping', weightOz: 28 },
  { id: 'poles', name: 'Alpine Carbon Cork Poles', category: 'Pack', weightOz: null },
]

const FOOD_LIB = [
  { id: 'meal', name: 'Meal', kcal: 800, carbsG: 60, fatG: 20, proteinG: 40, weightOz: 6, favorite: false },
]

function fueledDay() {
  const meals = emptyMeals()
  meals.dinner.push({ foodId: 'meal', qty: 5 }) // 4000 kcal ≥ 90% of 3700, 200 g protein
  return { intensity: 'medium', meals, packed: { meal: 5 } }
}

test('gearStats counts packed vs total, names unpacked items, sums known weights', () => {
  const trip = {
    weightLbs: 200,
    days: [fueledDay()],
    gear: [
      { gearId: 'tent', packed: true },
      { gearId: 'bag', packed: false },
      { gearId: 'poles', packed: false },
      { gearId: 'ghost', packed: true }, // deleted from library → ignored
    ],
  }
  const g = gearStats(trip, GEAR_LIB)
  assert.equal(g.total, 3)
  assert.equal(g.packed, 1)
  assert.deepEqual(g.unpacked.map(u => u.gearId), ['bag', 'poles'])
  assert.equal(g.weightOz, 68)
  assert.equal(g.missingWeightCount, 1)
})

test('gearStats keeps what you wear off your back', () => {
  const lib = [
    ...GEAR_LIB,
    { id: 'boots', name: 'Crispi Laponia', category: 'Clothing worn', weightOz: 62 },
    { id: 'shell', name: 'Rain shell', category: 'Clothing packed', weightOz: 11 },
  ]
  const trip = {
    weightLbs: 200,
    days: [fueledDay()],
    gear: [{ gearId: 'tent' }, { gearId: 'boots', packed: true }, { gearId: 'shell' }],
  }
  const g = gearStats(trip, lib)
  assert.equal(g.weightOz, 51, 'tent + packed shell ride in the pack')
  assert.equal(g.wornOz, 62, 'boots are on your feet')
  assert.equal(g.total, 3, 'worn clothing still gets packed-checked')
  assert.equal(g.packed, 1)
})

test('readiness blocks on unpacked gear and pending actions', () => {
  const trip = {
    weightLbs: 200,
    days: [fueledDay()],
    gear: [{ gearId: 'tent', packed: false }],
    actions: [{ id: 'a1', text: 'Confirm license', done: false }],
  }
  const r = readiness(trip, FOOD_LIB, GEAR_LIB)
  assert.equal(r.ready, false)
  assert.equal(r.gear.unpacked.length, 1)
  assert.equal(r.actions.pending, 1)
})

test('readiness is ready when food, gear, and actions are all closed out', () => {
  const trip = {
    weightLbs: 200,
    days: [fueledDay()],
    gear: [{ gearId: 'tent', packed: true }],
    actions: [{ id: 'a1', text: 'Confirm license', done: true }],
  }
  const r = readiness(trip, FOOD_LIB, GEAR_LIB)
  assert.equal(r.ready, true)
})

test('trips without gear or actions keep the food-only readiness behavior', () => {
  const r = readiness({ weightLbs: 200, days: [fueledDay()] }, FOOD_LIB, GEAR_LIB)
  assert.equal(r.ready, true)
})

test('gear seed honors its contract: unique ids, named items, known categories', () => {
  const CATEGORIES = [
    'Backpack', 'Shelter/Sleeping', 'Water', 'Cooking', 'Weapon', 'Optics/Bino Pouch',
    'Kill kit', 'First aid & Safety', 'Clothing worn', 'Clothing packed', 'Luxuries',
  ]
  assert.ok(GEAR_SEED.items.length >= 60)
  const ids = new Set()
  for (const g of GEAR_SEED.items) {
    assert.ok(g.id && !ids.has(g.id), `dup/missing id ${g.id}`)
    ids.add(g.id)
    assert.ok(g.name.trim().length > 0)
    assert.ok(CATEGORIES.includes(g.category), `${g.id}: ${g.category}`)
    assert.ok(g.weightOz === null || (typeof g.weightOz === 'number' && g.weightOz > 0))
  }
  // Spot-pin real Montana items
  assert.ok(GEAR_SEED.items.some(g => g.name === 'Kifaru SuperTarp with annex'))
  assert.ok(GEAR_SEED.items.some(g => g.name === 'Crispi Laponia'))
})

test('a backup written before gear existed comes back with an empty closet', () => {
  // Codex round 2: validateImport lets a missing gearLibrary through, and the
  // import/sync paths assign the blob straight to state — so migration is the
  // one place that can stop the gear screen crashing on `.map`.
  const state = { schemaVersion: 1, trips: [], library: [] }
  applySeedMigrations(state)
  assert.ok(Array.isArray(state.gearLibrary))
  assert.equal(state.gearLibrary.length, 0)
  assert.doesNotThrow(() => state.gearLibrary.map(g => g.id))
})

test('a gear library that already exists is migrated, not replaced', () => {
  const state = {
    schemaVersion: 1, trips: [], library: [],
    gearSeedVersion: 1,
    gearLibrary: [{ id: 'x', name: 'Old bag', category: 'Pack', weightOz: 30 }],
  }
  applySeedMigrations(state)
  assert.equal(state.gearLibrary.length, 1)
  assert.equal(state.gearLibrary[0].category, 'Backpack')
})

test('a retired gear category is renamed even behind the version gate', () => {
  // Codex round 3: the import gate accepts legacy category names, but the
  // renames sat behind a version check — so a blob already stamped at the
  // current version kept an item filed where the gear screen cannot show it,
  // while it still counted toward pack weight and packed totals.
  const state = {
    schemaVersion: 1, trips: [], library: [], gearSeedVersion: 3,
    gearLibrary: [
      { id: 'a', name: 'Old bag', category: 'Pack', weightOz: 30 },
      { id: 'b', name: 'Old pot', category: 'Food kit', weightOz: 5 },
    ],
  }
  applySeedMigrations(state)
  assert.deepEqual(state.gearLibrary.map(g => g.category), ['Backpack', 'Cooking'])
})

test('where a thing belongs stays a product judgment, not a rename', () => {
  // The poles rule re-files an item the user may have deliberately moved, so
  // unlike a rename it must run once and never again.
  const settled = {
    schemaVersion: 1, trips: [], library: [], gearSeedVersion: 3,
    gearLibrary: [{ id: 'trekking-poles', name: 'Poles', category: 'Backpack', weightOz: 18 }],
  }
  applySeedMigrations(settled)
  assert.equal(settled.gearLibrary[0].category, 'Backpack', 'a settled state is left alone')

  const stale = { ...settled, gearSeedVersion: 1, gearLibrary: [{ ...settled.gearLibrary[0] }] }
  applySeedMigrations(stale)
  assert.equal(stale.gearLibrary[0].category, 'Luxuries', 'an unmigrated state still gets the v2 call')
})

test('a category named after an Object.prototype key is left alone', () => {
  // Codex round 4: the retired-category table is a plain object, so a bare
  // lookup finds inherited keys — an item filed under "toString" had a
  // FUNCTION assigned as its category. The import gate refuses those names,
  // but local state predates the gate, and load() migrates without it.
  const state = {
    schemaVersion: 1, trips: [], library: [], gearSeedVersion: 3,
    gearLibrary: [
      { id: 'a', name: 'X', category: 'toString', weightOz: 1 },
      { id: 'b', name: 'Y', category: 'constructor', weightOz: 1 },
      { id: 'c', name: 'Z', category: '__proto__', weightOz: 1 },
      { id: 'd', name: 'W', category: 'hasOwnProperty', weightOz: 1 },
    ],
  }
  applySeedMigrations(state)
  for (const g of state.gearLibrary) {
    assert.equal(typeof g.category, 'string', `${g.id} category became a ${typeof g.category}`)
  }
  assert.deepEqual(state.gearLibrary.map(g => g.category),
    ['toString', 'constructor', '__proto__', 'hasOwnProperty'], 'left exactly as found')
})

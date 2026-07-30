import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gearStats, readiness, emptyMeals, carryModeOf, CARRY_MODES, validateImport, tripFoodWeight } from '../js/engine.js'
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

// Total pack weight (issue #29): all days' food packs in at once, so the
// trip's food weight joins the gear pack number.
test('tripFoodWeight sums every day and admits what it cannot weigh', () => {
  const lib = [
    ...FOOD_LIB,
    { id: 'bar', name: 'Bar', kcal: 400, carbsG: 44, fatG: 8, proteinG: 12, weightOz: 2.33, favorite: false },
    { id: 'mystery', name: 'Mystery', kcal: 300, carbsG: 10, fatG: 10, proteinG: 10, weightOz: null, favorite: false },
  ]
  const d1 = emptyMeals(); d1.dinner.push({ foodId: 'meal', qty: 2 }); d1.snacks.push({ foodId: 'bar', qty: 3 })
  const d2 = emptyMeals(); d2.lunch.push({ foodId: 'mystery', qty: 2 }); d2.snacks.push({ foodId: 'bar', qty: 1 })
  const trip = { weightLbs: 200, days: [{ intensity: 'medium', meals: d1 }, { intensity: 'medium', meals: d2 }, { intensity: 'medium' }] }
  const w = tripFoodWeight(trip, lib)
  // 2×6 + 3×2.33 + 1×2.33 = 21.32; the two mystery units count as missing.
  assert.equal(w.weightOz, 21.32)
  assert.equal(w.missingWeightCount, 2)
})

test('tripFoodWeight is zero on an unplanned trip', () => {
  const trip = { weightLbs: 200, days: [{ intensity: 'medium' }] }
  assert.deepEqual(tripFoodWeight(trip, FOOD_LIB), { weightOz: 0, missingWeightCount: 0 })
})

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

// ---------- where a thing rides (2026-07-27) ----------

test('carryModeOf defaults from the category and yields to the item', () => {
  assert.equal(carryModeOf({ category: 'Backpack' }), 'pack')
  assert.equal(carryModeOf({ category: 'Clothing worn' }), 'worn')
  assert.equal(carryModeOf({ category: 'Optics/Bino Pouch', carry: 'harness' }), 'harness')
  // An item may override its category's default in either direction.
  assert.equal(carryModeOf({ category: 'Clothing worn', carry: 'pack' }), 'pack')
  // Junk falls back rather than inventing a bucket.
  assert.equal(carryModeOf({ category: 'Backpack', carry: 'sled' }), 'pack')
  assert.equal(carryModeOf(null), 'pack')
})

test('harness weight is carried but is not pack weight', () => {
  // Lawrence 2026-07-27: binos, rangefinder and a sidearm hang on the chest.
  // They are real weight — they are just not what a pack has to carry.
  const lib = [
    { id: 'tent', name: 'Tent', category: 'Shelter/Sleeping', weightOz: 40 },
    { id: 'binos', name: 'Swarovski NL Pure', category: 'Optics/Bino Pouch', weightOz: 30, carry: 'harness' },
    { id: 'rf', name: 'Sig Kilo5k', category: 'Optics/Bino Pouch', weightOz: 8, carry: 'harness' },
    { id: 'spotter', name: 'Spotting scope', category: 'Optics/Bino Pouch', weightOz: 50 },
    { id: 'boots', name: 'Crispi Laponia', category: 'Clothing worn', weightOz: 62 },
  ]
  const trip = { gear: lib.map(g => ({ gearId: g.id, packed: false })) }
  const g = gearStats(trip, lib)
  assert.equal(g.weightOz, 90, 'tent + spotter ride on your back')
  assert.equal(g.harnessOz, 38, 'binos + rangefinder ride on your chest')
  assert.equal(g.wornOz, 62)
  assert.equal(g.carriedOz, 190, 'everything you move down the trail')
})

test('a category is not a location: the optics shelf splits between both', () => {
  const lib = [
    { id: 'binos', name: 'Binos', category: 'Optics/Bino Pouch', weightOz: 30, carry: 'harness' },
    { id: 'tripod', name: 'Tripod', category: 'Optics/Bino Pouch', weightOz: 19 },
  ]
  const g = gearStats({ gear: lib.map(x => ({ gearId: x.id })) }, lib)
  assert.equal(g.weightOz, 19)
  assert.equal(g.harnessOz, 30)
})

test('gear with no carry field behaves exactly as it did before', () => {
  const lib = [
    { id: 'a', name: 'Tent', category: 'Shelter/Sleeping', weightOz: 40 },
    { id: 'b', name: 'Boots', category: 'Clothing worn', weightOz: 62 },
  ]
  const g = gearStats({ gear: lib.map(x => ({ gearId: x.id })) }, lib)
  assert.equal(g.weightOz, 40)
  assert.equal(g.harnessOz, 0)
  assert.equal(g.wornOz, 62)
  assert.equal(g.carriedOz, 102)
})

test('validateImport gates the carry mode', () => {
  const base = {
    schemaVersion: 1, library: [],
    trips: [{ id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200, days: [{ intensity: 'medium' }] }],
  }
  const withCarry = carry => validateImport({
    ...base, gearLibrary: [{ id: 'g', name: 'Binos', category: 'Optics/Bino Pouch', weightOz: 30, ...(carry === undefined ? {} : { carry }) }],
  }).ok
  assert.equal(withCarry(undefined), true)
  for (const m of CARRY_MODES) assert.equal(withCarry(m), true)
  assert.equal(withCarry('sled'), false)
  assert.equal(withCarry(null), false)
})

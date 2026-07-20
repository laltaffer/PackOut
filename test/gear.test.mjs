import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gearStats, readiness, emptyMeals } from '../js/engine.js'
import { GEAR_SEED } from '../js/seed.js'

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
    'Pack', 'Shelter/Sleeping', 'Water', 'Food kit', 'Weapon', 'Optics/Bino Pouch',
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

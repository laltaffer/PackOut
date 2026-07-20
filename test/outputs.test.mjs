import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groceryList, dayPackList, readiness, emptyMeals } from '../js/engine.js'

const LIB = [
  { id: 'meal', name: 'Meal', kcal: 800, carbsG: 60, fatG: 20, proteinG: 40, weightOz: 6, favorite: false },
  { id: 'bar', name: 'Bar', kcal: 400, carbsG: 44, fatG: 8, proteinG: 12, weightOz: 3, favorite: true },
]

function dayWith(spec) {
  const meals = emptyMeals()
  for (const [slot, entries] of Object.entries(spec)) {
    if (slot === 'snacks') meals.snacks = entries.map(items => ({ items }))
    else meals[slot] = entries
  }
  return { intensity: 'medium', meals }
}

test('grocery list aggregates the same food across days and slots into one line', () => {
  const trip = {
    weightLbs: 200,
    days: [
      dayWith({ dinner: [{ foodId: 'meal', qty: 1 }], snacks: [[{ foodId: 'bar', qty: 2 }]] }),
      dayWith({ lunch: [{ foodId: 'bar', qty: 1 }] }),
    ],
  }
  assert.deepEqual(groceryList(trip, LIB), [
    { foodId: 'bar', name: 'Bar', count: 3 },
    { foodId: 'meal', name: 'Meal', count: 1 },
  ])
})

test('day pack list merges duplicate foods within the day and keeps quantities', () => {
  const day = dayWith({
    breakfast: [{ foodId: 'bar', qty: 1 }],
    snacks: [[{ foodId: 'bar', qty: 2 }], [{ foodId: 'meal', qty: 1 }]],
  })
  assert.deepEqual(dayPackList(day, LIB), [
    { foodId: 'bar', name: 'Bar', qty: 3 },
    { foodId: 'meal', name: 'Meal', qty: 1 },
  ])
})

test('readiness rolls up verdicts and packed state with named blockers', () => {
  const d0 = dayWith({ dinner: [{ foodId: 'meal', qty: 5 }, { foodId: 'bar', qty: 2 }] }) // 4800 kcal, 224P → fueled/heavy zone
  const d1 = dayWith({ snacks: [[{ foodId: 'bar', qty: 1 }]] }) // short
  d0.packed = { meal: true, bar: false }
  const trip = { weightLbs: 200, days: [d0, d1] }
  const r = readiness(trip, LIB)
  assert.equal(r.ready, false)
  assert.deepEqual(r.shortDays, [1])
  assert.equal(r.totalItems, 3) // meal+bar on d0, bar on d1
  assert.equal(r.packedItems, 1)
  assert.deepEqual(r.unpacked, [
    { day: 0, foodId: 'bar', name: 'Bar', qty: 2 },
    { day: 1, foodId: 'bar', name: 'Bar', qty: 1 },
  ])
})

test('a trip with every day fueled and everything packed is ready', () => {
  const d = dayWith({ dinner: [{ foodId: 'meal', qty: 4 }, { foodId: 'bar', qty: 1 }] }) // 3600 kcal ≥ 90%×3700, 172P
  d.packed = { meal: true, bar: true }
  const trip = { weightLbs: 200, days: [d] }
  const r = readiness(trip, LIB)
  assert.equal(r.ready, true)
  assert.equal(r.packedItems, r.totalItems)
})

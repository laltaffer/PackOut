import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayVerdict, tripVerdict, stapleIds, suggestions, emptyMeals } from '../js/engine.js'

// 200 lb, medium day → target 3700 kcal, protein floor 120 g.
const WEIGHT = 200

const LIB = [
  { id: 'meal', name: 'Meal', kcal: 800, carbsG: 60, fatG: 20, proteinG: 40, weightOz: 6, favorite: false },
  { id: 'bar', name: 'Bar', kcal: 400, carbsG: 44, fatG: 8, proteinG: 12, weightOz: 3, favorite: true },
  { id: 'jerky', name: 'Jerky', kcal: 300, carbsG: 5, fatG: 18, proteinG: 30, weightOz: 2, favorite: false },
  { id: 'candy', name: 'Candy', kcal: 300, carbsG: 70, fatG: 0, proteinG: 0, weightOz: 2, favorite: false },
]

function dayWith(entries) {
  const meals = emptyMeals()
  meals.dinner.push(...entries)
  return { intensity: 'medium', meals }
}

test('day short on kcal below 90% of target', () => {
  const v = dayVerdict(dayWith([{ foodId: 'meal', qty: 2 }, { foodId: 'jerky', qty: 2 }]), WEIGHT, LIB)
  // 2200 kcal < 0.9 × 3700, protein 140 ≥ 120
  assert.equal(v.status, 'short')
  assert.equal(v.kcalShort, Math.round(0.9 * 3700 - 2200))
  assert.equal(v.proteinShortG, 0)
})

test('day short on protein even when kcal is fine', () => {
  const v = dayVerdict(dayWith([{ foodId: 'candy', qty: 12 }]), WEIGHT, LIB)
  // 3600 kcal ≥ 90% but protein 0 < 120
  assert.equal(v.status, 'short')
  assert.equal(v.kcalShort, 0)
  assert.equal(v.proteinShortG, 120)
})

test('day fueled at ≥90% kcal and protein floor met', () => {
  const v = dayVerdict(dayWith([{ foodId: 'meal', qty: 3 }, { foodId: 'jerky', qty: 3 }, { foodId: 'bar', qty: 1 }]), WEIGHT, LIB)
  // 2400+900+400 = 3700 kcal, protein 120+90+12 = 222
  assert.equal(v.status, 'fueled')
})

test('day heavy above 115% kcal with protein met', () => {
  const v = dayVerdict(dayWith([{ foodId: 'meal', qty: 5 }, { foodId: 'jerky', qty: 2 }]), WEIGHT, LIB)
  // 4600 kcal > 1.15 × 3700 = 4255, protein 260
  assert.equal(v.status, 'heavy')
  assert.ok(v.kcalOver > 0)
})

test('verdict thresholds compare raw values — a sub-kcal deficit is still Short, reported as 1', () => {
  // 164 lb medium → target 3034, 90% floor = 2730.6. Plan 2730 kcal.
  const lib = [{ id: 'x', name: 'X', kcal: 2730, carbsG: 0, fatG: 0, proteinG: 120, weightOz: 1, favorite: false }]
  const v = dayVerdict(dayWith([{ foodId: 'x', qty: 1 }]), 164, lib)
  assert.equal(v.status, 'short')
  assert.equal(v.kcalShort, 1) // ceil of 0.6, never rounded down to zero
})

test('protein floor comparison keeps its decimals — 121 g misses a 121.2 g floor', () => {
  // 202 lb → raw floor 121.2 g
  const lib = [{ id: 'x', name: 'X', kcal: 4000, carbsG: 0, fatG: 0, proteinG: 121, weightOz: 1, favorite: false }]
  const v = dayVerdict(dayWith([{ foodId: 'x', qty: 1 }]), 202, lib)
  assert.equal(v.status, 'short')
  assert.equal(v.proteinShortG, 1)
})

test('trip verdict counts short days; heavy is not short', () => {
  const trip = {
    weightLbs: WEIGHT,
    days: [
      dayWith([{ foodId: 'meal', qty: 5 }, { foodId: 'jerky', qty: 2 }]), // heavy
      dayWith([{ foodId: 'bar', qty: 1 }]),                               // short
      dayWith([{ foodId: 'meal', qty: 3 }, { foodId: 'jerky', qty: 3 }, { foodId: 'bar', qty: 1 }]), // fueled
    ],
  }
  const v = tripVerdict(trip, LIB)
  assert.equal(v.fueled, false)
  assert.deepEqual(v.shortDays, [1])
  assert.deepEqual(v.heavyDays, [0])
})

test('staples: used on ≥3 days and ≥50% of planned days', () => {
  const mkDay = ids => dayWith(ids.map(id => ({ foodId: id, qty: 1 })))
  const trips = [{
    weightLbs: WEIGHT,
    days: [
      mkDay(['bar', 'meal']), mkDay(['bar', 'jerky']), mkDay(['bar']),
      mkDay(['meal']), { intensity: 'medium' }, // day 5 unplanned — excluded from the base
    ],
  }]
  const ids = stapleIds(trips)
  assert.ok(ids.has('bar'))    // 3 of 4 planned days
  assert.ok(!ids.has('meal'))  // 2 of 4
  assert.ok(!ids.has('jerky')) // 1 of 4
})

test('suggestions rank favorites, then staples, then cals/oz; protein gap prefers protein density', () => {
  const staples = new Set(['candy'])
  const kcalGap = suggestions({ kcalShort: 500, proteinShortG: 0 }, LIB, staples)
  assert.equal(kcalGap[0].id, 'bar')     // favorite outranks all
  assert.equal(kcalGap[1].id, 'candy')   // staple next, despite low cals/oz vs jerky
  const proteinGap = suggestions({ kcalShort: 0, proteinShortG: 40 }, LIB, new Set())
  assert.equal(proteinGap[0].id, 'bar')  // favorite still first
  assert.equal(proteinGap[1].id, 'jerky') // then highest protein
})

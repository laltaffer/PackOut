import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyTargets, slotTargets, sumEntries, dayTotals, emptyMeals } from '../js/engine.js'

const LIB = [
  { id: 'strog', name: 'Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null },
  { id: 'probar', name: 'ProBar', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3.0 },
  { id: 'gel', name: 'Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: 1.1 },
]

test('dinner slot target is 25% of the day kcal target (V2P sheet: 948 @ medium, 1076 @ hard for 205 lb)', () => {
  assert.equal(slotTargets(dailyTargets(205, 'medium')).dinner.kcal, 948)
  assert.equal(slotTargets(dailyTargets(205, 'hard')).dinner.kcal, 1076)
})

test('breakfast and snack slot targets carry the V2P ranges', () => {
  const s = slotTargets(dailyTargets(205, 'medium'))
  assert.deepEqual(s.breakfast, { kcalMin: 200, kcalMax: 400, carbsMinG: 40, carbsMaxG: 60 })
  assert.deepEqual(s.snack, { kcal: 300, carbsMinG: 40, carbsMaxG: 60 })
  assert.deepEqual(s.dinner, { kcal: 948, proteinMinG: 30, proteinIdealG: 40, carbsMinG: 60, carbsIdealG: 90 })
})

test('sumEntries totals macros with quantities; null macros count as zero', () => {
  const t = sumEntries([{ foodId: 'strog', qty: 1 }, { foodId: 'probar', qty: 2 }], LIB)
  assert.equal(t.kcal, 810 + 780)
  assert.equal(t.carbsG, 50 + 86)
  assert.equal(t.fatG, 16) // stroganoff fat is null → 0
  assert.equal(t.proteinG, 41 + 24)
})

test('weight sums only known weights and reports missing count; cals/oz uses known weight', () => {
  const t = sumEntries([{ foodId: 'strog', qty: 1 }, { foodId: 'probar', qty: 1 }], LIB)
  assert.equal(t.weightOz, 3.0)
  assert.equal(t.missingWeightCount, 1)
  assert.equal(t.calsPerOz, Math.round((810 + 390) / 3.0))
})

test('entries pointing at deleted foods are ignored, not fatal', () => {
  const t = sumEntries([{ foodId: 'ghost', qty: 3 }, { foodId: 'gel', qty: 1 }], LIB)
  assert.equal(t.kcal, 100)
})

test('dayTotals folds all slots and snack bundles', () => {
  const meals = emptyMeals()
  meals.electrolytes.push({ foodId: 'gel', qty: 1 })
  meals.dinner.push({ foodId: 'strog', qty: 1 })
  meals.snacks.push({ items: [{ foodId: 'probar', qty: 1 }] }, { items: [{ foodId: 'gel', qty: 2 }] })
  const t = dayTotals({ intensity: 'medium', meals }, LIB)
  assert.equal(t.kcal, 100 + 810 + 390 + 200)
  assert.equal(t.proteinG, 0 + 41 + 12 + 0)
  assert.equal(t.weightOz, 1.1 + 3.0 + 2.2)
})

test('dayTotals of an empty or missing meals object is all zeros', () => {
  const t = dayTotals({ intensity: 'easy' }, LIB)
  assert.equal(t.kcal, 0)
  assert.equal(t.weightOz, 0)
  assert.equal(t.calsPerOz, null)
})

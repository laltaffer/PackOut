import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyTargets } from '../js/engine.js'

// Expected values are the V2P sheet's own worked examples for a 205 lb hunter.
// Easy and Hard are single-multiplier (16 / 21 kcal per lb); Medium is the
// 17–20 kcal/lb range with the 18.5 midpoint as the day target (sheet: 3792.5).

test('easy day targets match the V2P sheet for 205 lb', () => {
  const t = dailyTargets(205, 'easy')
  assert.equal(t.kcal.target, 3280)
  assert.deepEqual(t.carbsG, { min: 328, max: 492 })
  assert.deepEqual(t.proteinG, { min: 82, max: 123, floor: 123 })
  assert.deepEqual(t.fatG, { min: 91, max: 182 })
})

test('medium day targets match the V2P sheet for 205 lb', () => {
  const t = dailyTargets(205, 'medium')
  assert.equal(t.kcal.target, 3792.5)
  assert.deepEqual(t.carbsG, { min: 349, max: 615 })
  assert.deepEqual(t.proteinG, { min: 87, max: 154, floor: 123 })
  assert.deepEqual(t.fatG, { min: 97, max: 228 })
})

test('hard day targets match the V2P sheet for 205 lb', () => {
  const t = dailyTargets(205, 'hard')
  assert.equal(t.kcal.target, 4305)
  assert.deepEqual(t.carbsG, { min: 431, max: 646 })
  assert.deepEqual(t.proteinG, { min: 108, max: 161, floor: 123 })
  assert.deepEqual(t.fatG, { min: 120, max: 239 })
})

test('sample-day cross-check: 200 lb hard matches the V2P sample tab', () => {
  // Sample Day tab: 200 lb individual, Hard → 4305 was for 205; for 200 lb the
  // welcome text's sample is Medium. Independent check: 200 × 21 = 4200.
  const t = dailyTargets(200, 'hard')
  assert.equal(t.kcal.target, 4200)
})

test('protein floor is 0.6 g per lb regardless of intensity', () => {
  assert.equal(dailyTargets(150, 'easy').proteinG.floor, 90)
  assert.equal(dailyTargets(150, 'hard').proteinG.floor, 90)
})

test('unknown intensity throws', () => {
  assert.throws(() => dailyTargets(205, 'brutal'))
})

// Custom day target (issue #27): an arbitrary kcal number replaces the
// weight × effort band, and every macro range derives from the same shares
// (carbs 40–60%, protein 10–15%, fat 25–50%). Worked example: 3,000 kcal →
// carbs 300–450 g, protein 75–113 g, fat 83–167 g. The protein floor stays
// a property of the body (0.6 g/lb), not of the target.
test('custom kcal collapses the band and scales macro ranges by the V2P shares', () => {
  const t = dailyTargets(205, 'medium', 3000)
  assert.deepEqual(t.kcal, { lo: 3000, hi: 3000, target: 3000 })
  assert.deepEqual(t.carbsG, { min: 300, max: 450 })
  assert.deepEqual(t.proteinG, { min: 75, max: 113, floor: 123 })
  assert.deepEqual(t.fatG, { min: 83, max: 167 })
})

test('custom kcal overrides regardless of the effort level passed', () => {
  assert.deepEqual(dailyTargets(205, 'easy', 3000), dailyTargets(205, 'hard', 3000))
})

test('a null or absent custom target leaves effort targets byte-identical', () => {
  assert.deepEqual(dailyTargets(205, 'medium', null), dailyTargets(205, 'medium'))
  assert.deepEqual(dailyTargets(205, 'easy', undefined), dailyTargets(205, 'easy'))
})

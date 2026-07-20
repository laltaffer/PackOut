import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftDay, draftEmptyDays, dailyTargets, dayTotals, dayVerdict, emptyMeals } from '../js/engine.js'

// 200 lb medium → target 3700 kcal, protein floor 120 g.
const WEIGHT = 200

const LIB = [
  { id: 'granola', name: 'Peak Refuel Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: 4.6, favorite: true, slotHint: 'breakfast' },
  { id: 'pb', name: "Justin's Honey Peanut Butter", kcal: 210, carbsG: 6, fatG: 17, proteinG: 7, weightOz: 1.15, favorite: true, slotHint: 'breakfast' },
  { id: 'liquid-iv', name: 'Liquid IV Energy', kcal: 45, carbsG: 10, fatG: 0, proteinG: 0, weightOz: 0.5, favorite: false, slotHint: 'electrolytes' },
  { id: 'curry', name: 'Peak Refuel Chicken Coconut Curry', kcal: 850, carbsG: 66, fatG: 44, proteinG: 44, weightOz: 5.36, favorite: true, slotHint: 'dinner' },
  { id: 'marinara', name: 'Peak Refuel Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, favorite: false, slotHint: 'dinner' },
  { id: 'strog', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner' },
  { id: 'toastchee', name: 'Lance ToastChee', kcal: 220, carbsG: 25, fatG: 10, proteinG: 5, weightOz: 1.4, favorite: false, slotHint: 'lunch' },
  { id: 'bar', name: 'ProBar Peanut Butter', kcal: 400, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3.0, favorite: true, slotHint: 'snack' },
  { id: 'gel', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: 1.1, favorite: false, slotHint: 'snack' },
  { id: 'jerky', name: 'Landjaeger sticks', kcal: 300, carbsG: 6, fatG: 18, proteinG: 30, weightOz: 2.0, favorite: false, slotHint: 'snack' },
  { id: 'waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: null, proteinG: 1, weightOz: 1.0, favorite: false, slotHint: 'snack' },
]

const STAPLES = new Set(['granola', 'liquid-iv'])

function mkTrip(days = 1) {
  return { id: 't', name: 'T', weightLbs: WEIGHT, startDate: '2026-08-01', days: Array.from({ length: days }, () => ({ intensity: 'medium' })) }
}

test('usual draft replays staples and favorites into their hinted slots', () => {
  const meals = draftDay(mkTrip(), 0, LIB, STAPLES, 'usual')
  const ids = slot => meals[slot].map(e => e.foodId)
  assert.ok(ids('breakfast').includes('granola'), 'staple+favorite breakfast replayed')
  assert.ok(ids('breakfast').includes('pb'), 'favorite breakfast replayed')
  assert.ok(ids('electrolytes').includes('liquid-iv'), 'staple electrolyte replayed')
  assert.equal(meals.dinner.length, 1, 'exactly one dinner main')
  assert.equal(meals.dinner[0].foodId, 'curry', 'favorite main drafts first')
})

test('usual draft lands the day Fueled without crossing the 115% line', () => {
  const trip = mkTrip()
  const meals = draftDay(trip, 0, LIB, STAPLES, 'usual')
  const day = { intensity: 'medium', meals }
  const t = dayTotals(day, LIB)
  const target = dailyTargets(WEIGHT, 'medium').kcal.target
  assert.ok(t.kcal >= 0.9 * target, `at least Fueled: ${t.kcal}`)
  assert.ok(t.kcal <= 1.15 * target, `stayed under heavy line: ${t.kcal}`)
  assert.equal(dayVerdict(day, WEIGHT, LIB).status, 'fueled')
})

test('meals carry the day — lunch and breakfast grow toward their share, at most 3 snacks suggested', () => {
  // Lawrence 2026-07-20 (his sheet's Day One: ~740 breakfast, 4-item ~1150
  // lunch, snacks as options): bigger breakfast/lunch, ~3 snacks soft.
  const meals = draftDay(mkTrip(), 0, LIB, STAPLES, 'usual')
  const target = dailyTargets(WEIGHT, 'medium').kcal.target
  const slotKcal = entries => entries.reduce((s, e) => s + LIB.find(f => f.id === e.foodId).kcal * e.qty, 0)
  assert.ok(slotKcal(meals.breakfast) >= 0.15 * target, `breakfast is a real meal: ${slotKcal(meals.breakfast)}`)
  assert.ok(slotKcal(meals.lunch) >= 0.22 * target, `lunch is a real meal: ${slotKcal(meals.lunch)}`)
  assert.ok(meals.lunch.length > 1, 'lunch groups multiple items, like the sheet')
  // Soft rule, stated precisely: more than 3 snacks is allowed ONLY when 3
  // would leave the day below the Fueled line (or the protein floor).
  if (meals.snacks.length > 3) {
    const trimmed = structuredClone(meals)
    trimmed.snacks = trimmed.snacks.slice(0, 3)
    const t3 = dayTotals({ intensity: 'medium', meals: trimmed }, LIB)
    assert.ok(t3.kcal < 0.9 * target || t3.proteinG < 0.6 * WEIGHT,
      `extra snacks only when 3 would miss Fueled (3-snack day was ${t3.kcal} kcal)`)
  }
})

test('drafting is deterministic: same inputs, identical output', () => {
  const a = draftDay(mkTrip(), 0, LIB, STAPLES, 'usual')
  const b = draftDay(mkTrip(), 0, LIB, STAPLES, 'usual')
  assert.deepEqual(a, b)
})

test('draftEmptyDays rotates dinners across consecutive days and touches only empty days', () => {
  const trip = mkTrip(4)
  trip.days[2].meals = emptyMeals()
  trip.days[2].meals.lunch.push({ foodId: 'toastchee', qty: 1 }) // day 2 already has work
  const drafts = draftEmptyDays(trip, LIB, STAPLES, 'usual')
  const draftedIdx = drafts.map(d => d.dayIndex)
  assert.deepEqual(draftedIdx, [0, 1, 3], 'planned day untouched')
  const mains = drafts.map(d => d.meals.dinner[0]?.foodId)
  assert.notEqual(mains[0], mains[1], 'consecutive dinners differ')
  assert.equal(new Set(mains).size, 3, 'three days, three different mains')
})

test('single-day draft avoids the adjacent day’s dinner when an alternative exists', () => {
  const trip = mkTrip(2)
  trip.days[0].meals = emptyMeals()
  trip.days[0].meals.dinner.push({ foodId: 'curry', qty: 1 })
  const meals = draftDay(trip, 1, LIB, STAPLES, 'usual')
  assert.notEqual(meals.dinner[0].foodId, 'curry')
})

test('optimized draft meets the protein floor and prefers weight-efficient candidates', () => {
  const meals = draftDay(mkTrip(), 0, LIB, new Set(), 'optimized')
  const day = { intensity: 'medium', meals }
  const t = dayTotals(day, LIB)
  assert.ok(t.proteinG >= 120, `protein floor met: ${t.proteinG}`)
  const target = dailyTargets(WEIGHT, 'medium').kcal.target
  assert.ok(t.kcal >= target && t.kcal <= 1.15 * target)
  const flat = [...meals.snacks.flatMap(s => s.items)]
  assert.ok(!flat.some(e => e.foodId === 'strog'), 'weightless items lose ties in optimized top-up')
})

test('thin and empty libraries degrade gracefully', () => {
  const thin = [LIB[3], LIB[7]] // one main, one snack
  const meals = draftDay(mkTrip(), 0, thin, new Set(), 'usual')
  assert.equal(meals.dinner[0].foodId, 'curry')
  assert.ok(meals.snacks.length >= 1)
  const none = draftDay(mkTrip(), 0, [], new Set(), 'usual')
  assert.deepEqual(none, emptyMeals())
})

test('usual draft meets the protein floor with the real v2 seed snack pool (205 lb, floor 123)', () => {
  // Live repro (Alaska day 4): protein-per-oz ranking zeroed out null-weight
  // high-protein snacks and forced one-of-each rotation, so the draft capped
  // out at 120 g protein against a 123 g floor. Protein-phase fills must rank
  // by absolute protein and may repeat snacks.
  const lib = [
    { id: 'granola', name: 'Peak Refuel Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: null, favorite: false, slotHint: 'breakfast' },
    { id: 'lyte', name: 'Liquid IV Energy', kcal: 45, carbsG: 10, fatG: 0, proteinG: 0, weightOz: null, favorite: false, slotHint: 'electrolytes' },
    { id: 'cheez', name: 'Cheez-It (1 pack)', kcal: 140, carbsG: 16, fatG: 7, proteinG: 3, weightOz: 1.0, favorite: false, slotHint: 'lunch' },
    { id: 'marinara', name: 'Peak Refuel Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, favorite: false, slotHint: 'dinner' },
    { id: 'bolt', name: 'ProBar Bolt Chews', kcal: 90, carbsG: 23, fatG: null, proteinG: null, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'probar-pb', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'muffin', name: 'ProBar Blueberry Muffin', kcal: 400, carbsG: 44, fatG: null, proteinG: 10, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'gu', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: null, proteinG: 1, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'packaroon', name: 'Packaroon', kcal: 160, carbsG: 12, fatG: 12, proteinG: 2, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'belvita', name: 'Belvita', kcal: 220, carbsG: 36, fatG: 8, proteinG: 3, weightOz: 1.9, favorite: false, slotHint: 'snack' },
    { id: 'austin', name: 'Austin Peanut Butter Crackers', kcal: 200, carbsG: 27, fatG: 10, proteinG: 3, weightOz: 1.3, favorite: false, slotHint: 'snack' },
    { id: 'powerbar', name: 'PowerBar', kcal: 230, carbsG: 44, fatG: 4, proteinG: 10, weightOz: 2.2, favorite: false, slotHint: 'snack' },
    { id: 'fritos', name: 'Fritos (2 svg)', kcal: 320, carbsG: 32, fatG: 20, proteinG: 4, weightOz: 2.0, favorite: false, slotHint: 'snack' },
  ]
  const trip = { id: 't', name: 'T', weightLbs: 205, startDate: '2026-08-01', days: [{ intensity: 'medium' }] }
  const meals = draftDay(trip, 0, lib, new Set(), 'usual')
  const day = { intensity: 'medium', meals }
  const v = dayVerdict(day, 205, lib)
  assert.equal(v.proteinShortG, 0, `protein floor met (totals ${JSON.stringify(dayTotals(day, lib))})`)
  assert.equal(v.status, 'fueled')
})

test('low-kcal dinner add-ons are never drafted as the main while real mains exist', () => {
  // Alpine Spiced Apple Cider (60 kcal) is dinner-hinted as an add-on; the
  // rotation must cycle substantial mains only, not propose cider for dinner.
  const lib = [
    ...LIB,
    { id: 'cider', name: 'Alpine Spiced Apple Cider', kcal: 60, carbsG: 15, fatG: 0, proteinG: 0, weightOz: 0.5, favorite: false, slotHint: 'dinner' },
  ]
  const trip = mkTrip(5)
  const drafts = draftEmptyDays(trip, lib, STAPLES, 'usual')
  for (const d of drafts) {
    assert.notEqual(d.meals.dinner[0]?.foodId, 'cider', `day ${d.dayIndex} drafted cider as the main`)
  }
  const single = draftDay(mkTrip(), 0, lib, STAPLES, 'usual')
  assert.notEqual(single.dinner[0]?.foodId, 'cider')
})

test('meal slots stack to at least 300 kcal — a lone cracker pack is never lunch', () => {
  // Lawrence 2026-07-20: "cheese should never be suggested as a lunch or a
  // meal… anything over 300 calories can be suggested as a meal. Or meals
  // should have multiple things that add up."
  const lib = [
    ...LIB.filter(f => f.id !== 'toastchee'),
    { id: 'crackers', name: 'Cracker Pack', kcal: 140, carbsG: 16, fatG: 7, proteinG: 3, weightOz: 1.0, favorite: false, slotHint: 'lunch' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, STAPLES, 'usual')
  const lunchKcal = meals.lunch.reduce((sum, e) => sum + lib.find(f => f.id === e.foodId).kcal * e.qty, 0)
  assert.ok(lunchKcal >= 300, `lunch stacked to a real meal: ${lunchKcal} kcal`)
  assert.ok(meals.lunch.length > 1, 'sub-300 base means multiple items add up')
})

test('a ≥300 kcal lunch base leads the slot, then grows toward its share', () => {
  const lib = [
    ...LIB.filter(f => f.id !== 'toastchee'),
    { id: 'big-wrap', name: 'ProBar Meal Wrap', kcal: 390, carbsG: 40, fatG: 12, proteinG: 15, weightOz: 3, favorite: false, slotHint: 'lunch' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, STAPLES, 'usual')
  assert.equal(meals.lunch[0].foodId, 'big-wrap')
  const lunchKcal = meals.lunch.reduce((s, e) => s + lib.find(f => f.id === e.foodId).kcal * e.qty, 0)
  assert.ok(lunchKcal >= 0.22 * dailyTargets(WEIGHT, 'medium').kcal.target, `grew toward share: ${lunchKcal}`)
})

test('slot growth prefers right-sized items — no 1,300-kcal breakfast to close a 470-kcal gap', () => {
  // Cold start (no favorites/staples): protein-first growth must not grab a
  // huge item when a right-sized protein source fits the slot's share.
  const lib = [
    { id: 'pb', name: "Justin's Honey Peanut Butter", kcal: 210, carbsG: 6, fatG: 17, proteinG: 7, weightOz: 1.15, favorite: false, slotHint: 'breakfast' },
    { id: 'biscuits', name: 'Peak Refuel Biscuits & Sausage Gravy', kcal: 1100, carbsG: 51, fatG: 85, proteinG: 34, weightOz: 6.77, favorite: false, slotHint: 'breakfast' },
    { id: 'skillet', name: 'Peak Refuel Breakfast Skillet', kcal: 540, carbsG: 36, fatG: 31, proteinG: 31, weightOz: 3.88, favorite: false, slotHint: 'breakfast' },
    { id: 'main', name: 'Peak Refuel Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, favorite: false, slotHint: 'dinner' },
    { id: 'lunchy', name: 'Lance ToastChee', kcal: 220, carbsG: 25, fatG: 10, proteinG: 5, weightOz: 1.4, favorite: false, slotHint: 'lunch' },
    { id: 'bar', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3, favorite: false, slotHint: 'snack' },
    { id: 'bears', name: 'Haribo Goldbears (per oz)', kcal: 95, carbsG: 22, fatG: 0, proteinG: 2, weightOz: 1, favorite: false, slotHint: 'snack' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, new Set(), 'usual')
  const target = dailyTargets(WEIGHT, 'medium').kcal.target
  const bKcal = meals.breakfast.reduce((s, e) => s + lib.find(f => f.id === e.foodId).kcal * e.qty, 0)
  assert.ok(bKcal <= 0.18 * target * 1.5, `breakfast stays near its share: ${bKcal}`)
  assert.ok(bKcal >= 200, 'still a real breakfast')
})

test('usual rotation cycles within favorite mains — the catalog never displaces owned core meals', () => {
  // Lawrence 2026-07-20: core meals come from his Peak Refuel order. With 2+
  // favorite mains, a week's dinners rotate through the favorites tier only.
  const favs = ['strog', 'curry', 'homestyle'].map((id, j) => (
    { id, name: `Peak Refuel Fav ${j}`, kcal: 800 + j * 10, carbsG: 50, fatG: 20, proteinG: 41, weightOz: 5, favorite: true, slotHint: 'dinner' }))
  const catalog = ['alfredo', 'mashers', 'goulash'].map((id, j) => (
    { id, name: `Peak Refuel Cat ${j}`, kcal: 900 + j * 10, carbsG: 60, fatG: 30, proteinG: 45, weightOz: 6, favorite: false, slotHint: 'dinner' }))
  const lib = [...LIB.filter(f => f.slotHint !== 'dinner'), ...favs, ...catalog]
  const trip = mkTrip(7)
  const drafts = draftEmptyDays(trip, lib, new Set(), 'usual')
  const mains = drafts.map(d => d.meals.dinner[0].foodId)
  assert.equal(mains.length, 7)
  for (const m of mains) assert.ok(['strog', 'curry', 'homestyle'].includes(m), `catalog main drafted: ${m}`)
  for (let i = 1; i < mains.length; i++) assert.notEqual(mains[i], mains[i - 1], 'no consecutive repeats')
})

test('breakfast drafts bias hard toward ready-to-eat — no boiling water at 4am', () => {
  // Lawrence 2026-07-20: mornings are mobile; hot-water breakfasts only when
  // nothing ready-to-eat can fill the slot.
  const lib = [
    { id: 'skillet', name: 'Peak Refuel Breakfast Skillet', kcal: 540, carbsG: 36, fatG: 31, proteinG: 31, weightOz: 3.88, favorite: false, slotHint: 'breakfast', prep: 'cook' },
    { id: 'granola', name: 'Peak Refuel Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: 4.6, favorite: false, slotHint: 'breakfast' },
    { id: 'pb', name: "Justin's Honey Peanut Butter", kcal: 210, carbsG: 6, fatG: 17, proteinG: 7, weightOz: 1.15, favorite: false, slotHint: 'breakfast' },
    { id: 'main', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner', prep: 'cook' },
    { id: 'bar', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3, favorite: false, slotHint: 'snack' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, new Set(), 'usual')
  assert.ok(!meals.breakfast.some(e => e.foodId === 'skillet'), 'cook breakfast skipped while ready foods can fill the slot')
  assert.ok(meals.breakfast.some(e => e.foodId === 'granola'), 'ready breakfast leads')
  assert.equal(meals.dinner[0].foodId, 'main', 'dinner mains unaffected by prep bias')
})

test('a cook breakfast still drafts when it is the only breakfast there is', () => {
  const lib = [
    { id: 'skillet', name: 'Peak Refuel Breakfast Skillet', kcal: 540, carbsG: 36, fatG: 31, proteinG: 31, weightOz: 3.88, favorite: false, slotHint: 'breakfast', prep: 'cook' },
    { id: 'main', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner', prep: 'cook' },
    { id: 'bar', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3, favorite: false, slotHint: 'snack' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, new Set(), 'usual')
  assert.ok(meals.breakfast.some(e => e.foodId === 'skillet'), 'graceful when nothing ready exists')
})

test('a draft never exceeds 115% even when only oversized candidates remain', () => {
  const huge = [
    { id: 'mega', name: 'Mega Meal', kcal: 3000, carbsG: 100, fatG: 100, proteinG: 100, weightOz: 20, favorite: false, slotHint: 'dinner' },
    { id: 'brick', name: 'Calorie Brick', kcal: 2500, carbsG: 100, fatG: 100, proteinG: 50, weightOz: 20, favorite: false, slotHint: 'snack' },
  ]
  const meals = draftDay(mkTrip(), 0, huge, new Set(), 'usual')
  const t = dayTotals({ intensity: 'medium', meals }, huge)
  assert.ok(t.kcal <= 1.15 * 3700, `stopped short rather than blow past heavy: ${t.kcal}`)
})

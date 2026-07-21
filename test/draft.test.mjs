import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftDay, draftEmptyDays, dailyTargets, dayTotals, dayVerdict, emptyMeals, MEAL_STYLE_DEFAULTS } from '../js/engine.js'
import { SEED } from '../js/seed.js'

// 200 lb medium → target 3700 kcal, protein floor 120 g.
const WEIGHT = 200
const TOL = 50 // Lawrence 2026-07-20: "stay with +/- 50cal"

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

function mkTrip(days = 1, weightLbs = WEIGHT) {
  return { id: 't', name: 'T', weightLbs, startDate: '2026-08-01', days: Array.from({ length: days }, () => ({ intensity: 'medium' })) }
}

function slotKcal(entries, lib) {
  return entries.reduce((s, e) => s + lib.find(f => f.id === e.foodId).kcal * e.qty, 0)
}

test('usual draft replays habits — but never past a slot window (no double-granola breakfast)', () => {
  // Live repro 2026-07-20: two starred granolas produced a 1,100 kcal
  // breakfast against a 200–400 goal. Habit replay obeys the window.
  const lib = LIB.map(f => f.id === 'granola' ? { ...f } : f)
  const meals = draftDay(mkTrip(), 0, lib, STAPLES, 'usual')
  const ids = slot => meals[slot].map(e => e.foodId)
  assert.ok(!ids('breakfast').includes('granola'), '530 kcal pouch cannot fit a 200–400 breakfast')
  assert.ok(ids('electrolytes').includes('liquid-iv'), 'staple electrolyte replayed')
  assert.equal(meals.dinner.length, 1, 'exactly one dinner main')
  assert.equal(meals.dinner[0].foodId, 'curry', 'favorite main drafts first')
  const bk = slotKcal(meals.breakfast, lib)
  assert.ok(bk >= 200 && bk <= 400, `breakfast inside its window: ${bk}`)
})

test('a drafted day lands within ±50 kcal of the target', () => {
  const meals = draftDay(mkTrip(), 0, LIB, STAPLES, 'usual')
  const t = dayTotals({ intensity: 'medium', meals }, LIB)
  const target = dailyTargets(WEIGHT, 'medium').kcal.target
  assert.ok(Math.abs(t.kcal - target) <= TOL, `|${t.kcal} - ${target}| <= ${TOL}`)
  assert.equal(dayVerdict({ intensity: 'medium', meals }, WEIGHT, LIB).status, 'fueled')
})

test('meals carry the day: real lunch, windowed breakfast, at most 3 snack bundles', () => {
  const meals = draftDay(mkTrip(), 0, LIB, STAPLES, 'usual')
  const target = dailyTargets(WEIGHT, 'medium').kcal.target
  const bk = slotKcal(meals.breakfast, LIB)
  assert.ok(bk >= 200 && bk <= 400, `breakfast in window: ${bk}`)
  assert.ok(slotKcal(meals.lunch, LIB) >= 0.22 * target, `lunch is a real meal: ${slotKcal(meals.lunch, LIB)}`)
  assert.ok(meals.lunch.length > 1, 'lunch groups multiple items, like the sheet')
  assert.ok(meals.snacks.length <= 3, `snacks stay in at most 3 bundles: ${meals.snacks.length}`)
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

test('optimized draft also honors the ±50 window and meets the protein floor', () => {
  const meals = draftDay(mkTrip(), 0, LIB, new Set(), 'optimized')
  const day = { intensity: 'medium', meals }
  const t = dayTotals(day, LIB)
  const target = dailyTargets(WEIGHT, 'medium').kcal.target
  assert.ok(t.proteinG >= 120, `protein floor met: ${t.proteinG}`)
  assert.ok(Math.abs(t.kcal - target) <= TOL, `|${t.kcal} - ${target}| <= ${TOL}`)
})

test('thin and empty libraries degrade gracefully', () => {
  const thin = [LIB[3], LIB[7]] // one main, one snack
  const meals = draftDay(mkTrip(), 0, thin, new Set(), 'usual')
  assert.equal(meals.dinner[0].foodId, 'curry')
  assert.ok(meals.snacks.length >= 1)
  const none = draftDay(mkTrip(), 0, [], new Set(), 'usual')
  assert.deepEqual(none, emptyMeals())
})

test('protein-phase snacks rank by absolute protein and repeat — but never spend past the window', () => {
  // Successor to the Alaska day-4 repro: null-weight high-protein snacks must
  // not sink, repeats are allowed, and the floor is closed with kcal the ±50
  // window can afford.
  const lib = [
    { id: 'granola', name: 'Peak Refuel Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: null, favorite: false, slotHint: 'breakfast' },
    { id: 'lyte', name: 'Liquid IV Energy', kcal: 45, carbsG: 10, fatG: 0, proteinG: 0, weightOz: null, favorite: false, slotHint: 'electrolytes' },
    { id: 'marinara', name: 'Peak Refuel Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, favorite: false, slotHint: 'dinner' },
    { id: 'jerky', name: 'Landjaeger sticks', kcal: 300, carbsG: 6, fatG: 18, proteinG: 30, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'probar-pb', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'gu', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: null, favorite: false, slotHint: 'snack' },
    { id: 'bears', name: 'Haribo Goldbears (per oz)', kcal: 95, carbsG: 22, fatG: 0, proteinG: 2, weightOz: 1, favorite: false, slotHint: 'snack' },
  ]
  const trip = { id: 't', name: 'T', weightLbs: 205, startDate: '2026-08-01', days: [{ intensity: 'medium' }] }
  const meals = draftDay(trip, 0, lib, new Set(), 'usual')
  const day = { intensity: 'medium', meals }
  const v = dayVerdict(day, 205, lib)
  const target = dailyTargets(205, 'medium').kcal.target
  assert.equal(v.proteinShortG, 0, `protein floor met (totals ${JSON.stringify(dayTotals(day, lib))})`)
  assert.ok(Math.abs(v.totals.kcal - target) <= TOL, `|${v.totals.kcal} - ${target}| <= ${TOL}`)
  assert.equal(v.status, 'fueled')
})

test('low-kcal dinner add-ons are never drafted as the main while real mains exist', () => {
  const lib = [
    ...LIB,
    { id: 'cider', name: 'Alpine Spiced Apple Cider', kcal: 60, carbsG: 15, fatG: 0, proteinG: 0, weightOz: 0.5, favorite: false, slotHint: 'dinner' },
  ]
  const trip = mkTrip(5)
  const drafts = draftEmptyDays(trip, lib, STAPLES, 'usual')
  for (const d of drafts) {
    assert.notEqual(d.meals.dinner[0]?.foodId, 'cider', `day ${d.dayIndex} drafted cider as the main`)
  }
})

test('meal slots stack to at least 300 kcal — a lone cracker pack is never lunch', () => {
  const lib = [
    ...LIB.filter(f => f.id !== 'toastchee'),
    { id: 'crackers', name: 'Cracker Pack', kcal: 140, carbsG: 16, fatG: 7, proteinG: 3, weightOz: 1.0, favorite: false, slotHint: 'lunch' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, STAPLES, 'usual')
  const lunchKcal = slotKcal(meals.lunch, lib)
  assert.ok(lunchKcal >= 300, `lunch stacked to a real meal: ${lunchKcal} kcal`)
  assert.ok(meals.lunch.length > 1, 'sub-300 base means multiple items add up')
})

test('a meal-sized lunch item joins the slot as it grows toward its share', () => {
  const lib = [
    ...LIB.filter(f => f.id !== 'toastchee'),
    { id: 'big-wrap', name: 'ProBar Meal Wrap', kcal: 390, carbsG: 40, fatG: 12, proteinG: 15, weightOz: 3, favorite: false, slotHint: 'lunch' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, STAPLES, 'usual')
  assert.ok(meals.lunch.some(e => e.foodId === 'big-wrap'), 'hinted meal item drafts into lunch')
  const lunchKcal = slotKcal(meals.lunch, lib)
  assert.ok(lunchKcal >= 0.22 * dailyTargets(WEIGHT, 'medium').kcal.target, `grew toward share: ${lunchKcal}`)
})

test('usual rotation cycles within favorite mains — the catalog never displaces owned core meals', () => {
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
  // Window-sized fixture so the 200–400 cap alone can't decide it: the cook
  // item fits the window and still loses to ready foods.
  const lib = [
    { id: 'oatmeal', name: 'Peak Refuel Hot Oatmeal', kcal: 350, carbsG: 60, fatG: 6, proteinG: 12, weightOz: 3, favorite: false, slotHint: 'breakfast', prep: 'cook' },
    { id: 'granola-bar', name: 'Bear Valley Granola Bar', kcal: 330, carbsG: 50, fatG: 10, proteinG: 10, weightOz: 3, favorite: false, slotHint: 'breakfast' },
    { id: 'main', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner', prep: 'cook' },
    { id: 'bar', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: 3, favorite: false, slotHint: 'snack' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, new Set(), 'usual')
  assert.ok(meals.breakfast.length >= 1, 'breakfast drafted')
  assert.ok(!meals.breakfast.some(e => e.foodId === 'oatmeal'), 'cook breakfast skipped while ready foods can fill the slot')
  for (const e of meals.breakfast) {
    assert.notEqual(lib.find(f => f.id === e.foodId).prep, 'cook', 'every drafted breakfast item is ready-to-eat')
  }
  assert.equal(meals.dinner[0].foodId, 'main', 'dinner mains unaffected by prep bias')
})

test('a mobile breakfast never drafts a cook food — even when nothing else could fill it', () => {
  // Lawrence 2026-07-21: mobile means excluded when we draft, period; the
  // user can still add cook foods by hand. The slot drafts light instead.
  const lib = [
    { id: 'oatmeal', name: 'Peak Refuel Hot Oatmeal', kcal: 350, carbsG: 60, fatG: 6, proteinG: 12, weightOz: 3, favorite: false, slotHint: 'breakfast', prep: 'cook' },
    { id: 'main', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner', prep: 'cook' },
  ]
  const meals = draftDay(mkTrip(), 0, lib, new Set(), 'usual')
  assert.equal(meals.breakfast.length, 0, 'better an honest gap than boiling water at 4am')
})

test('a sit-down breakfast drafts that same cook food', () => {
  const lib = [
    { id: 'oatmeal', name: 'Peak Refuel Hot Oatmeal', kcal: 350, carbsG: 60, fatG: 6, proteinG: 12, weightOz: 3, favorite: false, slotHint: 'breakfast', prep: 'cook' },
    { id: 'main', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner', prep: 'cook' },
  ]
  const trip = { ...mkTrip(), mealStyle: { breakfast: 'sitdown' } }
  const meals = draftDay(trip, 0, lib, new Set(), 'usual')
  assert.ok(meals.breakfast.some(e => e.foodId === 'oatmeal'), 'sit-down welcomes the hot option')
})

test('with the real seed, breakfast is bars and no-prep food — never a Peak Refuel pouch', () => {
  // Lawrence 2026-07-20: "Breakfast should be biased against using Peak Refuel
  // meals in favor of bars and no-prep foods." The 200–400 window plus the
  // prep bias must exclude every Peak pouch in the actual catalog.
  const lib = SEED.foods.map(f => ({ favorite: false, ...f }))
  const trip = mkTrip(7, 205)
  const drafts = draftEmptyDays(trip, lib, new Set(), 'usual')
  assert.equal(drafts.length, 7)
  for (const d of drafts) {
    const bk = slotKcal(d.meals.breakfast, lib)
    assert.ok(bk >= 200 && bk <= 400, `day ${d.dayIndex} breakfast in window: ${bk}`)
    for (const e of d.meals.breakfast) {
      const f = lib.find(x => x.id === e.foodId)
      assert.ok(!f.name.startsWith('Peak Refuel'), `day ${d.dayIndex} drafted ${f.name} for breakfast`)
    }
  }
})

test('real-seed week: dinners rotate through the ordered core meals, every day within ±50 kcal', () => {
  // The seed pre-stars the Guidefitter order; a fresh state must draft a week
  // of core-meal dinners with day totals tight to target.
  const lib = SEED.foods.map(f => ({ favorite: false, ...f }))
  const ordered = new Set(lib.filter(f => f.favorite && f.slotHint === 'dinner').map(f => f.id))
  assert.equal(ordered.size, 5, 'five ordered dinner mains pre-starred')
  const trip = mkTrip(7, 205)
  const target = dailyTargets(205, 'medium').kcal.target
  const drafts = draftEmptyDays(trip, lib, new Set(), 'usual')
  for (const d of drafts) {
    assert.ok(ordered.has(d.meals.dinner[0].foodId), `day ${d.dayIndex} main is an ordered meal`)
    const t = dayTotals({ intensity: 'medium', meals: d.meals }, lib)
    assert.ok(Math.abs(t.kcal - target) <= TOL, `day ${d.dayIndex}: |${t.kcal} - ${target}| <= ${TOL}`)
    assert.ok(d.meals.snacks.length <= 3, `day ${d.dayIndex} snack bundles: ${d.meals.snacks.length}`)
  }
  const mains = drafts.map(d => d.meals.dinner[0].foodId)
  for (let i = 1; i < mains.length; i++) assert.notEqual(mains[i], mains[i - 1], 'no consecutive dinner repeats')
})

test('±50 holds across weights and efforts with the real seed', () => {
  const lib = SEED.foods.map(f => ({ favorite: false, ...f }))
  for (const weightLbs of [150, 205, 240]) {
    for (const intensity of ['easy', 'medium', 'hard']) {
      const trip = { id: 't', name: 'T', weightLbs, startDate: '2026-08-01', days: [{ intensity }] }
      const meals = draftDay(trip, 0, lib, new Set(), 'usual')
      const t = dayTotals({ intensity, meals }, lib)
      const target = dailyTargets(weightLbs, intensity).kcal.target
      assert.ok(Math.abs(t.kcal - target) <= TOL,
        `${weightLbs} lb ${intensity}: |${t.kcal} - ${target}| <= ${TOL}`)
    }
  }
})

// ---------- Meal Style (issue #18) ----------

test('a trip without mealStyle drafts exactly like explicit defaults', () => {
  const bare = draftDay(mkTrip(), 0, LIB, STAPLES, 'usual')
  const explicit = draftDay({ ...mkTrip(), mealStyle: { ...MEAL_STYLE_DEFAULTS } }, 0, LIB, STAPLES, 'usual')
  assert.deepEqual(bare, explicit)
})

test('sit-down breakfast, real seed: the starred granola lands; the cap is the dinner share', () => {
  // Lawrence 2026-07-21: "focus on breakfast-type foods like the Peak Refuel
  // Strawberry Granola … the Skillet can land, that just means less snacks later."
  const lib = SEED.foods.map(f => ({ favorite: false, ...f }))
  const trip = { ...mkTrip(1, 205), mealStyle: { breakfast: 'sitdown' } }
  const meals = draftDay(trip, 0, lib, new Set(), 'usual')
  assert.ok(meals.breakfast.some(e => e.foodId === 'peak-strawberry-granola'),
    `starred granola heads a sit-down breakfast, got ${meals.breakfast.map(e => e.foodId)}`)
  const target = dailyTargets(205, 'medium').kcal.target
  assert.ok(slotKcal(meals.breakfast, lib) <= Math.round(target * 0.25) + 1,
    'no breakfast beyond the dinner share — one meal never eats the day')
  const t = dayTotals({ intensity: 'medium', meals }, lib)
  assert.ok(Math.abs(t.kcal - target) <= TOL, `|${t.kcal} - ${target}| <= ${TOL}`)
})

test('sit-down lunch, real seed: a starred dehydrated pouch lands — never the day’s own dinner', () => {
  const lib = SEED.foods.map(f => ({ favorite: false, ...f }))
  const trip = { ...mkTrip(3, 205), mealStyle: { lunch: 'sitdown' } }
  const target = dailyTargets(205, 'medium').kcal.target
  const drafts = draftEmptyDays(trip, lib, new Set(), 'usual')
  for (const d of drafts) {
    const pouch = d.meals.lunch.map(e => lib.find(f => f.id === e.foodId)).find(f => f.prep === 'cook')
    assert.ok(pouch, `day ${d.dayIndex} lunch carries a dehydrated pouch`)
    assert.ok(pouch.favorite, `the catalog never displaces owned core meals: ${pouch.id}`)
    assert.notEqual(pouch.id, d.meals.dinner[0].foodId, 'lunch pouch differs from the dinner main')
    const t = dayTotals({ intensity: 'medium', meals: d.meals }, lib)
    assert.ok(Math.abs(t.kcal - target) <= TOL, `day ${d.dayIndex}: |${t.kcal} - ${target}| <= ${TOL}`)
  }
})

test('mobile dinner, real seed: no cook foods; dinner composes toward its share; ±50 still holds', () => {
  const lib = SEED.foods.map(f => ({ favorite: false, ...f }))
  const trip = { ...mkTrip(1, 205), mealStyle: { dinner: 'mobile' } }
  const meals = draftDay(trip, 0, lib, new Set(), 'usual')
  assert.ok(meals.dinner.length > 0, 'dinner still composes without a pouch')
  for (const e of meals.dinner) {
    assert.notEqual(lib.find(f => f.id === e.foodId).prep, 'cook', 'no boiling water on a mobile dinner')
  }
  const target = dailyTargets(205, 'medium').kcal.target
  const t = dayTotals({ intensity: 'medium', meals }, lib)
  assert.ok(Math.abs(t.kcal - target) <= TOL, `|${t.kcal} - ${target}| <= ${TOL}`)
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

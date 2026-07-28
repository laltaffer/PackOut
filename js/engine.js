// PackOut engine — pure functions only. No DOM, no storage, no globals.
// V2P nutrition model: see reference/v2p-nutrition-sheet-export.md.

const KCAL_PER_LB = {
  easy: { lo: 16, hi: 16 },
  medium: { lo: 17, hi: 20 },
  hard: { lo: 21, hi: 21 },
}

const PROTEIN_FLOOR_G_PER_LB = 0.6

export function dailyTargets(weightLbs, intensity) {
  const mult = KCAL_PER_LB[intensity]
  if (!mult) throw new Error(`Unknown intensity: ${intensity}`)
  const lo = weightLbs * mult.lo
  const hi = weightLbs * mult.hi
  return {
    kcal: { lo, hi, target: (lo + hi) / 2 },
    carbsG: { min: Math.round((lo * 0.40) / 4), max: Math.round((hi * 0.60) / 4) },
    proteinG: {
      min: Math.round((lo * 0.10) / 4),
      max: Math.round((hi * 0.15) / 4),
      floor: Math.round(weightLbs * PROTEIN_FLOOR_G_PER_LB),
    },
    // Fat is the remainder: min when carbs+protein are at max share, and vice versa.
    fatG: { min: Math.round((lo * 0.25) / 9), max: Math.round((hi * 0.50) / 9) },
  }
}

// Meal-slot targets per the V2P welcome text; dinner carries ~25% of day kcal.
export function slotTargets(targets) {
  return {
    breakfast: { kcalMin: 200, kcalMax: 400, carbsMinG: 40, carbsMaxG: 60 },
    snack: { kcal: 300, carbsMinG: 40, carbsMaxG: 60 },
    dinner: {
      kcal: Math.round(targets.kcal.target * 0.25),
      proteinMinG: 30,
      proteinIdealG: 40,
      carbsMinG: 60,
      carbsIdealG: 90,
    },
  }
}

export function emptyMeals() {
  return { electrolytes: [], breakfast: [], lunch: [], dinner: [], snacks: [] }
}

// Sum a list of {foodId, qty} entries against the library. Null macros count
// as zero; weight sums only what's known and reports how many items lack it.
export function sumEntries(entries, library) {
  const byId = new Map(library.map(f => [f.id, f]))
  const t = { kcal: 0, carbsG: 0, fatG: 0, proteinG: 0, weightOz: 0, missingWeightCount: 0 }
  for (const { foodId, qty } of entries) {
    const f = byId.get(foodId)
    if (!f) continue
    t.kcal += f.kcal * qty
    t.carbsG += (f.carbsG ?? 0) * qty
    t.fatG += (f.fatG ?? 0) * qty
    t.proteinG += (f.proteinG ?? 0) * qty
    if (f.weightOz === null) t.missingWeightCount += qty
    else t.weightOz += f.weightOz * qty
  }
  t.weightOz = Math.round(t.weightOz * 100) / 100
  // Any unweighed unit would overstate pack efficiency — admit ignorance instead.
  t.calsPerOz = t.weightOz > 0 && t.missingWeightCount === 0 ? Math.round(t.kcal / t.weightOz) : null
  return t
}

export function dayTotals(day, library) {
  return sumEntries(flatEntries(day), library)
}

// Verdict thresholds (SPEC): Fueled = ≥90% kcal target AND protein ≥ floor;
// Heavy = >115% kcal (soft warning); Short otherwise, with the concrete gap.
const FUELED_KCAL_PCT = 0.90
const HEAVY_KCAL_PCT = 1.15
// Lawrence 2026-07-20: a day inside its kcal window is "probably fine" a
// couple grams under the protein floor — trace shortfalls don't flag Short.
// Beyond the grace, the reported gap is the full distance to the true floor.
const PROTEIN_FLOOR_GRACE_G = 5

export function dayVerdict(day, weightLbs, library) {
  const targets = dailyTargets(weightLbs, day.intensity)
  const totals = dayTotals(day, library)
  // Status compares RAW values (a 0.4 kcal deficit is still a deficit); only
  // the reported gap is rounded, and always up — a real shortfall never
  // displays as zero.
  const EPS = 1e-9
  const rawKcalShort = FUELED_KCAL_PCT * targets.kcal.target - totals.kcal
  const rawProteinShort = weightLbs * PROTEIN_FLOOR_G_PER_LB - totals.proteinG
  const rawKcalOver = totals.kcal - HEAVY_KCAL_PCT * targets.kcal.target
  const kcalShort = rawKcalShort > EPS ? Math.ceil(rawKcalShort) : 0
  const proteinShortG = rawProteinShort > PROTEIN_FLOOR_GRACE_G + EPS ? Math.ceil(rawProteinShort) : 0
  const kcalOver = rawKcalOver > EPS ? Math.ceil(rawKcalOver) : 0
  const status = (kcalShort > 0 || proteinShortG > 0) ? 'short' : (kcalOver > 0 ? 'heavy' : 'fueled')
  return { status, kcalShort, proteinShortG, kcalOver, totals, targets }
}

export function tripVerdict(trip, library) {
  const shortDays = []
  const heavyDays = []
  trip.days.forEach((day, i) => {
    const v = dayVerdict(day, trip.weightLbs, library)
    if (v.status === 'short') shortDays.push(i)
    if (v.status === 'heavy') heavyDays.push(i)
  })
  return { fueled: shortDays.length === 0, shortDays, heavyDays }
}

// Staples — deterministic habit detection: a food is a Staple when it appears
// on at least 3 planned days and at least half of all planned days.
export function stapleIds(trips) {
  const dayCounts = new Map()
  let plannedDays = 0
  for (const trip of trips) {
    for (const day of trip.days) {
      const ids = new Set(flatEntries(day).map(e => e.foodId))
      if (ids.size === 0) continue
      plannedDays += 1
      for (const id of ids) dayCounts.set(id, (dayCounts.get(id) ?? 0) + 1)
    }
  }
  const out = new Set()
  for (const [id, n] of dayCounts) {
    if (n >= 3 && n >= plannedDays / 2) out.add(id)
  }
  return out
}

function flatEntries(day) {
  const meals = day.meals ?? emptyMeals()
  return [
    ...meals.electrolytes, ...meals.breakfast, ...meals.lunch, ...meals.dinner,
    ...meals.snacks.flatMap(s => s.items),
  ]
}

// Grocery list: every planned food across the trip, one line per food, counts summed.
export function groceryList(trip, library) {
  const byId = new Map(library.map(f => [f.id, f]))
  const counts = new Map()
  for (const day of trip.days) {
    for (const { foodId, qty } of flatEntries(day)) {
      if (!byId.has(foodId)) continue
      counts.set(foodId, (counts.get(foodId) ?? 0) + qty)
    }
  }
  return [...counts]
    .map(([foodId, count]) => ({ foodId, name: byId.get(foodId).name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// One day's physical pack list: duplicates merged, quantities kept.
export function dayPackList(day, library) {
  const byId = new Map(library.map(f => [f.id, f]))
  const qtys = new Map()
  for (const { foodId, qty } of flatEntries(day)) {
    if (!byId.has(foodId)) continue
    qtys.set(foodId, (qtys.get(foodId) ?? 0) + qty)
  }
  return [...qtys]
    .map(([foodId, qty]) => ({ foodId, name: byId.get(foodId).name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Planned days across every trip, for importing a past day's plan into a new
// one. Empty days are noise, not options.
export function plannedDayOptions(trips, library) {
  const out = []
  for (const trip of trips) {
    trip.days.forEach((day, dayIndex) => {
      const kcal = dayTotals(day, library).kcal
      if (kcal > 0) out.push({ tripId: trip.id, tripName: trip.name, dayIndex, kcal })
    })
  }
  return out
}

// Where a thing rides is not what kind of thing it is. A pistol files under
// safety and binoculars under optics, but both hang on the harness; a spotting
// scope shares the optics category and goes in the pack. So carry mode is a
// property of the ITEM, defaulted from its category and overridable per item
// (Lawrence, 2026-07-27: "let's not count bino harness items in the pack
// weight — we could consider it part of overall carry weight").
//
//   pack    — on your back. The number a pack's comfort rating answers to.
//   harness — on your chest: binos, rangefinder, sidearm. Carried, not packed.
//   worn    — on your body. Never was pack weight.
export const WORN_CATEGORY = 'Clothing worn'
export const CARRY_MODES = ['pack', 'harness', 'worn']

export function carryModeOf(item) {
  if (CARRY_MODES.includes(item?.carry)) return item.carry
  return item?.category === WORN_CATEGORY ? 'worn' : 'pack'
}

// Trip gear rollup: packed vs total against the gear library, named unpacked
// items, pack weight and worn weight kept apart. Entries whose gear was
// deleted are ignored.
export function gearStats(trip, gearLibrary) {
  const byId = new Map(gearLibrary.map(g => [g.id, g]))
  // `weightOz` stays the pack number — it has always meant "on your back", and
  // every caller that shows a pack weight reads it.
  const stats = { total: 0, packed: 0, unpacked: [], weightOz: 0, harnessOz: 0, wornOz: 0, carriedOz: 0, missingWeightCount: 0 }
  const bucket = { pack: 'weightOz', harness: 'harnessOz', worn: 'wornOz' }
  for (const entry of trip.gear ?? []) {
    const g = byId.get(entry.gearId)
    if (!g) continue
    stats.total += 1
    if (entry.packed) stats.packed += 1
    else stats.unpacked.push({ gearId: g.id, name: g.name, category: g.category })
    if (g.weightOz === null) stats.missingWeightCount += 1
    else stats[bucket[carryModeOf(g)]] += g.weightOz
  }
  const round = n => Math.round(n * 100) / 100
  // Everything you move down the trail, however it is attached to you.
  stats.carriedOz = round(stats.weightOz + stats.harnessOz + stats.wornOz)
  stats.weightOz = round(stats.weightOz)
  stats.harnessOz = round(stats.harnessOz)
  stats.wornOz = round(stats.wornOz)
  return stats
}

// Flying (Lawrence 2026-07-27: "call out what you will not be able to fly
// with"). Rules match the gear item's NAME, not an id, so they catch both the
// question rows ("Stove fuel") and whatever the user renamed them to ("MSR
// IsoPro"). Name matching is a heuristic by nature — it warns, it never blocks
// a checklist, and an item it misses is still the packer's call.
// Levels: 'banned' — no US airline takes it in either bag, buy it there;
// 'checked' — checked baggage only, declared where the law says so;
// 'carryon' — cabin only (lithium cells may not ride in the hold).
export const FLY_RULES = [
  { level: 'banned', why: 'No airline takes fuel — buy it at the trailhead.', match: /\b(fuel|isopro|isobutane|propane|canister)\b/i },
  { level: 'banned', why: 'Bear spray is forbidden in both bags — buy it there.', match: /\bbear spray\b/i },
  { level: 'banned', why: 'Aerosols of this kind are forbidden in both bags.', match: /\b(bear repellent|pepper spray|mace)\b/i },
  { level: 'checked', why: 'Firearms fly checked, declared, in a locked case.', match: /\b(rifle|pistol|handgun|shotgun|firearm|revolver)\b/i },
  { level: 'checked', why: 'Ammunition flies checked, in its own approved box.', match: /\b(ammunition|ammo|cartridges|shells)\b/i },
  { level: 'checked', why: 'Blades of any length fly checked, never in the cabin.', match: /\b(knife|knives|blade|axe|hatchet|saw|multi-?tool|shears)\b/i },
  { level: 'checked', why: 'Broadheads and arrows fly checked.', match: /\b(arrow|arrows|broadhead|broadheads|bolt|bolts|bow)\b/i },
  { level: 'checked', why: 'Poles and stakes fly checked — they read as clubs.', match: /\b(trekking poles?|stakes?|tripod)\b/i },
  { level: 'carryon', why: 'Lithium cells ride in the cabin, never in the hold.', match: /\b(battery|batteries|power ?bank|inreach|garmin|satellite communicator)\b/i },
]

// What this trip's kit can't do at an airport. Empty unless the trip flies —
// a truck trip has no restrictions to report.
export function flyIssues(trip, gearLibrary = []) {
  const out = { banned: [], checked: [], carryon: [] }
  if (!trip?.flying) return out
  const byId = new Map(gearLibrary.map(g => [g.id, g]))
  for (const entry of trip.gear ?? []) {
    const g = byId.get(entry.gearId)
    if (!g) continue
    const rule = FLY_RULES.find(r => r.match.test(g.name))
    if (rule) out[rule.level].push({ gearId: g.id, name: g.name, why: rule.why })
  }
  return out
}

// Readiness: every Day Fueled (heavy is a warning, not a blocker), every
// planned food Packed, every gear item Packed, every Action done. Blockers
// are named, not counted. Trips without gear/actions aren't blocked by them.
export function readiness(trip, library, gearLibrary = []) {
  const verdict = tripVerdict(trip, library)
  let totalItems = 0
  let packedItems = 0
  const unpacked = []
  trip.days.forEach((day, i) => {
    for (const item of dayPackList(day, library)) {
      totalItems += 1
      // Packed marks are quantity-stamped: a mark made at qty 1 goes stale
      // when the plan grows to qty 2 — no false READY.
      if (day.packed?.[item.foodId] === item.qty) packedItems += 1
      else unpacked.push({ day: i, ...item })
    }
  })
  const gear = gearStats(trip, gearLibrary)
  const actionsAll = trip.actions ?? []
  const actions = { total: actionsAll.length, pending: actionsAll.filter(a => !a.done).length }
  return {
    ready: verdict.fueled && unpacked.length === 0 && totalItems > 0 &&
      gear.unpacked.length === 0 && actions.pending === 0,
    fueled: verdict.fueled,
    shortDays: verdict.shortDays,
    heavyDays: verdict.heavyDays,
    totalItems,
    packedItems,
    unpacked,
    gear,
    actions,
  }
}

// ---------- Draft assistant (spec issue #14) ----------
// Deterministic proposals. 'usual' replays Staples/Favorites into their hinted
// slots; 'optimized' prefers weight-efficient foods, habits as tie-breakers.
// A draft lands the day inside ±50 kcal of the target (Lawrence 2026-07-20:
// "stay within +/- 50cal") — the granular snacks (Goldbears per oz) are what
// make that window always reachable. Protein is maximized inside the window
// but never buys grams with kcal the window can't afford.

const DAY_KCAL_TOL = 50
// A dinner "main" needs substance; lighter dinner-hinted items (cider, cocoa)
// are add-ons and never proposed as the day's one big meal.
const MAIN_MIN_KCAL = 400
// Breakfast obeys the V2P slot window (200–400 kcal) hard — that window plus
// the prep bias is what keeps 500+ kcal pouches out of a grab-and-go morning.
// Lunch is a real meal that grows toward its day-kcal share; bars + snacks
// stacking into one is legitimate ("a ProBar plus gummy bears").
const LUNCH_MIN_KCAL = 300
const LUNCH_SHARE = 0.27
// Snacks appear as at most 3 bundles; repeats grow qty inside a bundle.
const SNACK_BUNDLES = 3

// Per-trip Meal Style (issue #18): breakfast/lunch/dinner each draft as
// 'mobile' (grab & go — cook foods never proposed) or 'sitdown' (time to
// boil water — dehydrated meals welcome). Draft-time only: manual adds are
// never restricted. Defaults reproduce the pre-#18 hard-coded behavior, so
// trips without the field draft identically.
export const MEAL_STYLE_DEFAULTS = { breakfast: 'mobile', lunch: 'mobile', dinner: 'sitdown' }

export function mealStyleOf(trip) {
  return { ...MEAL_STYLE_DEFAULTS, ...(trip?.mealStyle ?? {}) }
}

function dinnerMains(library, staples = new Set(), requireSubstantial = false) {
  const hinted = library.filter(f => f.slotHint === 'dinner')
  const substantial = hinted.filter(f => f.kcal >= MAIN_MIN_KCAL)
  if (requireSubstantial && substantial.length === 0) return []
  const mains = substantial.length ? substantial : hinted
  // The user's own mains (Favorites/Staples) ARE the rotation pool whenever
  // there are enough of them for variety — the catalog never displaces owned
  // core meals. This holds for 'optimized' too (Codex, 2026-07-27): optimized
  // means the most efficient meal among the ones you actually like, not the
  // most efficient meal in the catalog. Two is the floor because one starred
  // main is not a rotation, and dinners rotate across the week.
  const own = mains.filter(f => f.favorite || staples.has(f.id))
  return own.length >= 2 ? own : mains
}

function rankHabit(foods, staples) {
  return [...foods].sort((a, b) =>
    ((b.favorite === true) - (a.favorite === true)) ||
    (staples.has(b.id) - staples.has(a.id)) ||
    a.name.localeCompare(b.name))
}

function rankByDensity(foods, staples, metric) {
  const d = f => f.weightOz ? (metric === 'protein' ? (f.proteinG ?? 0) : f.kcal) / f.weightOz : 0
  return [...foods].sort((a, b) =>
    (d(b) - d(a)) ||
    ((b.favorite === true) - (a.favorite === true)) ||
    (staples.has(b.id) - staples.has(a.id)) ||
    a.name.localeCompare(b.name))
}

// The dinner-main pool honors the trip's dinner style: a mobile dinner draws
// only from ready-to-eat foods, and would rather have no main at all (the
// slot then composes like lunch) than promote an add-on to the big meal.
function mainsFor(trip, library, staples, strategy) {
  const mobile = mealStyleOf(trip).dinner === 'mobile'
  const pool = mobile ? library.filter(f => f.prep !== 'cook') : library
  const mains = dinnerMains(pool, staples, mobile)
  const ranked = strategy === 'usual' ? rankHabit(mains, staples) : rankByDensity(mains, staples, 'kcal')
  // Even the optimizer eats what you like first. Density decides the order
  // WITHIN the food you've starred, never whether to skip past it for a denser
  // stranger (Codex, 2026-07-27) — the sort is stable, so each tier keeps the
  // strategy's own ranking. With a single starred main this still rotates:
  // pickMain's avoid set steps past it on the following night.
  const own = f => (f.favorite === true || staples.has(f.id)) ? 0 : 1
  return [...ranked].sort((a, b) => own(a) - own(b))
}

function pickMain(mains, avoid) {
  if (mains.length === 0) return null
  return mains.find(m => !avoid.has(m.id)) ?? mains[0]
}

function adjacentMains(trip, dayIndex) {
  const avoid = new Set()
  for (const j of [dayIndex - 1, dayIndex + 1]) {
    const id = trip.days[j]?.meals?.dinner?.[0]?.foodId
    if (id) avoid.add(id)
  }
  return avoid
}

// Slot ranking for 'usual': habits first, then foods that live in this slot,
// then name — so a starred bar beats an unstarred hinted item, but hinted
// items beat pool fillers among equals.
function rankSlot(pool, staples, slotBase) {
  return [...pool].sort((a, b) =>
    ((b.favorite === true) - (a.favorite === true)) ||
    (staples.has(b.id) - staples.has(a.id)) ||
    ((b.slotHint === slotBase) - (a.slotHint === slotBase)) ||
    a.name.localeCompare(b.name))
}

// A food you took off a day is a decision, not a typo (Lawrence 2026-07-27:
// "I keep removing pico de gallo and drafting adds it back"). Declines are
// per-trip — a food that has no place in Alaska may still belong in Montana.
export function declinedIds(trip) {
  return new Set(Array.isArray(trip?.declined) ? trip.declined : [])
}

// Favorites are a choice, not a tie-breaker (Lawrence 2026-07-27). Every pick
// tries the starred subset first and only widens to the rest of the library
// when nothing starred fits the window that's left.
function findFit(pool, rank, fits) {
  const starred = pool.filter(f => f.favorite)
  return (starred.length ? rank(starred).find(fits) : undefined) ?? rank(pool).find(fits)
}

function buildDraft(trip, dayIndex, fullLibrary, staples, strategy, avoidMains, mainsOverride = null) {
  const meals = emptyMeals()
  const declined = declinedIds(trip)
  const library = declined.size ? fullLibrary.filter(f => !declined.has(f.id)) : fullLibrary
  if (library.length === 0) return meals
  const targets = dailyTargets(trip.weightLbs, trip.days[dayIndex]?.intensity ?? 'medium')
  const target = targets.kcal.target
  const dayCeil = target + DAY_KCAL_TOL
  const st = slotTargets(targets)
  const bf = st.breakfast
  const style = mealStyleOf(trip)
  const proteinFloor = trip.weightLbs * PROTEIN_FLOOR_G_PER_LB
  const hinted = slot => library.filter(f => f.slotHint === slot)
  let kcal = 0
  let protein = 0
  const slotKcal = { electrolytes: 0, breakfast: 0, lunch: 0, dinner: 0 }

  const add = (slot, food) => {
    meals[slot].push({ foodId: food.id, qty: 1 })
    kcal += food.kcal
    protein += food.proteinG ?? 0
    slotKcal[slot] += food.kcal
  }

  // Electrolytes: replay every habit (usual), else one ranked pick.
  {
    const pool = hinted('electrolytes')
    if (pool.length) {
      const habits = strategy === 'usual'
        ? rankHabit(pool.filter(f => f.favorite || staples.has(f.id)), staples)
        : []
      const rank = p => strategy === 'usual' ? rankHabit(p, staples) : rankByDensity(p, staples, 'kcal')
      const picks = habits.length ? habits : [findFit(pool, rank, () => true)]
      for (const f of picks) if (f) add('electrolytes', f)
    }
  }

  // Dinner: the one big meal. Rotation/avoidance is the caller's job.
  const mains = mainsOverride ?? mainsFor(trip, library, staples, strategy)
  const main = pickMain(mains, avoidMains)
  if (main) add('dinner', main)

  // Breakfast fills toward 400; a sit-down breakfast may take one big hot
  // item up to the dinner share (Lawrence: the Skillet can land — the ±50 day
  // window just means fewer snacks later). Lunch grows toward its day share
  // (capped at 1.5×); a sit-down lunch also draws from the dehydrated-meal
  // catalog (never the day's own dinner). A mobile slot never drafts cook
  // foods — the user can still add them by hand. A mobile dinner with no
  // ready main composes toward the dinner share like lunch does. All fills
  // stop when nothing fits and never spend past the day's +50 ceiling.
  // Protein steers the picks (habits first) while the floor is unmet.
  const lunchGrow = Math.max(LUNCH_MIN_KCAL, LUNCH_SHARE * target)
  const windows = {
    breakfast: { goal: bf.kcalMax, max: style.breakfast === 'sitdown' ? Math.max(bf.kcalMax, st.dinner.kcal) : bf.kcalMax },
    lunch: { goal: lunchGrow, max: lunchGrow * 1.5 },
  }
  const fillSlots = ['breakfast', 'lunch']
  if (!main && style.dinner === 'mobile') {
    fillSlots.push('dinner')
    windows.dinner = { goal: st.dinner.kcal, max: st.dinner.kcal * 1.5 }
  }
  for (const slot of fillSlots) {
    const w = windows[slot]
    let pool = [...hinted(slot), ...hinted('snack')]
    if (slot === 'lunch' && style.lunch === 'sitdown') {
      const inPool = new Set(pool.map(f => f.id))
      pool = [...pool, ...library.filter(f => f.prep === 'cook' && !inPool.has(f.id) && f.id !== main?.id)]
    }
    if (style[slot] === 'mobile') pool = pool.filter(f => f.prep !== 'cook')
    const used = new Set()
    // One boil per meal (Lawrence 2026-07-21): a composed slot drafts at
    // most one cook food; the rest of the window fills with ready sides.
    let pouched = false
    while (slotKcal[slot] < w.goal) {
      const rank = p => protein < proteinFloor
        ? [...p].sort((a, b) => ((b.favorite === true) - (a.favorite === true)) || ((b.proteinG ?? 0) - (a.proteinG ?? 0)) || (a.kcal - b.kcal) || a.name.localeCompare(b.name))
        : (strategy === 'usual' ? rankSlot(p, staples, slot) : rankByDensity(p, staples, 'kcal'))
      const f = findFit(pool, rank, x => !used.has(x.id) && !(pouched && x.prep === 'cook') &&
        slotKcal[slot] + x.kcal <= w.max && kcal + x.kcal <= dayCeil)
      if (!f) break
      add(slot, f)
      used.add(f.id)
      if (f.prep === 'cook') pouched = true
    }
  }

  // Snacks close the day. Protein first — ranked by ABSOLUTE protein (weight-
  // unknown items must not sink), repeats allowed — but only with kcal the
  // ±50 window can afford; a residual protein gap is the Verdict's to flag.
  // Then the kcal gap fills with round-robin variety until the day lands
  // inside [target−50, target+50]. At most 3 bundles; repeats stack qty.
  const snackPool = hinted('snack')
  const addSnack = food => {
    const bundle = meals.snacks.find(s => s.items.some(e => e.foodId === food.id))
    if (bundle) bundle.items.find(e => e.foodId === food.id).qty += 1
    else if (meals.snacks.length < SNACK_BUNDLES) meals.snacks.push({ items: [{ foodId: food.id, qty: 1 }] })
    else meals.snacks[meals.snacks.length - 1].items.push({ foodId: food.id, qty: 1 })
    kcal += food.kcal
    protein += food.proteinG ?? 0
  }
  const byProtein = p => [...p].sort((a, b) =>
    ((b.proteinG ?? 0) - (a.proteinG ?? 0)) || (a.kcal - b.kcal) || a.name.localeCompare(b.name))
  let guard = 0
  while (protein < proteinFloor && guard < 60) {
    guard += 1
    const f = findFit(snackPool, byProtein, x => (x.proteinG ?? 0) > 0 && kcal + x.kcal <= dayCeil)
    if (!f) break
    addSnack(f)
  }
  const rankSnack = p => strategy === 'usual' ? rankHabit(p, staples) : rankByDensity(p, staples, 'kcal')
  let adds = 0
  guard = 0
  while (kcal < target - DAY_KCAL_TOL && snackPool.length > 0 && guard < 100) {
    guard += 1
    // Rotation keeps variety inside whichever pool answers — the offset is
    // applied to the ranked list findFit would have used.
    const rotate = p => {
      const r = rankSnack(p)
      const idx = r.length ? adds % r.length : 0
      return [...r.slice(idx), ...r.slice(0, idx)]
    }
    const f = findFit(snackPool, rotate, x => kcal + x.kcal <= dayCeil)
    if (!f) break
    addSnack(f)
    adds += 1
  }
  return meals
}

export function draftDay(trip, dayIndex, library, staples, strategy = 'usual') {
  return buildDraft(trip, dayIndex, library, staples, strategy, adjacentMains(trip, dayIndex))
}

export function draftEmptyDays(trip, fullLibrary, staples, strategy = 'usual') {
  const declined = declinedIds(trip)
  const library = declined.size ? fullLibrary.filter(f => !declined.has(f.id)) : fullLibrary
  const out = []
  let prevMain = null
  trip.days.forEach((day, dayIndex) => {
    const existingMain = day.meals?.dinner?.[0]?.foodId
    // "Is this day already planned?" is asked of the WHOLE library. Asking the
    // decline-filtered one would read a day whose only food is declined as
    // empty and overwrite it — the opposite of "planned days untouched"
    // (Codex, 2026-07-27). Only the replacement draft honors the declines.
    if (dayTotals(day, fullLibrary).kcal > 0) {
      prevMain = existingMain ?? prevMain
      return
    }
    const avoid = new Set(adjacentMains(trip, dayIndex))
    if (prevMain) avoid.add(prevMain)
    // Rotate the starting point through the ranked mains so a week cycles
    // them instead of alternating between the top two.
    const mains = mainsFor(trip, library, staples, strategy)
    const rotated = mains.length
      ? [...mains.slice(out.length % mains.length), ...mains.slice(0, out.length % mains.length)]
      : null
    const meals = buildDraft(trip, dayIndex, library, staples, strategy, avoid, rotated)
    out.push({ dayIndex, meals })
    prevMain = meals.dinner[0]?.foodId ?? prevMain
  })
  return out
}

// Account sync resolution (spec #19). Whole-state last-write-wins: given the
// local clock and the server copy, decide the one action to take. 'push'
// covers first-sign-in adoption (local data, empty profile) — same move.
export function resolveSync(localUpdatedAt, remote) {
  const local = localUpdatedAt || 0
  const server = remote?.state ? remote.updatedAt || 0 : 0
  if (server > local) return 'pull'
  if (local > server) return 'push'
  return 'none'
}

// What happens to this device's cached state when <sub> signs in. A cache
// with no owner predates accounts and is adopted into the profile; a cache
// owned by a different account is discarded — resolveSync's adoption push
// must never move one person's data into another's profile.
export function resolveSignIn(cacheOwner, sub) {
  if (!cacheOwner) return 'adopt'
  return cacheOwner === sub ? 'reuse' : 'discard'
}

// Backup import validation. Returns {ok:true} or {ok:false, error} — never
// throws. Deep on purpose: an accepted import replaces the whole state, so
// anything that could crash a render or reach the DOM as a non-number is
// rejected here, and the state is never assigned.
const INTENSITIES = ['easy', 'medium', 'hard']
const MEAL_KEYS = ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snacks']

function num(v) { return typeof v === 'number' && Number.isFinite(v) }
function numOrNull(v) { return v === null || num(v) }

// Ids are interpolated into HTML attributes and hash routes; constrain them at
// the import boundary so they can never carry markup.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
function validId(v) { return typeof v === 'string' && SAFE_ID.test(v) }

// The engine imports nothing (it's the pure core), so the trip-type vocabulary
// is spelled out here as well as in seed.js — a test pins the two together.
const TRIP_TYPE_VALUES = ['backpacking', 'rifle', 'bow', 'fishing']

// Same deal for gear categories: the gear screen groups by a fixed list, so an
// item filed outside it is invisible while still counting toward the weight and
// packed totals (Codex, 2026-07-27). Legacy names are accepted because
// migrateGear renames them after the gate. A test pins this to seed.js.
const GEAR_CATEGORY_VALUES = [
  'Backpack', 'Shelter/Sleeping', 'Water', 'Cooking', 'Weapon', 'Optics/Bino Pouch',
  'Kill kit', 'Fishing', 'First aid & Safety', 'Clothing worn', 'Clothing packed', 'Luxuries',
  'Pack', 'Food kit',
]

function validMealStyle(style) {
  return style && typeof style === 'object' &&
    Object.entries(style).every(([k, v]) =>
      ['breakfast', 'lunch', 'dinner'].includes(k) && (v === 'mobile' || v === 'sitdown'))
}

// A looked-up destination (spec: destination lookup). Every field is display
// text or a number that reaches the DOM, so the shape is pinned here the same
// way food macros are — a hand-edited backup can't inject markup or NaN.
function validPlace(p) {
  if (typeof p !== 'object' || typeof p.label !== 'string' || p.label.length > 200) return false
  if (!num(p.lat) || p.lat < -90 || p.lat > 90) return false
  if (!num(p.lon) || p.lon < -180 || p.lon > 180) return false
  if (!numOrNull(p.elevationFt)) return false
  if (!num(p.at)) return false
  if (p.climate === undefined || p.climate === null) return true
  const c = p.climate
  return typeof c === 'object' &&
    [c.tempLoF, c.tempHiF, c.precipIn, c.precipDays, c.days].every(numOrNull)
}

function validEntries(entries) {
  return Array.isArray(entries) && entries.every(e =>
    e && validId(e.foodId) && num(e.qty) && e.qty >= 1)
}

function validDay(day) {
  if (!day || !INTENSITIES.includes(day.intensity)) return false
  if (day.meals !== undefined) {
    const m = day.meals
    if (!m || typeof m !== 'object') return false
    if (!MEAL_KEYS.every(k => k in m)) return false
    if (!['electrolytes', 'breakfast', 'lunch', 'dinner'].every(k => validEntries(m[k]))) return false
    if (!Array.isArray(m.snacks) || !m.snacks.every(s => s && validEntries(s.items))) return false
  }
  if (day.packed !== undefined) {
    if (!day.packed || typeof day.packed !== 'object') return false
    if (!Object.entries(day.packed).every(([k, v]) => validId(k) && num(v))) return false
  }
  return true
}

export function validateImport(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Not a PackOut backup file.' }
  if (data.schemaVersion !== 1) return { ok: false, error: `Unsupported schema version: ${data.schemaVersion}.` }
  if (!Array.isArray(data.trips) || !Array.isArray(data.library)) {
    return { ok: false, error: 'Backup is missing trips or library.' }
  }
  const tripIds = new Set()
  for (const t of data.trips) {
    if (!t || !validId(t.id) || tripIds.has(t.id)) return { ok: false, error: 'Trip ids must be unique, plain identifiers.' }
    tripIds.add(t.id)
    if (!t.name || !Array.isArray(t.days) || t.days.length === 0 || !num(t.weightLbs) || t.weightLbs <= 0 || !t.startDate) {
      return { ok: false, error: `Trip "${t.name ?? '?'}" is malformed.` }
    }
    // A trip can be several things at once — an Alaska hunt that also fishes.
    // Legacy single `type` still validates: migration folds it into `types`.
    if (t.type !== undefined && !TRIP_TYPE_VALUES.includes(t.type)) {
      return { ok: false, error: `Trip "${t.name}" has an unknown trip type.` }
    }
    if (t.types !== undefined && (!Array.isArray(t.types) || !t.types.every(v => TRIP_TYPE_VALUES.includes(v)))) {
      return { ok: false, error: `Trip "${t.name}" has an unknown trip type.` }
    }
    if (t.mealStyle !== undefined && !validMealStyle(t.mealStyle)) {
      return { ok: false, error: `Trip "${t.name}" has an invalid meal style.` }
    }
    if (t.flying !== undefined && typeof t.flying !== 'boolean') {
      return { ok: false, error: `Trip "${t.name}" has an invalid flying flag.` }
    }
    if (t.declined !== undefined && (!Array.isArray(t.declined) || !t.declined.every(validId))) {
      return { ok: false, error: `Trip "${t.name}" has an invalid excluded-food list.` }
    }
    if (t.place !== undefined && t.place !== null && !validPlace(t.place)) {
      return { ok: false, error: `Trip "${t.name}" has malformed destination data.` }
    }
    for (const [i, day] of t.days.entries()) {
      if (!validDay(day)) return { ok: false, error: `Trip "${t.name}", day ${i + 1} is malformed.` }
    }
  }
  const foodIds = new Set()
  for (const f of data.library) {
    if (!f || !validId(f.id) || foodIds.has(f.id)) return { ok: false, error: 'Food ids must be unique, plain identifiers.' }
    foodIds.add(f.id)
    if (!f.name?.trim?.() || !num(f.kcal) || f.kcal <= 0) return { ok: false, error: `Food "${f.name ?? '?'}" is malformed.` }
    if (![f.carbsG, f.fatG, f.proteinG, f.weightOz].every(numOrNull)) {
      return { ok: false, error: `Food "${f.name}" has non-numeric macros.` }
    }
    if (f.url !== undefined && f.url !== null && typeof f.url !== 'string') {
      return { ok: false, error: `Food "${f.name}" has an invalid url.` }
    }
    if (f.prep !== undefined && f.prep !== 'ready' && f.prep !== 'cook') {
      return { ok: false, error: `Food "${f.name}" has an invalid prep value.` }
    }
  }
  // The gear library reaches the DOM the same way food does — names, weights
  // and categories are all interpolated — so it gets the same gate. It went
  // unvalidated until Codex found it (2026-07-27): a crafted backup could put
  // markup in a weight, which the gear screen would then execute.
  if (data.gearLibrary !== undefined) {
    if (!Array.isArray(data.gearLibrary)) return { ok: false, error: 'Backup gear library is malformed.' }
    const gearIds = new Set()
    for (const g of data.gearLibrary) {
      if (!g || !validId(g.id) || gearIds.has(g.id)) return { ok: false, error: 'Gear ids must be unique, plain identifiers.' }
      gearIds.add(g.id)
      if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 200) {
        return { ok: false, error: `Gear item "${g.id}" has a malformed name.` }
      }
      if (!GEAR_CATEGORY_VALUES.includes(g.category)) {
        return { ok: false, error: `Gear item "${g.name}" has an unknown category.` }
      }
      // A zero or negative ounce is not a light item, it is a corrupt one —
      // and it would quietly subtract from the pack weight.
      if (g.weightOz !== null && (!num(g.weightOz) || g.weightOz <= 0)) {
        return { ok: false, error: `Gear item "${g.name}" has an impossible weight.` }
      }
      if (g.url !== undefined && g.url !== null && typeof g.url !== 'string') {
        return { ok: false, error: `Gear item "${g.name}" has an invalid url.` }
      }
      if (g.carry !== undefined && !CARRY_MODES.includes(g.carry)) {
        return { ok: false, error: `Gear item "${g.name}" has an unknown carry mode.` }
      }
    }
  }
  if (data.profile !== undefined) {
    const p = data.profile
    const strArr = a => Array.isArray(a) && a.every(s => typeof s === 'string' && SAFE_ID.test(s))
    if (!p || typeof p !== 'object' || !num(p.setupAt) || !strArr(p.brands) || !strArr(p.tripTypes)) {
      return { ok: false, error: 'Profile is malformed.' }
    }
    if (p.weightLbs !== null && (!num(p.weightLbs) || p.weightLbs <= 0)) {
      return { ok: false, error: 'Profile body weight is malformed.' }
    }
    if (p.mealStyle !== undefined && p.mealStyle !== null && !validMealStyle(p.mealStyle)) {
      return { ok: false, error: 'Profile meal style is malformed.' }
    }
  }
  return { ok: true }
}

// Picker ordering: Favorite, then Staple, then foods that usually live in
// this slot, then name. Owned here so the UI never re-implements ranking.
export function pickerRank(library, staples, slotBase) {
  return [...library].sort((a, b) =>
    ((b.favorite === true) - (a.favorite === true)) ||
    (staples.has(b.id) - staples.has(a.id)) ||
    ((b.slotHint === slotBase) - (a.slotHint === slotBase)) ||
    a.name.localeCompare(b.name))
}

// Gap-closing suggestions, ranked: Favorite, then Staple, then how well the
// food fights the actual gap (protein density for protein gaps, cals/oz —
// pack-weight efficiency — for calorie gaps).
export function suggestions(gap, library, staples, limit = 5) {
  const density = f => f.weightOz
    ? (gap.proteinShortG > 0 ? (f.proteinG ?? 0) : f.kcal) / f.weightOz
    : 0
  return [...library]
    .sort((a, b) =>
      ((b.favorite === true) - (a.favorite === true)) ||
      (staples.has(b.id) - staples.has(a.id)) ||
      (density(b) - density(a)))
    .slice(0, limit)
}

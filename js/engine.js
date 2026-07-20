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

// Trip gear rollup: packed vs total against the gear library, named unpacked
// items, and total known pack weight. Entries whose gear was deleted are ignored.
export function gearStats(trip, gearLibrary) {
  const byId = new Map(gearLibrary.map(g => [g.id, g]))
  const stats = { total: 0, packed: 0, unpacked: [], weightOz: 0, missingWeightCount: 0 }
  for (const entry of trip.gear ?? []) {
    const g = byId.get(entry.gearId)
    if (!g) continue
    stats.total += 1
    if (entry.packed) stats.packed += 1
    else stats.unpacked.push({ gearId: g.id, name: g.name, category: g.category })
    if (g.weightOz === null) stats.missingWeightCount += 1
    else stats.weightOz += g.weightOz
  }
  stats.weightOz = Math.round(stats.weightOz * 100) / 100
  return stats
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

function dinnerMains(library, staples = new Set(), habitTier = false) {
  const hinted = library.filter(f => f.slotHint === 'dinner')
  const substantial = hinted.filter(f => f.kcal >= MAIN_MIN_KCAL)
  const mains = substantial.length ? substantial : hinted
  if (habitTier) {
    // Usual drafts treat the user's own mains (Favorites/Staples) as the
    // rotation pool when there are enough for variety — the catalog never
    // displaces owned core meals.
    const own = mains.filter(f => f.favorite || staples.has(f.id))
    if (own.length >= 2) return own
  }
  return mains
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

// Mornings are mobile (Lawrence): breakfast candidates that need hot water
// (prep === 'cook') sink below ready-to-eat ones. Stable sort keeps the
// underlying ranking within each group; other slots are untouched.
function prepRank(list, slot) {
  if (slot !== 'breakfast') return list
  return [...list].sort((a, b) => ((a.prep === 'cook') ? 1 : 0) - ((b.prep === 'cook') ? 1 : 0))
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

function buildDraft(trip, dayIndex, library, staples, strategy, avoidMains, mainsOverride = null) {
  const meals = emptyMeals()
  if (library.length === 0) return meals
  const targets = dailyTargets(trip.weightLbs, trip.days[dayIndex]?.intensity ?? 'medium')
  const target = targets.kcal.target
  const dayCeil = target + DAY_KCAL_TOL
  const bf = slotTargets(targets).breakfast
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
      const picks = habits.length ? habits
        : [(strategy === 'usual' ? rankHabit(pool, staples) : rankByDensity(pool, staples, 'kcal'))[0]]
      for (const f of picks) add('electrolytes', f)
    }
  }

  // Dinner: the one big meal. Rotation/avoidance is the caller's job.
  const mains = mainsOverride ?? (strategy === 'usual'
    ? rankHabit(dinnerMains(library, staples, true), staples)
    : rankByDensity(dinnerMains(library), staples, 'kcal'))
  const main = pickMain(mains, avoidMains)
  if (main) add('dinner', main)

  // Breakfast fills its hard 200–400 window; lunch grows toward its day
  // share (capped at 1.5×). Both stack slot-hinted + snack-pool items, stop
  // when nothing fits, and never spend past the day's +50 ceiling. Protein
  // steers the picks while the floor is unmet.
  const lunchGrow = Math.max(LUNCH_MIN_KCAL, LUNCH_SHARE * target)
  const windows = {
    breakfast: { goal: bf.kcalMax, max: bf.kcalMax },
    lunch: { goal: lunchGrow, max: lunchGrow * 1.5 },
  }
  for (const slot of ['breakfast', 'lunch']) {
    const w = windows[slot]
    const pool = [...hinted(slot), ...hinted('snack')]
    const used = new Set()
    while (slotKcal[slot] < w.goal) {
      const ranked = prepRank(protein < proteinFloor
        ? [...pool].sort((a, b) => ((b.proteinG ?? 0) - (a.proteinG ?? 0)) || (a.kcal - b.kcal) || a.name.localeCompare(b.name))
        : (strategy === 'usual' ? rankSlot(pool, staples, slot) : rankByDensity(pool, staples, 'kcal')), slot)
      const f = ranked.find(x => !used.has(x.id) &&
        slotKcal[slot] + x.kcal <= w.max && kcal + x.kcal <= dayCeil)
      if (!f) break
      add(slot, f)
      used.add(f.id)
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
  const byProtein = [...snackPool].sort((a, b) =>
    ((b.proteinG ?? 0) - (a.proteinG ?? 0)) || (a.kcal - b.kcal) || a.name.localeCompare(b.name))
  let guard = 0
  while (protein < proteinFloor && guard < 60) {
    guard += 1
    const f = byProtein.find(x => (x.proteinG ?? 0) > 0 && kcal + x.kcal <= dayCeil)
    if (!f) break
    addSnack(f)
  }
  const ordered = strategy === 'usual'
    ? rankHabit(snackPool, staples)
    : rankByDensity(snackPool, staples, 'kcal')
  let adds = 0
  guard = 0
  while (kcal < target - DAY_KCAL_TOL && ordered.length > 0 && guard < 100) {
    guard += 1
    const idx = adds % ordered.length
    const rotation = [...ordered.slice(idx), ...ordered.slice(0, idx)]
    const f = rotation.find(x => kcal + x.kcal <= dayCeil)
    if (!f) break
    addSnack(f)
    adds += 1
  }
  return meals
}

export function draftDay(trip, dayIndex, library, staples, strategy = 'usual') {
  return buildDraft(trip, dayIndex, library, staples, strategy, adjacentMains(trip, dayIndex))
}

export function draftEmptyDays(trip, library, staples, strategy = 'usual') {
  const out = []
  let prevMain = null
  trip.days.forEach((day, dayIndex) => {
    const existingMain = day.meals?.dinner?.[0]?.foodId
    if (dayTotals(day, library).kcal > 0) {
      prevMain = existingMain ?? prevMain
      return
    }
    const avoid = new Set(adjacentMains(trip, dayIndex))
    if (prevMain) avoid.add(prevMain)
    // Rotate the starting point through the ranked mains so a week cycles
    // them instead of alternating between the top two.
    const mains = strategy === 'usual'
      ? rankHabit(dinnerMains(library, staples, true), staples)
      : rankByDensity(dinnerMains(library), staples, 'kcal')
    const rotated = mains.length
      ? [...mains.slice(out.length % mains.length), ...mains.slice(0, out.length % mains.length)]
      : null
    const meals = buildDraft(trip, dayIndex, library, staples, strategy, avoid, rotated)
    out.push({ dayIndex, meals })
    prevMain = meals.dinner[0]?.foodId ?? prevMain
  })
  return out
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
    if (f.prep !== undefined && f.prep !== 'ready' && f.prep !== 'cook') {
      return { ok: false, error: `Food "${f.name}" has an invalid prep value.` }
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

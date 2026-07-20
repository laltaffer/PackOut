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
  const proteinShortG = rawProteinShort > EPS ? Math.ceil(rawProteinShort) : 0
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

// Readiness: every Day Fueled (heavy is a warning, not a blocker) and every
// planned item Packed. Blockers are named, not counted.
export function readiness(trip, library) {
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
  return {
    ready: verdict.fueled && unpacked.length === 0 && totalItems > 0,
    fueled: verdict.fueled,
    shortDays: verdict.shortDays,
    heavyDays: verdict.heavyDays,
    totalItems,
    packedItems,
    unpacked,
  }
}

// Backup import validation. Returns {ok:true} or {ok:false, error} — never
// throws. Deep on purpose: an accepted import replaces the whole state, so
// anything that could crash a render or reach the DOM as a non-number is
// rejected here, and the state is never assigned.
const INTENSITIES = ['easy', 'medium', 'hard']
const MEAL_KEYS = ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snacks']

function num(v) { return typeof v === 'number' && Number.isFinite(v) }
function numOrNull(v) { return v === null || num(v) }

function validEntries(entries) {
  return Array.isArray(entries) && entries.every(e =>
    e && typeof e.foodId === 'string' && num(e.qty) && e.qty >= 1)
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
    if (!Object.values(day.packed).every(num)) return false
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
    if (!t?.id || typeof t.id !== 'string' || tripIds.has(t.id)) return { ok: false, error: 'Trip ids must be unique strings.' }
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
    if (!f?.id || typeof f.id !== 'string' || foodIds.has(f.id)) return { ok: false, error: 'Food ids must be unique strings.' }
    foodIds.add(f.id)
    if (!f.name?.trim?.() || !num(f.kcal) || f.kcal <= 0) return { ok: false, error: `Food "${f.name ?? '?'}" is malformed.` }
    if (![f.carbsG, f.fatG, f.proteinG, f.weightOz].every(numOrNull)) {
      return { ok: false, error: `Food "${f.name}" has non-numeric macros.` }
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

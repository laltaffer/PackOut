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
    if (f.weightOz === null) t.missingWeightCount += 1
    else t.weightOz += f.weightOz * qty
  }
  t.weightOz = Math.round(t.weightOz * 100) / 100
  t.calsPerOz = t.weightOz > 0 ? Math.round(t.kcal / t.weightOz) : null
  return t
}

export function dayTotals(day, library) {
  const meals = day.meals ?? emptyMeals()
  const flat = [
    ...meals.electrolytes, ...meals.breakfast, ...meals.lunch, ...meals.dinner,
    ...meals.snacks.flatMap(s => s.items),
  ]
  return sumEntries(flat, library)
}

// Verdict thresholds (SPEC): Fueled = ≥90% kcal target AND protein ≥ floor;
// Heavy = >115% kcal (soft warning); Short otherwise, with the concrete gap.
const FUELED_KCAL_PCT = 0.90
const HEAVY_KCAL_PCT = 1.15

export function dayVerdict(day, weightLbs, library) {
  const targets = dailyTargets(weightLbs, day.intensity)
  const totals = dayTotals(day, library)
  const kcalFloor = FUELED_KCAL_PCT * targets.kcal.target
  const kcalCeil = HEAVY_KCAL_PCT * targets.kcal.target
  const kcalShort = Math.max(0, Math.round(kcalFloor - totals.kcal))
  const proteinShortG = Math.max(0, Math.round(targets.proteinG.floor - totals.proteinG))
  const kcalOver = Math.max(0, Math.round(totals.kcal - kcalCeil))
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
      const meals = day.meals ?? emptyMeals()
      const ids = new Set([
        ...meals.electrolytes, ...meals.breakfast, ...meals.lunch, ...meals.dinner,
        ...meals.snacks.flatMap(s => s.items),
      ].map(e => e.foodId))
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

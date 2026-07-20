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

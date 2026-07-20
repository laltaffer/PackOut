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

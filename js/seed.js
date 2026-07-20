// Seed food library. Sources, in order of authority:
//   1. Lawrence's V2P sheet (reference/v2p-nutrition-sheet-export.md) — verbatim
//      values, blanks stay null (never invented).
//   2. Published Peak Refuel nutrition facts (reference/alaska-food-order.md) for
//      ordered meals the sheet doesn't cover.
// v2 (2026-07-19, dogfood feedback): every food carries its brand name; generic
// commodity items removed. weightOz is packed ounces where known, else null.

export const SEED = {
  version: 2,
  foods: [
    // Electrolytes / fluids
    { id: 'liquid-iv-white-peach', name: 'Liquid IV White Peach', kcal: 15, carbsG: 5, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    { id: 'liquid-iv-energy', name: 'Liquid IV Energy', kcal: 45, carbsG: 10, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    { id: 'tailwind-wilderness-athlete', name: 'Tailwind / Wilderness Athlete', kcal: 200, carbsG: 50, fatG: 0, proteinG: 0, weightOz: 1.7, slotHint: 'electrolytes' },

    // Breakfast
    { id: 'peak-strawberry-granola', name: 'Peak Refuel Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: null, slotHint: 'breakfast' },
    { id: 'justins-honey-pb', name: "Justin's Honey Peanut Butter", kcal: 210, carbsG: 6, fatG: 17, proteinG: 7, weightOz: null, slotHint: 'breakfast' },

    // Mains (lunch/dinner)
    { id: 'peak-homestyle-chicken-rice', name: 'Peak Refuel Homestyle Chicken & Rice', kcal: 740, carbsG: 61, fatG: null, proteinG: 40, weightOz: null, slotHint: 'dinner' },
    { id: 'peak-beef-stroganoff', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, slotHint: 'dinner' },
    { id: 'peak-chicken-coconut-curry', name: 'Peak Refuel Chicken Coconut Curry', kcal: 850, carbsG: 66, fatG: 44, proteinG: 44, weightOz: 5.36, slotHint: 'dinner' },
    { id: 'peak-beef-pasta-marinara', name: 'Peak Refuel Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, slotHint: 'dinner' },
    { id: 'peak-chicken-pesto-pasta', name: 'Peak Refuel Chicken Pesto Pasta', kcal: 920, carbsG: 42, fatG: 64, proteinG: 43, weightOz: 5.71, slotHint: 'dinner' },
    { id: 'mh-chicken-fajita-bowl-2svg', name: 'Mountain House Chicken Fajita Bowl (2 svg)', kcal: 560, carbsG: 50, fatG: 22, proteinG: 40, weightOz: 4.2, slotHint: 'dinner' },
    { id: 'cheez-it-pack', name: 'Cheez-It (1 pack)', kcal: 140, carbsG: 16, fatG: 7, proteinG: 3, weightOz: 1.0, slotHint: 'lunch' },
    { id: 'toasty-chee', name: 'Lance ToastChee', kcal: 220, carbsG: 25, fatG: 10, proteinG: 5, weightOz: null, slotHint: 'lunch' },
    { id: 'alpine-spiced-apple-cider', name: 'Alpine Spiced Apple Cider', kcal: 60, carbsG: 15, fatG: 0, proteinG: 0, weightOz: 0.5, slotHint: 'dinner' },

    // Snacks
    { id: 'pro-bolt-chews', name: 'ProBar Bolt Chews', kcal: 90, carbsG: 23, fatG: null, proteinG: null, weightOz: null, slotHint: 'snack' },
    { id: 'probar-peanut-butter', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: null, slotHint: 'snack' },
    { id: 'probar-blueberry-muffin', name: 'ProBar Blueberry Muffin', kcal: 400, carbsG: 44, fatG: null, proteinG: 10, weightOz: null, slotHint: 'snack' },
    { id: 'gu-energy-gel', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: null, slotHint: 'snack' },
    { id: 'honey-stinger-waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: null, proteinG: 1, weightOz: null, slotHint: 'snack' },
    { id: 'packaroon', name: 'Packaroon', kcal: 160, carbsG: 12, fatG: 12, proteinG: 2, weightOz: null, slotHint: 'snack' },
    { id: 'belvita', name: 'Belvita', kcal: 220, carbsG: 36, fatG: 8, proteinG: 3, weightOz: 1.9, slotHint: 'snack' },
    { id: 'austin-pb-crackers', name: 'Austin Peanut Butter Crackers', kcal: 200, carbsG: 27, fatG: 10, proteinG: 3, weightOz: 1.3, slotHint: 'snack' },
    { id: 'powerbar', name: 'PowerBar', kcal: 230, carbsG: 44, fatG: 4, proteinG: 10, weightOz: 2.2, slotHint: 'snack' },
    { id: 'fritos-2svg', name: 'Fritos (2 svg)', kcal: 320, carbsG: 32, fatG: 20, proteinG: 4, weightOz: 2.0, slotHint: 'snack' },
  ],
}

// v1 → v2 renames: applied only when the stored name is still the v1 seed name,
// so user renames always win.
const RENAMES_V2 = {
  'peak-strawberry-granola': { from: 'Peak Strawberry Granola', to: 'Peak Refuel Strawberry Granola' },
  'peak-homestyle-chicken-rice': { from: 'Peak Homestyle Chicken & Rice', to: 'Peak Refuel Homestyle Chicken & Rice' },
  'peak-beef-stroganoff': { from: 'Peak Beef Stroganoff', to: 'Peak Refuel Beef Stroganoff' },
  'peak-chicken-coconut-curry': { from: 'Peak Chicken Coconut Curry', to: 'Peak Refuel Chicken Coconut Curry' },
  'peak-beef-pasta-marinara': { from: 'Peak Beef Pasta Marinara', to: 'Peak Refuel Beef Pasta Marinara' },
  'peak-chicken-pesto-pasta': { from: 'Peak Chicken Pesto Pasta', to: 'Peak Refuel Chicken Pesto Pasta' },
  'mh-chicken-fajita-bowl-2svg': { from: 'MH Chicken Fajita Bowl (2 svg)', to: 'Mountain House Chicken Fajita Bowl (2 svg)' },
  'pro-bolt-chews': { from: 'Pro Bolt Chews', to: 'ProBar Bolt Chews' },
  'powerbar': { from: 'Powerbar', to: 'PowerBar' },
  'toasty-chee': { from: 'Toasty Chee', to: 'Lance ToastChee' },
}

// v1 generics: removed by the v2 migration unless some day still references them.
const KILLED_V2 = [
  'instant-oats-2pkg', 'dry-fruit', 'protein-powder', 'tortillas-2', 'salami-2oz',
  'choc-chip-cookies-5', 'gummy-bears-2svg', 'pb-pretzels-2h', 'trail-mix-1svg',
  'diy-no-bake-bar', 'dry-cereal-banana', 'almond-butter', 'rosemary-turkey-stick',
  'landjaeger-sticks',
]

export function applySeedMigrations(state) {
  const from = state.seedVersion ?? 1
  if (from >= SEED.version) return state
  if (from < 2) {
    const referenced = new Set()
    for (const trip of state.trips) {
      for (const day of trip.days) {
        const m = day.meals
        if (!m) continue
        for (const k of ['electrolytes', 'breakfast', 'lunch', 'dinner']) {
          for (const e of m[k]) referenced.add(e.foodId)
        }
        for (const s of m.snacks) for (const e of s.items) referenced.add(e.foodId)
      }
    }
    for (const f of state.library) {
      const r = RENAMES_V2[f.id]
      if (r && f.name === r.from) f.name = r.to
    }
    state.library = state.library.filter(f => !(KILLED_V2.includes(f.id) && !referenced.has(f.id)))
  }
  state.seedVersion = SEED.version
  return state
}

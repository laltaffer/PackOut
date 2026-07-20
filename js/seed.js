// Seed food library. Sources, in order of authority:
//   1. Lawrence's V2P sheet (reference/v2p-nutrition-sheet-export.md) — verbatim,
//      blanks stay null (never invented).
//   2. Published Peak Refuel nutrition facts (reference/alaska-food-order.md) for
//      ordered meals the sheet doesn't cover.
// weightOz is packed weight in ounces where known, else null.

export const SEED = {
  version: 1,
  foods: [
    // Electrolytes / fluids
    { id: 'liquid-iv-white-peach', name: 'Liquid IV White Peach', kcal: 15, carbsG: 5, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    { id: 'liquid-iv-energy', name: 'Liquid IV Energy', kcal: 45, carbsG: 10, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    { id: 'tailwind-wilderness-athlete', name: 'Tailwind / Wilderness Athlete', kcal: 200, carbsG: 50, fatG: 0, proteinG: 0, weightOz: 1.7, slotHint: 'electrolytes' },

    // Breakfast
    { id: 'peak-strawberry-granola', name: 'Peak Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: null, slotHint: 'breakfast' },
    { id: 'justins-honey-pb', name: "Justin's Honey Peanut Butter", kcal: 210, carbsG: 6, fatG: 17, proteinG: 7, weightOz: null, slotHint: 'breakfast' },
    { id: 'instant-oats-2pkg', name: 'Instant oats (2 packages)', kcal: 320, carbsG: 64, fatG: 5, proteinG: 8, weightOz: 3.0, slotHint: 'breakfast' },
    { id: 'dry-fruit', name: 'Dry fruit (raisins, etc.)', kcal: 60, carbsG: 16, fatG: 0, proteinG: 1, weightOz: 1.0, slotHint: 'breakfast' },
    { id: 'protein-powder', name: 'Protein powder', kcal: 120, carbsG: 4, fatG: 1, proteinG: 24, weightOz: 1.1, slotHint: 'breakfast' },

    // Mains (lunch/dinner)
    { id: 'peak-homestyle-chicken-rice', name: 'Peak Homestyle Chicken & Rice', kcal: 740, carbsG: 61, fatG: null, proteinG: 40, weightOz: null, slotHint: 'dinner' },
    { id: 'peak-beef-stroganoff', name: 'Peak Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, slotHint: 'dinner' },
    { id: 'peak-chicken-coconut-curry', name: 'Peak Chicken Coconut Curry', kcal: 850, carbsG: 66, fatG: 44, proteinG: 44, weightOz: 5.36, slotHint: 'dinner' },
    { id: 'peak-beef-pasta-marinara', name: 'Peak Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, slotHint: 'dinner' },
    { id: 'peak-chicken-pesto-pasta', name: 'Peak Chicken Pesto Pasta', kcal: 920, carbsG: 42, fatG: 64, proteinG: 43, weightOz: 5.71, slotHint: 'dinner' },
    { id: 'mh-chicken-fajita-bowl-2svg', name: 'MH Chicken Fajita Bowl (2 svg)', kcal: 560, carbsG: 50, fatG: 22, proteinG: 40, weightOz: 4.2, slotHint: 'dinner' },
    { id: 'tortillas-2', name: 'Tortillas (2)', kcal: 280, carbsG: 48, fatG: 6, proteinG: 8, weightOz: 3.5, slotHint: 'lunch' },
    { id: 'salami-2oz', name: 'Salami (2 oz)', kcal: 190, carbsG: 0, fatG: 15, proteinG: 12, weightOz: 2.0, slotHint: 'lunch' },
    { id: 'cheez-it-pack', name: 'Cheez-It (1 pack)', kcal: 140, carbsG: 16, fatG: 7, proteinG: 3, weightOz: 1.0, slotHint: 'lunch' },
    { id: 'toasty-chee', name: 'Toasty Chee', kcal: 220, carbsG: 25, fatG: 10, proteinG: 5, weightOz: null, slotHint: 'lunch' },
    { id: 'alpine-spiced-apple-cider', name: 'Alpine Spiced Apple Cider', kcal: 60, carbsG: 15, fatG: 0, proteinG: 0, weightOz: 0.5, slotHint: 'dinner' },
    { id: 'choc-chip-cookies-5', name: 'Chocolate chip cookies (5)', kcal: 250, carbsG: 33, fatG: 11, proteinG: 2.5, weightOz: 1.9, slotHint: 'dinner' },

    // Snacks
    { id: 'pro-bolt-chews', name: 'Pro Bolt Chews', kcal: 90, carbsG: 23, fatG: null, proteinG: null, weightOz: null, slotHint: 'snack' },
    { id: 'gummy-bears-2svg', name: 'Gummy Bears (2 svg)', kcal: 300, carbsG: 69, fatG: 0, proteinG: 6, weightOz: 3.0, slotHint: 'snack' },
    { id: 'probar-peanut-butter', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: null, slotHint: 'snack' },
    { id: 'probar-blueberry-muffin', name: 'ProBar Blueberry Muffin', kcal: 400, carbsG: 44, fatG: null, proteinG: 10, weightOz: null, slotHint: 'snack' },
    { id: 'rosemary-turkey-stick', name: 'Rosemary Turkey Stick', kcal: 50, carbsG: 1, fatG: null, proteinG: 9, weightOz: null, slotHint: 'snack' },
    { id: 'gu-energy-gel', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: null, slotHint: 'snack' },
    { id: 'honey-stinger-waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: null, proteinG: 1, weightOz: null, slotHint: 'snack' },
    { id: 'packaroon', name: 'Packaroon', kcal: 160, carbsG: 12, fatG: 12, proteinG: 2, weightOz: null, slotHint: 'snack' },
    { id: 'belvita', name: 'Belvita', kcal: 220, carbsG: 36, fatG: 8, proteinG: 3, weightOz: 1.9, slotHint: 'snack' },
    { id: 'almond-butter', name: 'Almond Butter', kcal: 190, carbsG: 7, fatG: 16, proteinG: 7, weightOz: 1.2, slotHint: 'snack' },
    { id: 'pb-pretzels-2h', name: 'PB Pretzels (2 handfuls)', kcal: 300, carbsG: 40, fatG: 12.5, proteinG: 10, weightOz: 2.5, slotHint: 'snack' },
    { id: 'landjaeger-sticks', name: 'Landjaeger sticks', kcal: 420, carbsG: 6, fatG: 33, proteinG: 21, weightOz: 2.5, slotHint: 'snack' },
    { id: 'austin-pb-crackers', name: 'Austin Peanut Butter Crackers', kcal: 200, carbsG: 27, fatG: 10, proteinG: 3, weightOz: 1.3, slotHint: 'snack' },
    { id: 'trail-mix-1svg', name: 'Trail mix (1 svg)', kcal: 390, carbsG: 50, fatG: 10, proteinG: 7, weightOz: 2.5, slotHint: 'snack' },
    { id: 'diy-no-bake-bar', name: 'DIY No Bake Bar', kcal: 450, carbsG: 50, fatG: 20, proteinG: 20, weightOz: 6.0, slotHint: 'snack' },
    { id: 'powerbar', name: 'Powerbar', kcal: 230, carbsG: 44, fatG: 4, proteinG: 10, weightOz: 2.2, slotHint: 'snack' },
    { id: 'fritos-2svg', name: 'Fritos (2 svg)', kcal: 320, carbsG: 32, fatG: 20, proteinG: 4, weightOz: 2.0, slotHint: 'snack' },
    { id: 'dry-cereal-banana', name: 'Dry cereal + dry banana (2 C)', kcal: 240, carbsG: 52, fatG: 2, proteinG: 4, weightOz: 2.2, slotHint: 'snack' },
  ],
}

// Seed food library. Sources, in order of authority:
//   1. Lawrence's V2P sheet (reference/v2p-nutrition-sheet-export.md) — verbatim
//      values, blanks stay null (never invented).
//   2. Published Peak Refuel nutrition facts (reference/alaska-food-order.md) for
//      ordered meals the sheet doesn't cover.
// v2 (2026-07-19, dogfood feedback): every food carries its brand name; generic
// commodity items removed. weightOz is packed ounces where known, else null.

// favorite: true marks the meals from Lawrence's Guidefitter order
// (reference/alaska-food-order.md) — his core meals, pre-starred so a fresh
// state drafts from them with zero setup.
export const SEED = {
  version: 9,
  foods: [
    // Electrolytes / fluids
    { id: 'liquid-iv-white-peach', name: 'Liquid IV White Peach', kcal: 15, carbsG: 5, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    { id: 'liquid-iv-energy', name: 'Liquid IV Energy', kcal: 45, carbsG: 10, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    // Skratch Labs label (SVG panel, 2026-07-20): 1 scoop = 22g serving
    { id: 'skratch-hydration-mix', name: 'Skratch Labs Sport Hydration Mix (scoop)', kcal: 80, carbsG: 19, fatG: 0, proteinG: 0, weightOz: 0.78, slotHint: 'electrolytes' },

    // Breakfast
    { id: 'peak-strawberry-granola', name: 'Peak Refuel Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: null, slotHint: 'breakfast', favorite: true },
    { id: 'justins-honey-pb', name: "Justin's Honey Peanut Butter", kcal: 210, carbsG: 6, fatG: 17, proteinG: 7, weightOz: null, slotHint: 'breakfast' },

    // Mains (lunch/dinner)
    { id: 'peak-homestyle-chicken-rice', name: 'Peak Refuel Homestyle Chicken & Rice', kcal: 740, carbsG: 61, fatG: null, proteinG: 40, weightOz: null, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-beef-stroganoff', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-chicken-coconut-curry', name: 'Peak Refuel Chicken Coconut Curry', kcal: 850, carbsG: 66, fatG: 44, proteinG: 44, weightOz: 5.36, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-beef-pasta-marinara', name: 'Peak Refuel Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-chicken-pesto-pasta', name: 'Peak Refuel Chicken Pesto Pasta', kcal: 920, carbsG: 42, fatG: 64, proteinG: 43, weightOz: 5.71, slotHint: 'dinner', prep: 'cook', favorite: true },

    // Peak Refuel meals catalog (reference/peak-refuel-catalog.md, label values)
    { id: 'peak-chicken-alfredo', name: 'Peak Refuel Chicken Alfredo', kcal: 830, carbsG: 46, fatG: 46, proteinG: 48, weightOz: 4.93, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-breakfast-skillet', name: 'Peak Refuel Breakfast Skillet', kcal: 540, carbsG: 36, fatG: 31, proteinG: 31, weightOz: 3.88, slotHint: 'breakfast', prep: 'cook' },
    { id: 'peak-chicken-teriyaki-rice', name: 'Peak Refuel Chicken Teriyaki Rice', kcal: 580, carbsG: 78, fatG: 8, proteinG: 40, weightOz: 4.66, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-sweet-pork-rice', name: 'Peak Refuel Sweet Pork & Rice', kcal: 800, carbsG: 125, fatG: 17, proteinG: 40, weightOz: 6.07, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-white-chicken-chili', name: 'Peak Refuel White Chicken Chili', kcal: 760, carbsG: 53, fatG: 44, proteinG: 41, weightOz: 4.94, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-venison-casserole', name: 'Peak Refuel Venison Country Casserole', kcal: 920, carbsG: 69, fatG: 57, proteinG: 40, weightOz: 6.20, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-bison-bowl', name: 'Peak Refuel Backcountry Bison Bowl', kcal: 930, carbsG: 106, fatG: 40, proteinG: 42, weightOz: 7.05, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-buffalo-goulash', name: 'Peak Refuel MeatEater Buffalo Goulash', kcal: 890, carbsG: 79, fatG: 40, proteinG: 55, weightOz: 4.94, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-three-bean-chili-mac', name: 'Peak Refuel Three Bean Chili Mac', kcal: 610, carbsG: 119, fatG: 3.5, proteinG: 30, weightOz: 4.79, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-mountain-berry-granola', name: 'Peak Refuel Mountain Berry Granola', kcal: 570, carbsG: 108, fatG: 1.5, proteinG: 13, weightOz: 5.07, slotHint: 'breakfast' },
    { id: 'peak-butternut-dal-bhat', name: 'Peak Refuel Butternut Dal Bhat', kcal: 870, carbsG: 105, fatG: 43, proteinG: 23, weightOz: 5.85, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-biscuits-gravy', name: 'Peak Refuel Biscuits & Sausage Gravy', kcal: 1100, carbsG: 51, fatG: 85, proteinG: 34, weightOz: 6.77, slotHint: 'breakfast', prep: 'cook' },
    { id: 'peak-peaches-oats', name: 'Peak Refuel Creamy Peaches and Oats', kcal: 1010, carbsG: 128, fatG: 42, proteinG: 30, weightOz: 7.05, slotHint: 'breakfast', prep: 'cook' },
    { id: 'peak-bison-ranch-mashers', name: 'Peak Refuel Bison Ranch Mashers', kcal: 1120, carbsG: 94, fatG: 66, proteinG: 40, weightOz: 7.40, slotHint: 'dinner', prep: 'cook' },

    // Snacks
    { id: 'pro-bolt-chews', name: 'ProBar Bolt Chews', kcal: 90, carbsG: 23, fatG: null, proteinG: null, weightOz: null, slotHint: 'snack' },
    { id: 'probar-peanut-butter', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: null, slotHint: 'snack' },
    { id: 'probar-blueberry-muffin', name: 'ProBar Blueberry Muffin', kcal: 400, carbsG: 44, fatG: null, proteinG: 10, weightOz: null, slotHint: 'snack' },
    { id: 'gu-energy-gel', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: null, slotHint: 'snack' },
    { id: 'honey-stinger-waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: null, proteinG: 1, weightOz: null, slotHint: 'snack' },
    { id: 'packaroon', name: 'Packaroon', kcal: 160, carbsG: 12, fatG: 12, proteinG: 2, weightOz: null, slotHint: 'snack' },
    // Skratch Labs (label image, 2026-07-20): 80 kcal/25g serving, 2 servings/packet
    { id: 'skratch-energy-chews', name: 'Skratch Labs Energy Chews (packet)', kcal: 160, carbsG: 38, fatG: 0, proteinG: 0, weightOz: 1.76, slotHint: 'snack' },
    // haribo.com table: 100 kcal / 23g C / 2g P per 30g serving, normalized to
    // a 1 oz unit (Lawrence: track gummies by weight, not pieces) — qty = oz
    { id: 'haribo-goldbears-oz', name: 'Haribo Goldbears (per oz)', kcal: 95, carbsG: 22, fatG: 0, proteinG: 2, weightOz: 1, slotHint: 'snack' },
  ],
}

// Gear library seed — verbatim from Lawrence's Montana hunt sheet
// (reference/montana-gear-sheet-export.md). Weights were unfilled in the sheet;
// they stay null until weighed. name = the sheet's item (brand/model) when
// present, else its slot label.
export const GEAR_SEED = {
  version: 1,
  items: [
    { id: 'pack-maduece', name: 'MaDuece', category: 'Pack', weightOz: null },
    { id: 'trekking-poles', name: 'Alpine Carbon Cork Trekking Poles', category: 'Pack', weightOz: null },
    { id: 'tent', name: 'Kifaru SuperTarp with annex', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'stakes', name: '12 DAC V-Best stakes', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'ground-tarp', name: 'Tyvek ground tarp', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'sleeping-pad', name: 'Thermarest Neo Air X-Lite', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'sleeping-bag', name: 'Western Mountaineering TerraLite 25deg', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'stuff-sack-tent', name: 'Stuff sack (tent)', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'stuff-sack-bag', name: 'Stuff sack (sleeping bag)', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'pillow', name: 'Exped Mega Pillow', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'water-purification', name: 'SteriPen', category: 'Water', weightOz: null },
    { id: 'water-container', name: 'Platypus bladder + spare', category: 'Water', weightOz: null },
    { id: 'water-filter', name: 'BeFree Filter', category: 'Water', weightOz: null },
    { id: 'fuel', name: 'Stove fuel', category: 'Food kit', weightOz: null },
    { id: 'stove', name: 'MSR Reactor', category: 'Food kit', weightOz: null },
    { id: 'cook-pot', name: 'Reactor 1.5L pot', category: 'Food kit', weightOz: null },
    { id: 'utensils', name: 'Titanium spork', category: 'Food kit', weightOz: null },
    { id: 'bow', name: 'Mathews Lift', category: 'Weapon', weightOz: null },
    { id: 'release', name: 'Carter Like Mike release', category: 'Weapon', weightOz: null },
    { id: 'arrows', name: 'RIP TKO arrows', category: 'Weapon', weightOz: null },
    { id: 'broadheads', name: 'Ironwill + Sevr broadheads', category: 'Weapon', weightOz: null },
    { id: 'weapon-repair-kit', name: 'Weapon repair kit', category: 'Weapon', weightOz: null },
    { id: 'binoculars', name: 'Swaro NL Pure 10x42', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'bino-pouch', name: 'Marsupial Harness', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'spotting-scope', name: 'Swaro 65mm spotter', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'tripod', name: 'Slik tripod', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'license', name: 'License (digital)', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'wind-check', name: 'Milkweed pods (wind check)', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'range-finder', name: 'Leupold range finder', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'range-finder-battery', name: 'Range finder battery (spare)', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'sat-comm', name: 'Zoleo satellite communicator', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'knife-1', name: 'ESEE AGK', category: 'Kill kit', weightOz: null },
    { id: 'knife-2', name: 'IronWill knife', category: 'Kill kit', weightOz: null },
    { id: 'kill-kit-misc', name: 'Zip ties, gloves, sharpener, brillo pad', category: 'Kill kit', weightOz: null },
    { id: 'game-bags', name: 'Kifaru Elk Bag kit', category: 'Kill kit', weightOz: null },
    { id: 'pepper', name: 'Pepper', category: 'Kill kit', weightOz: null },
    { id: 'first-aid-kit', name: 'First aid kit (orange organizer)', category: 'First aid & Safety', weightOz: null },
    { id: 'tourniquets', name: 'Tourniquet x2', category: 'First aid & Safety', weightOz: null },
    { id: 'trauma-kit', name: 'Trauma kit (chest seal + QuikClot)', category: 'First aid & Safety', weightOz: null },
    { id: 'chapstick', name: 'Chapstick', category: 'First aid & Safety', weightOz: null },
    { id: 'lighter', name: 'Lighter', category: 'First aid & Safety', weightOz: null },
    { id: 'extra-batteries', name: 'Extra batteries', category: 'First aid & Safety', weightOz: null },
    { id: 'p-cord', name: 'P-cord', category: 'First aid & Safety', weightOz: null },
    { id: 'spare-dry-sack', name: 'Spare dry sack', category: 'First aid & Safety', weightOz: null },
    { id: 'headlamp-1', name: 'Headlamp 1', category: 'First aid & Safety', weightOz: null },
    { id: 'headlamp-2', name: 'Headlamp 2', category: 'First aid & Safety', weightOz: null },
    { id: 'toothbrush', name: 'Toothbrush', category: 'First aid & Safety', weightOz: null },
    { id: 'toothpaste', name: 'Toothpaste', category: 'First aid & Safety', weightOz: null },
    { id: 'tp-trowel', name: 'TP + trowel', category: 'First aid & Safety', weightOz: null },
    { id: 'power-packs', name: 'Power pack x2 (Nightforce + Goal Zero)', category: 'First aid & Safety', weightOz: null },
    { id: 'phone-cable', name: 'Phone charging cable', category: 'First aid & Safety', weightOz: null },
    { id: 'zoleo-cable', name: 'Zoleo charging cable', category: 'First aid & Safety', weightOz: null },
    { id: 'glock-mags', name: 'Glock 10mm x2 magazines', category: 'First aid & Safety', weightOz: null },
    { id: 'ammo-10mm', name: '10mm ammo', category: 'First aid & Safety', weightOz: null },
    { id: 'top-wicking', name: 'Sitka Subalpine lightweight top w/ bug guard', category: 'Clothing worn', weightOz: null },
    { id: 'bottoms-outer', name: 'Sitka pants', category: 'Clothing worn', weightOz: null },
    { id: 'underwear-worn', name: 'MeUndies long', category: 'Clothing worn', weightOz: null },
    { id: 'boots', name: 'Crispi Laponia', category: 'Clothing worn', weightOz: null },
    { id: 'socks-hiking', name: 'Darn Tough socks', category: 'Clothing worn', weightOz: null },
    { id: 'watch', name: 'Apple Watch Ultra 2', category: 'Clothing worn', weightOz: null },
    { id: 'hat-hiking', name: 'Hat (hiking)', category: 'Clothing worn', weightOz: null },
    { id: 'socks-backup', name: 'Darn Tough socks x6 (backup)', category: 'Clothing packed', weightOz: null },
    { id: 'underwear-packed', name: 'MeUndies x4', category: 'Clothing packed', weightOz: null },
    { id: 'puff-pants', name: 'Sitka Down pants', category: 'Clothing packed', weightOz: null },
    { id: 'puffer-top', name: 'Sitka WP Puff', category: 'Clothing packed', weightOz: null },
    { id: 'rain-top', name: 'Sitka rain top', category: 'Clothing packed', weightOz: null },
    { id: 'rain-bottom', name: 'Sitka rain pant', category: 'Clothing packed', weightOz: null },
    { id: 'mid-insulated-top', name: 'Sitka Fanatic Hoodie', category: 'Clothing packed', weightOz: null },
    { id: 'alt-mid-top', name: 'Sitka Subalpine Hoodie', category: 'Clothing packed', weightOz: null },
    { id: 'windproof-vest', name: 'Sitka vest', category: 'Clothing packed', weightOz: null },
    { id: 'mittens', name: 'First Lite down mittens', category: 'Clothing packed', weightOz: null },
    { id: 'rain-gloves', name: 'Sitka Decoy gloves', category: 'Clothing packed', weightOz: null },
    { id: 'light-gloves', name: 'REI wool light gloves', category: 'Clothing packed', weightOz: null },
    { id: 'butt-pad', name: 'Thermarest Z-rest butt pad', category: 'Luxuries', weightOz: null },
    { id: 'camp-chair', name: 'Zero Chair', category: 'Luxuries', weightOz: null },
    { id: 'lens-kit', name: 'Lens cleaning kit', category: 'Luxuries', weightOz: null },
    { id: 'headphones', name: 'AirPods', category: 'Luxuries', weightOz: null },
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
  if (from >= SEED.version) return sweepRetired(state)
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
  if (from < 3) {
    // Cheez-It is "at best a snack" (Lawrence) — flip the hint unless the
    // user already re-hinted it themselves.
    const c = state.library.find(f => f.id === 'cheez-it-pack')
    if (c && c.slotHint === 'lunch') c.slotHint = 'snack'
  }
  if (from < 4) {
    // Only foods Lawrence actually uses (2026-07-20): drop the V2P sample-tab
    // items — unless a day still references them.
    const KILLED_V4 = ['tailwind-wilderness-athlete', 'mh-chicken-fajita-bowl-2svg',
      'cheez-it-pack', 'alpine-spiced-apple-cider', 'belvita', 'austin-pb-crackers',
      'powerbar', 'fritos-2svg']
    const referenced = new Set()
    for (const trip of state.trips) {
      for (const day of trip.days) {
        const m = day.meals
        if (!m) continue
        for (const k of ['electrolytes', 'breakfast', 'lunch', 'dinner']) {
          for (const e of m[k]) referenced.add(e.foodId)
        }
        for (const sn of m.snacks) for (const e of sn.items) referenced.add(e.foodId)
      }
    }
    state.library = state.library.filter(f => !(KILLED_V4.includes(f.id) && !referenced.has(f.id)))
  }
  if (from < 5) {
    // Additive: the Peak Refuel catalog scrape (2026-07-20). Only the 14 new
    // catalog ids are added — never resurrects foods the user deleted.
    const ADDED_V5 = ['peak-chicken-alfredo', 'peak-breakfast-skillet', 'peak-chicken-teriyaki-rice',
      'peak-sweet-pork-rice', 'peak-white-chicken-chili', 'peak-venison-casserole', 'peak-bison-bowl',
      'peak-buffalo-goulash', 'peak-three-bean-chili-mac', 'peak-mountain-berry-granola',
      'peak-butternut-dal-bhat', 'peak-biscuits-gravy', 'peak-peaches-oats', 'peak-bison-ranch-mashers']
    const have = new Set(state.library.map(f => f.id))
    for (const f of SEED.foods) {
      if (ADDED_V5.includes(f.id) && !have.has(f.id)) state.library.push({ ...f, favorite: false })
    }
  }
  if (from < 6) {
    // Additive: Skratch Labs Energy Chews (Lawrence's source, 2026-07-20).
    if (!state.library.some(f => f.id === 'skratch-energy-chews')) {
      const f = SEED.foods.find(x => x.id === 'skratch-energy-chews')
      state.library.push({ ...f, favorite: false })
    }
  }
  if (from < 7) {
    // Additive: Skratch hydration mix + Goldbears (Lawrence's sources).
    for (const id of ['skratch-hydration-mix', 'haribo-goldbears-oz']) {
      if (!state.library.some(f => f.id === id)) {
        state.library.push({ ...SEED.foods.find(x => x.id === id), favorite: false })
      }
    }
  }
  if (from < 8) {
    // Stamp prep:'cook' on hot-water meals users already have (only where the
    // field is unset, so user-set values win).
    for (const f of state.library) {
      const seeded = SEED.foods.find(x => x.id === f.id)
      if (seeded?.prep === 'cook' && f.prep === undefined) f.prep = 'cook'
    }
  }
  if (from < 9) {
    // Full reset (Lawrence 2026-07-20: "one wipe of the locally stored memory
    // of the foods … and a fully wipe of the meal plans"). The library
    // rebuilds from seed exactly — this is the one migration allowed to drop
    // user foods and resurrect past deletions — and every planned day is
    // cleared so stale drafts can't keep old items alive. Trips, gear, and
    // gear packing survive; redrafting stays a user action.
    state.library = SEED.foods.map(f => ({ favorite: false, ...f }))
    for (const trip of state.trips) {
      for (const day of trip.days) {
        delete day.meals
        delete day.packed
      }
    }
  }
  return sweepRetired(state, () => { state.seedVersion = SEED.version })
}

// Standing sweep (every load, not version-gated): retired sample-tab items
// disappear once nothing references them — unless the user starred them,
// which is an explicit keep. Never touches user-created foods.
function sweepRetired(state, after) {
  const RETIRED = new Set([
    'instant-oats-2pkg', 'dry-fruit', 'protein-powder', 'tortillas-2', 'salami-2oz',
    'choc-chip-cookies-5', 'gummy-bears-2svg', 'pb-pretzels-2h', 'trail-mix-1svg',
    'diy-no-bake-bar', 'dry-cereal-banana', 'almond-butter', 'rosemary-turkey-stick',
    'landjaeger-sticks', 'tailwind-wilderness-athlete', 'mh-chicken-fajita-bowl-2svg',
    'cheez-it-pack', 'alpine-spiced-apple-cider', 'belvita', 'austin-pb-crackers',
    'powerbar', 'fritos-2svg', 'toasty-chee',
  ])
  const stillReferenced = new Set()
  for (const trip of state.trips) {
    for (const day of trip.days) {
      const m = day.meals
      if (!m) continue
      for (const k of ['electrolytes', 'breakfast', 'lunch', 'dinner']) {
        for (const e of m[k]) stillReferenced.add(e.foodId)
      }
      for (const sn of m.snacks) for (const e of sn.items) stillReferenced.add(e.foodId)
    }
  }
  state.library = state.library.filter(f =>
    !(RETIRED.has(f.id) && !stillReferenced.has(f.id) && f.favorite !== true))
  if (after) after()
  return state
}

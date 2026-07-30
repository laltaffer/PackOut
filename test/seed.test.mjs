import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED, GEAR_SEED, applySeedMigrations, BRANDS, brandOf, applyProfile } from '../js/seed.js'

const SLOTS = ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snack']

test('seed has a version and a non-trivial food list', () => {
  assert.ok(Number.isInteger(SEED.version) && SEED.version >= 9)
  assert.ok(SEED.foods.length >= 15)
})

test('seed contains only foods Lawrence actually uses — no sample-tab items, no ToastChee', () => {
  // Lawrence 2026-07-20: remove everything from the sheet's sample tabs; then
  // ("the redraft still pulled in … Lance ToastChee") ToastChee goes too.
  const removed = ['tailwind-wilderness-athlete', 'mh-chicken-fajita-bowl-2svg',
    'cheez-it-pack', 'alpine-spiced-apple-cider', 'belvita', 'austin-pb-crackers',
    'powerbar', 'fritos-2svg', 'toasty-chee']
  for (const id of removed) {
    assert.ok(!SEED.foods.some(f => f.id === id), `removed item still seeded: ${id}`)
  }
  assert.ok(SEED.foods.some(f => f.id === 'peak-chicken-coconut-curry'), 'ordered meals stay')
})

test('the six ordered Guidefitter foods — and only those — ship pre-starred', () => {
  const ordered = new Set(['peak-strawberry-granola', 'peak-homestyle-chicken-rice',
    'peak-beef-stroganoff', 'peak-chicken-coconut-curry', 'peak-beef-pasta-marinara',
    'peak-chicken-pesto-pasta'])
  for (const f of SEED.foods) {
    assert.equal(f.favorite === true, ordered.has(f.id), `${f.id} favorite=${f.favorite}`)
  }
})

test('every seed food carries a brand name — no generic commodity items', () => {
  // Lawrence 2026-07-19: "everything needs its brand name … kill any generic ones"
  const generic = /^(instant oats|dry fruit|protein powder|tortillas|salami|gummy bears|trail mix|chocolate chip|dry cereal|almond butter|pb pretzels|diy |landjaeger|rosemary turkey)/i
  for (const f of SEED.foods) assert.ok(!generic.test(f.name), `generic item in seed: ${f.name}`)
  assert.ok(SEED.foods.find(f => f.id === 'peak-strawberry-granola').name.startsWith('Peak Refuel '))
})

test('shape migration: legacy snack bundles fold into one flat list, duplicates merge qty', () => {
  const day = {
    intensity: 'medium',
    meals: {
      electrolytes: [], breakfast: [], lunch: [], dinner: [],
      snacks: [
        { items: [{ foodId: 'probar-peanut-butter', qty: 1 }, { foodId: 'gu-energy-gel', qty: 2 }] },
        { items: [{ foodId: 'probar-peanut-butter', qty: 1 }] },
      ],
    },
  }
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, gearSeedVersion: GEAR_SEED.version,
    trips: [{ id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200, days: [day] }],
    library: SEED.foods.map(f => ({ favorite: false, ...f })),
    gearLibrary: [],
  })
  assert.deepEqual(s.trips[0].days[0].meals.snacks, [
    { foodId: 'probar-peanut-butter', qty: 2 },
    { foodId: 'gu-energy-gel', qty: 2 },
  ])
})

// v9 (2026-07-20, Lawrence: "one wipe of the locally stored memory of the
// foods … and a fully wipe … of the meal plans"): every pre-v9 state converges
// to exactly the seed library and loses its planned days. This is the one
// migration allowed to drop user foods, ignore referenced-keep protection, and
// resurrect past deletions.
test('v9 wipe: any older state rebuilds the library from seed and clears every planned day', () => {
  const day = { intensity: 'medium', meals: { electrolytes: [], breakfast: [], lunch: [{ foodId: 'tortillas-2', qty: 1 }], dinner: [], snacks: [{ items: [{ foodId: 'belvita', qty: 2 }] }] }, packed: { belvita: 2 } }
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: 1,
    trips: [{ id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200, days: [day] }],
    library: [
      { id: 'peak-beef-stroganoff', name: 'Strog (my usual)', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner' },
      { id: 'belvita', name: 'Belvita', kcal: 220, slotHint: 'snack' },
      { id: 'tortillas-2', name: 'Tortillas (2)', kcal: 280, slotHint: 'lunch' },
      { id: 'custom-1', name: 'My Special Jerky', kcal: 500, carbsG: 5, fatG: 30, proteinG: 45, weightOz: 4, favorite: true, slotHint: 'snack' },
    ],
  })
  assert.deepEqual(new Set(s.library.map(f => f.id)), new Set(SEED.foods.map(f => f.id)),
    'library is exactly the seed — user foods and referenced sample items included in the wipe')
  const strog = s.library.find(f => f.id === 'peak-beef-stroganoff')
  assert.equal(strog.name, 'Peak Refuel Beef Stroganoff', 'user rename reset by the wipe')
  assert.equal(strog.favorite, true, 'ordered core meals come back starred')
  assert.equal(s.trips.length, 1, 'trips survive')
  assert.equal(s.trips[0].days[0].meals, undefined, 'planned meals wiped')
  assert.equal(s.trips[0].days[0].packed, undefined, 'packed marks wiped')
  assert.equal(s.seedVersion, SEED.version)
})

test('v9 wipe resurrects past deletions on purpose — a fresh start beats old history', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: 8, trips: [],
    library: [], // user had deleted everything, including packaroon
  })
  assert.ok(s.library.some(f => f.id === 'packaroon'), 'seed food restored by the wipe')
  assert.ok(s.library.some(f => f.id === 'haribo-goldbears-oz'))
})

test('v11 is additive: a v9 state gains the FATTY stick and nothing else changes', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: 9, trips: [],
    library: [
      { id: 'peak-beef-stroganoff', name: 'Strog (my usual)', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner' },
      { id: 'custom-1', name: 'My Special Bar', kcal: 500, carbsG: 5, fatG: 30, proteinG: 45, weightOz: 4, favorite: true, slotHint: 'snack' },
    ],
  })
  assert.ok(s.library.some(f => f.id === 'fatty-original-2oz'), 'FATTY stick added')
  assert.equal(s.library.find(f => f.id === 'peak-beef-stroganoff').name, 'Strog (my usual)', 'no wipe — user edits survive an additive migration')
  assert.ok(s.library.some(f => f.id === 'custom-1'), 'user foods survive')
  assert.equal(s.seedVersion, SEED.version)
})

test('v14 fills null macros from labels; user-entered values and honest nulls survive', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: 13, trips: [],
    library: [
      // Untouched null → fills from the label read (46 g fat per pouch).
      { id: 'peak-beef-stroganoff', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner' },
      // User already entered their own fat number — a fill must not clobber it.
      { id: 'honey-stinger-waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: 6, proteinG: 1, weightOz: 1.0, favorite: false, slotHint: 'snack' },
      // Jambalaya has no published panel — the seed itself is null, so it stays null.
      { id: 'stowaway-andouille-shrimp-jambalaya', name: 'Stowaway Gourmet Andouille and Shrimp Jambalaya', kcal: 633, carbsG: null, fatG: null, proteinG: 30, weightOz: 4.51, favorite: false, slotHint: 'dinner' },
      // User food with a null macro — not in the seed, never touched.
      { id: 'custom-1', name: 'My Special Bar', kcal: 500, carbsG: 5, fatG: null, proteinG: 45, weightOz: 4, favorite: true, slotHint: 'snack' },
    ],
  })
  const by = id => s.library.find(f => f.id === id)
  assert.equal(by('peak-beef-stroganoff').fatG, 46)
  assert.equal(by('honey-stinger-waffle').fatG, 6, 'user value wins')
  assert.equal(by('stowaway-andouille-shrimp-jambalaya').carbsG, null)
  assert.equal(by('stowaway-andouille-shrimp-jambalaya').fatG, null)
  assert.equal(by('custom-1').fatG, null)
  assert.equal(s.seedVersion, SEED.version)
})

test('seed v14: every filled macro squares with its label kcal (Atwater sanity)', () => {
  // Per-pouch/per-bar label reads, 2026-07-29: Stroganoff 46 F, Chicken &
  // Rice 37 F, Muffin 20 F, Waffle 7 F, gel and chews 0. Bolt Chews' stated
  // 90 kcal vs C23 is the V2P sheet's own basis — zeros hold at any basis.
  const CHECK = ['peak-beef-stroganoff', 'peak-homestyle-chicken-rice', 'probar-blueberry-muffin', 'honey-stinger-waffle']
  for (const id of CHECK) {
    const f = SEED.foods.find(x => x.id === id)
    assert.ok(f.fatG !== null, `${id} has fat filled`)
    const fromMacros = f.carbsG * 4 + f.proteinG * 4 + f.fatG * 9
    assert.ok(Math.abs(fromMacros - f.kcal) <= f.kcal * 0.1, `${id}: macros imply ${fromMacros} kcal against a stated ${f.kcal}`)
  }
  assert.equal(SEED.foods.find(x => x.id === 'gu-energy-gel').fatG, 0)
  assert.deepEqual(
    [SEED.foods.find(x => x.id === 'pro-bolt-chews').fatG, SEED.foods.find(x => x.id === 'pro-bolt-chews').proteinG],
    [0, 0])
})

test('the short-lived Jack Link\'s entry (v10) retires by sweep on a v10 state; FATTY arrives', () => {
  // v10 shipped for ~an hour on 2026-07-21 before Lawrence picked his brand.
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: 10, trips: [],
    library: [{ id: 'jack-links-original-oz', name: "Jack Link's Original Beef Jerky (per oz)", kcal: 80, carbsG: 8, fatG: 1, proteinG: 10, weightOz: 1, favorite: false, slotHint: 'snack' }],
  })
  assert.ok(!s.library.some(f => f.id === 'jack-links-original-oz'), 'unreferenced Jack Link\'s swept')
  assert.ok(s.library.some(f => f.id === 'fatty-original-2oz'), 'FATTY stick added')
})

test('v11 label values: FATTY Original 2 oz stick, verbatim from the USDA FDC branded label', () => {
  // fdcId 2510113 (Sweetwood Cattle Company): 200 kcal / 2g C / 15g F / 13g P per 56g (2 oz) stick.
  const stick = SEED.foods.find(f => f.id === 'fatty-original-2oz')
  assert.deepEqual(
    [stick.kcal, stick.carbsG, stick.fatG, stick.proteinG, stick.weightOz, stick.slotHint],
    [200, 2, 15, 13, 2, 'snack'])
})

test('v7 seed values: Skratch hydration per scoop, Goldbears normalized per ounce', () => {
  const scoop = SEED.foods.find(f => f.id === 'skratch-hydration-mix')
  assert.deepEqual([scoop.kcal, scoop.carbsG, scoop.weightOz, scoop.slotHint], [80, 19, 0.78, 'electrolytes'])
  const bears = SEED.foods.find(f => f.id === 'haribo-goldbears-oz')
  assert.deepEqual([bears.kcal, bears.carbsG, bears.proteinG, bears.weightOz], [95, 22, 2, 1])
})

test('v5 catalog values survive: label beats page copy', () => {
  const alfredo = SEED.foods.find(f => f.id === 'peak-chicken-alfredo')
  assert.deepEqual(
    { kcal: alfredo.kcal, carbsG: alfredo.carbsG, fatG: alfredo.fatG, proteinG: alfredo.proteinG, weightOz: alfredo.weightOz },
    { kcal: 830, carbsG: 46, fatG: 46, proteinG: 48, weightOz: 4.93 })
  // Goulash: page said 740/45 but the FDA label reads 890/55 — label wins.
  const goulash = SEED.foods.find(f => f.id === 'peak-buffalo-goulash')
  assert.equal(goulash.kcal, 890)
  assert.equal(goulash.proteinG, 55)
})

test('retired sweep is standing: unreferenced sample items vanish even at current version', () => {
  const st = {
    schemaVersion: 1, seedVersion: SEED.version, trips: [],
    library: [
      { id: 'toasty-chee', name: 'Lance ToastChee', kcal: 220, favorite: false },
      { id: 'powerbar', name: 'PowerBar', kcal: 230, favorite: true }, // starred = explicit keep
      { id: 'custom-1', name: 'My Jerky', kcal: 500, favorite: false }, // user-created, untouchable
    ],
  }
  const s = applySeedMigrations(st)
  assert.ok(!s.library.some(f => f.id === 'toasty-chee'), 'retired + unreferenced + unstarred → gone')
  assert.ok(s.library.some(f => f.id === 'powerbar'), 'starred retired item survives')
  assert.ok(s.library.some(f => f.id === 'custom-1'), 'user foods never swept')
})

test('every seed food honors the data contract', () => {
  const ids = new Set()
  for (const f of SEED.foods) {
    assert.ok(f.id && !ids.has(f.id), `duplicate or missing id: ${f.id}`)
    ids.add(f.id)
    assert.ok(f.name.trim().length > 0)
    assert.ok(typeof f.kcal === 'number' && f.kcal > 0, `${f.id} kcal`)
    for (const k of ['carbsG', 'fatG', 'proteinG']) {
      assert.ok(f[k] === null || (typeof f[k] === 'number' && f[k] >= 0), `${f.id} ${k}`)
    }
    assert.ok(f.weightOz === null || (typeof f.weightOz === 'number' && f.weightOz > 0), `${f.id} weightOz`)
    assert.ok(SLOTS.includes(f.slotHint), `${f.id} slotHint ${f.slotHint}`)
  }
})

test('ordered Peak Refuel meals carry their published nutrition', () => {
  const curry = SEED.foods.find(f => f.id === 'peak-chicken-coconut-curry')
  assert.deepEqual(
    { kcal: curry.kcal, carbsG: curry.carbsG, fatG: curry.fatG, proteinG: curry.proteinG, weightOz: curry.weightOz },
    { kcal: 850, carbsG: 66, fatG: 44, proteinG: 44, weightOz: 5.36 },
  )
  const marinara = SEED.foods.find(f => f.id === 'peak-beef-pasta-marinara')
  assert.equal(marinara.kcal, 1040)
  const pesto = SEED.foods.find(f => f.id === 'peak-chicken-pesto-pasta')
  assert.equal(pesto.kcal, 920)
})

test('sheet-recorded staples keep the sheet values verbatim', () => {
  const strog = SEED.foods.find(f => f.id === 'peak-beef-stroganoff')
  assert.equal(strog.kcal, 810)
  // The sheet left fat blank; v14 filled it from the pouch's own Nutrition
  // Facts (46 g per package) — a label beats a blank, never a guess. The
  // never-invented rule lives on where no label exists:
  assert.equal(strog.fatG, 46)
  assert.equal(SEED.foods.find(f => f.id === 'stowaway-andouille-shrimp-jambalaya').fatG, null)
  const granola = SEED.foods.find(f => f.id === 'peak-strawberry-granola')
  assert.deepEqual([granola.kcal, granola.carbsG, granola.fatG, granola.proteinG], [530, 87, 9, 23])
})

// Gear v2 (2026-07-25, Lawrence): 'Pack' becomes 'Backpack'; the trekking
// poles are a luxury, not pack hardware. Every Pack item moves — custom ones
// too — because the gear screen only renders known categories.
test('gear v2: Pack renames to Backpack and the poles move to Luxuries', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, trips: [], library: [],
    gearSeedVersion: 1,
    gearLibrary: [
      { id: 'pack-maduece', name: 'MaDuece', category: 'Pack', weightOz: null },
      { id: 'trekking-poles', name: 'Alpine Carbon Cork Trekking Poles', category: 'Pack', weightOz: null },
      { id: 'custom-1', name: 'My Pack Cover', category: 'Pack', weightOz: 3 },
      { id: 'tent', name: 'Kifaru SuperTarp', category: 'Shelter/Sleeping', weightOz: null },
    ],
  })
  assert.equal(s.gearLibrary.find(g => g.id === 'pack-maduece').category, 'Backpack')
  assert.equal(s.gearLibrary.find(g => g.id === 'custom-1').category, 'Backpack', 'custom Pack items move too')
  assert.equal(s.gearLibrary.find(g => g.id === 'trekking-poles').category, 'Luxuries')
  assert.equal(s.gearLibrary.find(g => g.id === 'tent').category, 'Shelter/Sleeping', 'other categories untouched')
  assert.equal(s.gearSeedVersion, GEAR_SEED.version)
})

// Gear v3 (2026-07-27, Lawrence): 'Food kit' becomes 'Cooking'. In an app whose
// other half plans food, a gear category named for food read as meals.
test('gear v3: Food kit renames to Cooking, custom items included', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, trips: [], library: [],
    gearSeedVersion: 2,
    gearLibrary: [
      { id: 'stove', name: 'MSR Reactor', category: 'Food kit', weightOz: null },
      { id: 'custom-mug', name: 'Ti mug', category: 'Food kit', weightOz: 2 },
      { id: 'tent', name: 'Kifaru SuperTarp', category: 'Shelter/Sleeping', weightOz: null },
    ],
  })
  assert.equal(s.gearLibrary.find(g => g.id === 'stove').category, 'Cooking')
  assert.equal(s.gearLibrary.find(g => g.id === 'custom-mug').category, 'Cooking')
  assert.equal(s.gearLibrary.find(g => g.id === 'tent').category, 'Shelter/Sleeping')
  assert.equal(s.gearSeedVersion, GEAR_SEED.version)
})

test('gear v3: a library that never saw v2 gets both moves in one pass', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, trips: [], library: [],
    gearSeedVersion: 1,
    gearLibrary: [
      { id: 'pack-maduece', name: 'MaDuece', category: 'Pack', weightOz: null },
      { id: 'stove', name: 'MSR Reactor', category: 'Food kit', weightOz: null },
    ],
  })
  assert.equal(s.gearLibrary.find(g => g.id === 'pack-maduece').category, 'Backpack')
  assert.equal(s.gearLibrary.find(g => g.id === 'stove').category, 'Cooking')
})

test('gear v2 runs even when the food seed is already current, and only once', () => {
  const once = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, trips: [], library: [],
    gearSeedVersion: 1,
    gearLibrary: [{ id: 'trekking-poles', name: 'Poles', category: 'Pack', weightOz: null }],
  })
  assert.equal(once.gearLibrary[0].category, 'Luxuries', 'gear migration not gated behind food-seed staleness')
  // A post-migration state where Lawrence moved the poles back stays his way.
  once.gearLibrary[0].category = 'Backpack'
  const twice = applySeedMigrations(once)
  assert.equal(twice.gearLibrary[0].category, 'Backpack', 'version gate makes the move a one-time event')
})

test('seed v13: Chomps joins the snack shelf with its label intact', () => {
  // Lawrence's ask, 2026-07-27. Read off the product page rather than recalled:
  // serving size is 1 stick (33 g), so the panel IS the whole item as packed.
  const f = SEED.foods.find(x => x.id === 'chomps-bbq-beef-stick')
  assert.ok(f, 'the stick is in the seed')
  assert.equal(f.kcal, 100)
  assert.equal(f.carbsG, 0)
  assert.equal(f.fatG, 7)
  assert.equal(f.proteinG, 10)
  assert.equal(f.weightOz, 1.15)
  assert.equal(f.slotHint, 'snack')
  // Atwater sanity: macros must roughly account for the stated calories.
  const fromMacros = f.carbsG * 4 + f.proteinG * 4 + f.fatG * 9
  assert.ok(Math.abs(fromMacros - f.kcal) <= 15, `macros imply ${fromMacros} kcal against a stated ${f.kcal}`)
})

test('seed v13: Chomps is a brand you can star', () => {
  assert.ok(BRANDS.some(b => b.id === 'chomps' && b.kind === 'snack'))
  assert.equal(brandOf('chomps-bbq-beef-stick'), 'chomps')
  // Starring the brand stars the food, which is what makes drafts reach for it.
  const state = { library: SEED.foods.map(f => ({ ...f, favorite: false })), trips: [] }
  applyProfile(state, { weightLbs: 200, brands: ['chomps'], tripTypes: [], mealStyle: null, at: 1 })
  assert.equal(state.library.find(f => f.id === 'chomps-bbq-beef-stick').favorite, true)
})

test('seed v13 migration is additive and respects a deletion', () => {
  const base = () => ({ schemaVersion: 1, trips: [], seedVersion: 12, gearLibrary: [], gearSeedVersion: 3,
    library: SEED.foods.filter(f => !f.id.startsWith('chomps-')).map(f => ({ ...f, favorite: false })) })
  const fresh = base()
  applySeedMigrations(fresh)
  assert.ok(fresh.library.some(f => f.id === 'chomps-bbq-beef-stick'), 'a v12 library gains the stick')
  // Running again must not double it.
  applySeedMigrations(fresh)
  assert.equal(fresh.library.filter(f => f.id === 'chomps-bbq-beef-stick').length, 1)
  // And a user already at v13 who deleted it does not get it back.
  const deleted = { ...base(), seedVersion: 13 }
  applySeedMigrations(deleted)
  assert.equal(deleted.library.some(f => f.id === 'chomps-bbq-beef-stick'), false)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED, applySeedMigrations } from '../js/seed.js'

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
  assert.equal(strog.fatG, null) // sheet leaves fat blank — never invented
  const granola = SEED.foods.find(f => f.id === 'peak-strawberry-granola')
  assert.deepEqual([granola.kcal, granola.carbsG, granola.fatG, granola.proteinG], [530, 87, 9, 23])
})

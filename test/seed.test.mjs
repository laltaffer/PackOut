import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED, applySeedMigrations } from '../js/seed.js'

const SLOTS = ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snack']

test('seed has a version and a non-trivial food list', () => {
  assert.ok(Number.isInteger(SEED.version) && SEED.version >= 2)
  assert.ok(SEED.foods.length >= 20)
})

test('every seed food carries a brand name — no generic commodity items', () => {
  // Lawrence 2026-07-19: "everything needs its brand name … kill any generic ones"
  const generic = /^(instant oats|dry fruit|protein powder|tortillas|salami|gummy bears|trail mix|chocolate chip|dry cereal|almond butter|pb pretzels|diy |landjaeger|rosemary turkey)/i
  for (const f of SEED.foods) assert.ok(!generic.test(f.name), `generic item in seed: ${f.name}`)
  assert.ok(SEED.foods.find(f => f.id === 'peak-strawberry-granola').name.startsWith('Peak Refuel '))
  assert.equal(SEED.foods.find(f => f.id === 'mh-chicken-fajita-bowl-2svg').name, 'Mountain House Chicken Fajita Bowl (2 svg)')
  assert.equal(SEED.foods.find(f => f.id === 'toasty-chee').name, 'Lance ToastChee')
})

function v1State(extra = {}) {
  return {
    schemaVersion: 1,
    seedVersion: 1,
    trips: [],
    library: [
      { id: 'peak-beef-stroganoff', name: 'Peak Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, favorite: false, slotHint: 'dinner' },
      { id: 'gummy-bears-2svg', name: 'Gummy Bears (2 svg)', kcal: 300, carbsG: 69, fatG: 0, proteinG: 6, weightOz: 3.0, favorite: false, slotHint: 'snack' },
      { id: 'tortillas-2', name: 'Tortillas (2)', kcal: 280, carbsG: 48, fatG: 6, proteinG: 8, weightOz: 3.5, favorite: false, slotHint: 'lunch' },
      { id: 'custom-1', name: 'My Special Jerky', kcal: 500, carbsG: 5, fatG: 30, proteinG: 45, weightOz: 4, favorite: true, slotHint: 'snack' },
    ],
    ...extra,
  }
}

test('migration renames untouched seed foods and bumps seedVersion', () => {
  const s = applySeedMigrations(v1State())
  assert.equal(s.library.find(f => f.id === 'peak-beef-stroganoff').name, 'Peak Refuel Beef Stroganoff')
  assert.equal(s.seedVersion, SEED.version)
})

test('migration removes unreferenced generics but keeps referenced ones', () => {
  const trips = [{
    id: 't1', name: 'T', startDate: '2026-08-01', weightLbs: 200,
    days: [{ intensity: 'medium', meals: { electrolytes: [], breakfast: [], lunch: [{ foodId: 'tortillas-2', qty: 1 }], dinner: [], snacks: [] } }],
  }]
  const s = applySeedMigrations(v1State({ trips }))
  assert.ok(!s.library.some(f => f.id === 'gummy-bears-2svg'), 'unreferenced generic should be removed')
  assert.ok(s.library.some(f => f.id === 'tortillas-2'), 'referenced generic must survive')
})

test('migration never touches user renames or custom foods', () => {
  const st = v1State()
  st.library.find(f => f.id === 'peak-beef-stroganoff').name = 'Strog (my usual)'
  const s = applySeedMigrations(st)
  assert.equal(s.library.find(f => f.id === 'peak-beef-stroganoff').name, 'Strog (my usual)')
  assert.ok(s.library.some(f => f.id === 'custom-1'))
})

test('migration is a no-op at current seed version', () => {
  const st = { schemaVersion: 1, seedVersion: SEED.version, trips: [], library: [{ id: 'gummy-bears-2svg', name: 'Gummy Bears (2 svg)', kcal: 300 }] }
  const s = applySeedMigrations(st)
  assert.ok(s.library.some(f => f.id === 'gummy-bears-2svg'), 'no deletions once migrated')
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

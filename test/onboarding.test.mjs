import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateImport } from '../js/engine.js'
import { SEED, GEAR_SEED, GEAR_TEMPLATES, TRIP_TYPES, needsOnboarding, onboardingGear, applyOnboarding } from '../js/seed.js'

const NOW = 1_800_000_000_000

function freshState() {
  return {
    schemaVersion: 1,
    trips: [],
    library: SEED.foods.map(f => ({ favorite: false, ...f })),
    seedVersion: SEED.version,
    gearLibrary: GEAR_SEED.items.map(g => ({ ...g })),
    gearSeedVersion: GEAR_SEED.version,
  }
}

// ---------- trigger ----------

test('onboarding: fresh never-synced state needs it', () => {
  assert.equal(needsOnboarding(freshState()), true)
})

test('onboarding: a state that has synced before never re-runs', () => {
  assert.equal(needsOnboarding({ ...freshState(), updatedAt: NOW }), false)
})

test('onboarding: a completed record suppresses it even without updatedAt', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: [], brands: [], gearIds: null, step: 0, at: NOW })
  assert.equal(needsOnboarding(state), false)
})

// ---------- gear templates ----------

test('templates: every row uses a real category and safe id', () => {
  const cats = new Set(['Backpack', 'Shelter/Sleeping', 'Water', 'Food kit', 'Weapon',
    'Optics/Bino Pouch', 'Kill kit', 'First aid & Safety', 'Fishing'])
  for (const type of TRIP_TYPES) {
    for (const row of GEAR_TEMPLATES[type]) {
      assert.ok(cats.has(row.category), `${row.id} category ${row.category}`)
      assert.match(row.id, /^[A-Za-z0-9_-]{1,64}$/)
    }
  }
})

test('onboardingGear: backpacking alone has no weapon or fishing rows', () => {
  const rows = onboardingGear(['backpacking'])
  assert.ok(rows.length > 0)
  assert.ok(rows.every(r => !['Weapon', 'Kill kit', 'Fishing'].includes(r.category)))
})

test('onboardingGear: rifle and bow union shared optics/kill-kit rows without duplicates', () => {
  const rows = onboardingGear(['rifle', 'bow'])
  const ids = rows.map(r => r.id)
  assert.equal(ids.length, new Set(ids).size)
  assert.ok(rows.some(r => r.name === 'Rifle'))
  assert.ok(rows.some(r => r.name === 'Bow'))
  assert.equal(rows.filter(r => r.category === 'Optics/Bino Pouch' && /binocular/i.test(r.name)).length, 1)
})

test('onboardingGear: unknown types are ignored', () => {
  assert.deepEqual(onboardingGear(['snowmobiling']), [])
})

// ---------- applying answers ----------

test('apply: picked brands star exactly those brands, clearing the seed defaults', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: [], brands: ['stowaway'], gearIds: null, step: 3, at: NOW })
  const starred = state.library.filter(f => f.favorite)
  assert.ok(starred.length > 0)
  assert.ok(starred.every(f => f.id.startsWith('stowaway-')))
  // the seed's pre-starred Peak meals are no longer favorites
  assert.ok(!state.library.find(f => f.id === 'peak-beef-stroganoff').favorite)
})

test('apply: no brands picked leaves nothing starred (neutral drafting)', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: [], brands: [], gearIds: null, step: 3, at: NOW })
  assert.equal(state.library.filter(f => f.favorite).length, 0)
})

test('apply: checked gear rows replace the inherited seed as blank slots', () => {
  const state = freshState()
  const rows = onboardingGear(['backpacking', 'fishing'])
  const keep = rows.slice(0, 5).map(r => r.id)
  applyOnboarding(state, { tripTypes: ['backpacking', 'fishing'], brands: [], gearIds: keep, step: 3, at: NOW })
  assert.equal(state.gearLibrary.length, 5)
  assert.ok(state.gearLibrary.every(g => g.weightOz === null))
  assert.ok(!state.gearLibrary.some(g => g.name === 'MaDuece'))
  // migrations must not resurrect or rewrite the fresh library
  assert.equal(state.gearSeedVersion, GEAR_SEED.version)
})

test('apply: gear step skipped (null) keeps the existing gear library', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: ['backpacking'], brands: [], gearIds: null, step: 2, at: NOW })
  assert.equal(state.gearLibrary.length, GEAR_SEED.items.length)
})

test('apply: writes a syncable record of the answers', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: ['bow'], brands: ['peak'], gearIds: [], step: 3, at: NOW })
  assert.deepEqual(state.onboarding, { at: NOW, step: 3, tripTypes: ['bow'], brands: ['peak'] })
})

test('apply: full skip records only the bail point and touches nothing else', () => {
  const state = freshState()
  const starsBefore = state.library.filter(f => f.favorite).map(f => f.id)
  applyOnboarding(state, { tripTypes: [], brands: [], gearIds: null, step: 0, at: NOW })
  assert.deepEqual(state.library.filter(f => f.favorite).map(f => f.id), starsBefore)
  assert.equal(state.gearLibrary.length, GEAR_SEED.items.length)
  assert.equal(state.onboarding.step, 0)
})

// ---------- state validation ----------

function validBackup(extra = {}) {
  return {
    schemaVersion: 1,
    library: [],
    trips: [{ id: 't1', name: 'Elk', days: [{ intensity: 'medium' }], weightLbs: 180, startDate: '2026-08-01', ...extra }],
  }
}

test('validate: a trip with a known type passes; junk types fail', () => {
  assert.equal(validateImport(validBackup({ type: 'bow' })).ok, true)
  assert.equal(validateImport(validBackup({ type: 'jetski' })).ok, false)
  assert.equal(validateImport(validBackup()).ok, true)
})

test('validate: onboarding record round-trips; malformed records fail', () => {
  const good = { ...validBackup(), onboarding: { at: NOW, step: 3, tripTypes: ['bow'], brands: [] } }
  assert.equal(validateImport(good).ok, true)
  const bad = { ...validBackup(), onboarding: { at: 'yesterday', step: 3, tripTypes: 'bow', brands: [] } }
  assert.equal(validateImport(bad).ok, false)
})

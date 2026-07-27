import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateImport } from '../js/engine.js'
import { SEED, GEAR_SEED, BRANDS, TRIP_TYPES, brandOf, needsProfile, emptyProfile, applyProfile, skipProfile, applySeedMigrations } from '../js/seed.js'

const NOW = 1_800_000_000_000

function freshState() {
  return {
    schemaVersion: 1,
    trips: [],
    library: SEED.foods.map(f => ({ favorite: false, ...f })),
    seedVersion: SEED.version,
    gearLibrary: [],
    gearSeedVersion: GEAR_SEED.version,
  }
}

// ---------- brands ----------

test('brands: every seed food belongs to exactly one brand', () => {
  for (const f of SEED.foods) {
    const matches = BRANDS.filter(b => b.ids.some(p => f.id.startsWith(p)))
    assert.equal(matches.length, 1, `${f.id} matches ${matches.length} brands`)
  }
})

test('brands: snacks are covered, not just dehydrated meals', () => {
  assert.ok(BRANDS.some(b => b.kind === 'snack' && b.id === 'fatty'))
  assert.equal(brandOf('pro-bolt-chews'), 'probar', 'ProBar ships under two id spellings')
  assert.equal(brandOf('probar-peanut-butter'), 'probar')
  assert.equal(brandOf('nobody-makes-this'), null)
})

// ---------- the welcome trigger ----------

test('profile: a fresh never-synced state needs setting up', () => {
  assert.equal(needsProfile(freshState()), true)
})

test('profile: a state that has synced before is never asked', () => {
  assert.equal(needsProfile({ ...freshState(), updatedAt: NOW }), false)
})

test('profile: skipping records that we asked, and stars stay untouched', () => {
  const state = freshState()
  const starsBefore = state.library.filter(f => f.favorite).map(f => f.id)
  skipProfile(state, NOW)
  assert.equal(needsProfile(state), false)
  assert.deepEqual(state.library.filter(f => f.favorite).map(f => f.id), starsBefore)
  assert.equal(state.profile.setupAt, NOW)
})

// ---------- saving ----------

test('profile: saving stars exactly the brands picked, meals and snacks alike', () => {
  const state = freshState()
  applyProfile(state, { weightLbs: 208, brands: ['stowaway', 'fatty'], tripTypes: ['bow'], mealStyle: null, at: NOW })
  const starred = state.library.filter(f => f.favorite).map(f => f.id)
  assert.ok(starred.length > 0)
  assert.ok(starred.every(id => ['stowaway', 'fatty'].includes(brandOf(id))))
  assert.equal(state.library.find(f => f.id === 'peak-beef-stroganoff').favorite, false,
    "the seed's own stars give way to the user's brands")
  assert.ok(starred.includes('fatty-original-2oz'), 'a snack brand stars its snacks')
})

test('profile: no brands picked clears the stars — a neutral answer, not a no-op', () => {
  const state = freshState()
  applyProfile(state, { weightLbs: null, brands: [], tripTypes: [], mealStyle: null, at: NOW })
  assert.equal(state.library.filter(f => f.favorite).length, 0)
})

test('profile: junk answers are dropped, not stored', () => {
  const state = freshState()
  applyProfile(state, { weightLbs: -3, brands: ['peak', 'nike'], tripTypes: ['bow', 'jetski'], mealStyle: null, at: NOW })
  assert.equal(state.profile.weightLbs, null)
  assert.deepEqual(state.profile.brands, ['peak'])
  assert.deepEqual(state.profile.tripTypes, ['bow'])
})

test('profile: the record round-trips through import validation', () => {
  const state = freshState()
  applyProfile(state, {
    weightLbs: 208, brands: ['peak'], tripTypes: ['bow'],
    mealStyle: { breakfast: 'mobile', lunch: 'mobile', dinner: 'sitdown' }, at: NOW,
  })
  assert.equal(validateImport(state).ok, true)
  assert.equal(validateImport({ ...state, profile: { ...state.profile, brands: 'peak' } }).ok, false)
  assert.equal(validateImport({ ...state, profile: { ...state.profile, weightLbs: 0 } }).ok, false)
  assert.equal(validateImport({ ...state, profile: { ...state.profile, mealStyle: { breakfast: 'grazing' } } }).ok, false)
})

test('profile: an empty profile is a valid one', () => {
  const state = { ...freshState(), profile: { ...emptyProfile(), setupAt: NOW } }
  assert.equal(validateImport(state).ok, true)
})

// ---------- trip types ----------

const tripBackup = extra => ({
  schemaVersion: 1,
  library: [],
  trips: [{ id: 't1', name: 'Elk', days: [{ intensity: 'medium' }], weightLbs: 180, startDate: '2026-08-01', ...extra }],
})

test('trip types: a list of known types passes, junk fails, legacy single type still validates', () => {
  assert.equal(validateImport(tripBackup({ types: ['bow', 'fishing'] })).ok, true)
  assert.equal(validateImport(tripBackup({ types: ['jetski'] })).ok, false)
  assert.equal(validateImport(tripBackup({ types: 'bow' })).ok, false)
  assert.equal(validateImport(tripBackup({ type: 'bow' })).ok, true)
  assert.equal(validateImport(tripBackup()).ok, true)
})

test('trip types: the engine and the seed agree on the vocabulary', () => {
  for (const t of TRIP_TYPES) assert.equal(validateImport(tripBackup({ types: [t] })).ok, true, t)
})

// ---------- migrations ----------

test('migration: a single trip type folds into the list and the old field goes away', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, library: [], gearLibrary: [], gearSeedVersion: GEAR_SEED.version,
    trips: [{ id: 't1', name: 'Baranof', type: 'bow', days: [{ intensity: 'medium' }], weightLbs: 208, startDate: '2026-08-03' }],
  })
  assert.deepEqual(s.trips[0].types, ['bow'])
  assert.equal('type' in s.trips[0], false)
  assert.equal(validateImport(s).ok, true)
})

test('migration: yesterday\'s onboarding record becomes the profile that replaced it', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, trips: [], library: [], gearLibrary: [], gearSeedVersion: GEAR_SEED.version,
    onboarding: { at: NOW, step: 3, tripTypes: ['bow', 'jetski'], brands: ['peak', 'nike'] },
  })
  assert.equal(s.onboarding, undefined)
  assert.deepEqual(s.profile.brands, ['peak'])
  assert.deepEqual(s.profile.tripTypes, ['bow'])
  assert.equal(s.profile.setupAt, NOW)
  assert.equal(needsProfile(s), false, 'a migrated user is never welcomed again')
})

test('migration: an existing profile is never overwritten by a stale onboarding record', () => {
  const s = applySeedMigrations({
    schemaVersion: 1, seedVersion: SEED.version, trips: [], library: [], gearLibrary: [], gearSeedVersion: GEAR_SEED.version,
    onboarding: { at: 1, step: 3, tripTypes: [], brands: ['packit'] },
    profile: { ...emptyProfile(), brands: ['peak'], setupAt: NOW },
  })
  assert.deepEqual(s.profile.brands, ['peak'])
  assert.equal(s.onboarding, undefined)
})

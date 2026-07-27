import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateImport } from '../js/engine.js'
import { SEED, GEAR_SEED, GEAR_QUESTIONS, TRIP_TYPES, needsOnboarding, gearQuestions, onboardingGear, applyOnboarding } from '../js/seed.js'

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
  applyOnboarding(state, { tripTypes: [], brands: [], kit: null, step: 0, at: NOW })
  assert.equal(needsOnboarding(state), false)
})

// ---------- gear questions ----------

const ALL_ROWS = GEAR_QUESTIONS.flatMap(q => [...(q.rows ?? []), ...q.options.flatMap(o => o.rows)])

test('questions: every generated row uses a real category and a safe id', () => {
  const cats = new Set(['Backpack', 'Shelter/Sleeping', 'Water', 'Cooking', 'Weapon',
    'Optics/Bino Pouch', 'Kill kit', 'First aid & Safety', 'Fishing'])
  for (const row of ALL_ROWS) {
    assert.ok(cats.has(row.category), `${row.id} category ${row.category}`)
    assert.match(row.id, /^[A-Za-z0-9_-]{1,64}$/)
    assert.ok(row.name.trim().length > 0)
  }
})

test('questions: ids are unique, options are distinct, and every option builds something', () => {
  const qids = new Set()
  for (const q of GEAR_QUESTIONS) {
    assert.ok(!qids.has(q.id), `duplicate question id ${q.id}`)
    qids.add(q.id)
    assert.match(q.id, /^[A-Za-z0-9_-]{1,64}$/)
    assert.ok(q.prompt.trim().endsWith('?'), `${q.id} prompt should ask something`)
    const values = q.options.map(o => o.value)
    assert.equal(values.length, new Set(values).size, `${q.id} has duplicate option values`)
    // A question-level row set means every answer adds it, so an option may
    // legitimately carry none — but only then.
    if (!q.rows) assert.ok(q.options.every(o => o.rows.length > 0), `${q.id} has an empty option`)
  }
})

test('questions: a shared row id means the same slot everywhere it appears', () => {
  // Options share an id only when they name the same object (stakes for tent
  // and tarp, one utensil hot or cold). Same id must mean same name and
  // category, or answering twice would silently rewrite a slot.
  const byId = new Map()
  for (const q of GEAR_QUESTIONS) {
    for (const row of [...(q.rows ?? []), ...q.options.flatMap(o => o.rows)]) {
      const seen = byId.get(row.id)
      if (seen) {
        assert.equal(seen.category, row.category, `${row.id} files in two categories`)
        assert.equal(seen.name, row.name, `${row.id} has two names`)
      }
      byId.set(row.id, row)
    }
  }
})

test('questions: every question takes more than one answer', () => {
  // Onboarding maps a gear closet, not a trip — nothing here is exclusive.
  for (const q of GEAR_QUESTIONS) {
    assert.ok(q.options.length >= 2, `${q.id} needs options worth choosing among`)
    assert.equal(q.pick, undefined, `${q.id} still declares a pick mode`)
  }
})

test('gearQuestions: camp questions always ask; activity questions follow the trip picks', () => {
  const base = gearQuestions([]).map(q => q.id)
  assert.deepEqual(base, ['pack', 'sleep', 'water', 'cook', 'safety'])
  assert.ok(gearQuestions(['rifle']).some(q => q.id === 'rifle'))
  assert.ok(!gearQuestions(['rifle']).some(q => q.id === 'bow'))
  const both = gearQuestions(['rifle', 'bow', 'fishing']).map(q => q.id)
  assert.ok(['rifle', 'bow', 'fishing'].every(id => both.includes(id)))
  assert.ok(!gearQuestions(['snowmobiling']).some(q => q.when))
})

test('onboardingGear: an answer builds exactly the slots it implies', () => {
  const rows = onboardingGear({ sleep: ['tent'], cook: ['hot'] })
  const names = rows.map(r => r.name)
  assert.deepEqual(names, ['Tent', 'Stakes', 'Sleeping bag or quilt', 'Sleeping pad',
    'Stove', 'Stove fuel', 'Cook pot', 'Utensil'])
  assert.ok(rows.every(r => !['Weapon', 'Fishing', 'Water'].includes(r.category)))
})

test('onboardingGear: one shelter answer builds one shelter', () => {
  for (const [pick, name] of [['tent', 'Tent'], ['tarp', 'Tarp'], ['bivy', 'Bivy'], ['hammock', 'Hammock']]) {
    const rows = onboardingGear({ sleep: [pick] })
    const shelters = rows.filter(r => ['Tent', 'Tarp', 'Bivy', 'Hammock'].includes(r.name))
    assert.deepEqual(shelters.map(r => r.name), [name])
  }
})

test('onboardingGear: owning a tent AND a tarp gets both, with one set of stakes', () => {
  const rows = onboardingGear({ sleep: ['tent', 'tarp'] })
  const names = rows.map(r => r.name)
  assert.ok(names.includes('Tent'))
  assert.ok(names.includes('Tarp'))
  assert.equal(names.filter(n => n === 'Stakes').length, 1, 'stakes are stakes')
  assert.equal(names.filter(n => n === 'Sleeping bag or quilt').length, 1)
})

test('onboardingGear: a day pack and a hauler are two slots, not a choice', () => {
  const rows = onboardingGear({ pack: ['daypack', 'frame'] })
  assert.deepEqual(rows.map(r => r.name), ['Day pack', 'Pack bag', 'Pack frame'])
})

test('onboardingGear: cooking hot on some trips and cold on others keeps one utensil', () => {
  const rows = onboardingGear({ cook: ['hot', 'cold'] })
  assert.deepEqual(rows.map(r => r.name), ['Stove', 'Stove fuel', 'Cook pot', 'Utensil'])
})

test('onboardingGear: a filter bottle is one slot, not a filter plus a container', () => {
  const combo = onboardingGear({ water: ['filter-bottle'] })
  assert.deepEqual(combo.map(r => r.name), ['Filter bottle'])
  // Someone who carries both still gets both — the question asks what you carry.
  const separate = onboardingGear({ water: ['filter', 'bladder'] })
  assert.deepEqual(separate.map(r => r.name), ['Water filter', 'Hydration bladder'])
})

test('onboardingGear: cold food means a utensil and no stove', () => {
  const rows = onboardingGear({ cook: ['cold'] })
  assert.deepEqual(rows.map(r => r.name), ['Utensil'])
})

test('onboardingGear: rifle and bow answers union their shared optics and kill kit once', () => {
  const rows = onboardingGear({ rifle: ['rifle', 'optics', 'kill-kit'], bow: ['bow', 'optics', 'kill-kit'] })
  const ids = rows.map(r => r.id)
  assert.equal(ids.length, new Set(ids).size)
  assert.ok(rows.some(r => r.name === 'Rifle'))
  assert.ok(rows.some(r => r.name === 'Bow'))
  assert.equal(rows.filter(r => r.id === 'ob-binoculars').length, 1)
})

test('onboardingGear: unknown questions and unknown options build nothing', () => {
  assert.deepEqual(onboardingGear({ snowmobiling: ['sled'] }), [])
  assert.deepEqual(onboardingGear({ sleep: ['igloo'] }), [])
  assert.deepEqual(onboardingGear({}), [])
  assert.deepEqual(onboardingGear(null), [])
})

test('onboardingGear: an unanswered question adds nothing, not even its shared rows', () => {
  assert.equal(onboardingGear({ cook: ['hot'] }).some(r => r.id === 'ob-sleeping-bag'), false)
})

// ---------- applying answers ----------

test('apply: picked brands star exactly those brands, clearing the seed defaults', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: [], brands: ['stowaway'], kit: null, step: 3, at: NOW })
  const starred = state.library.filter(f => f.favorite)
  assert.ok(starred.length > 0)
  assert.ok(starred.every(f => f.id.startsWith('stowaway-')))
  // the seed's pre-starred Peak meals are no longer favorites
  assert.ok(!state.library.find(f => f.id === 'peak-beef-stroganoff').favorite)
})

test('apply: no brands picked leaves nothing starred (neutral drafting)', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: [], brands: [], kit: null, step: 3, at: NOW })
  assert.equal(state.library.filter(f => f.favorite).length, 0)
})

test('apply: the answers replace the inherited seed with blank slots', () => {
  const state = freshState()
  const kit = { sleep: ['tarp'], water: ['filter'], cook: ['hot'], fishing: ['rod'] }
  applyOnboarding(state, { tripTypes: ['backpacking', 'fishing'], brands: [], kit, step: 3, at: NOW })
  assert.equal(state.gearLibrary.length, onboardingGear(kit).length)
  assert.ok(state.gearLibrary.every(g => g.weightOz === null))
  assert.ok(!state.gearLibrary.some(g => g.name === 'MaDuece'))
  assert.ok(state.gearLibrary.some(g => g.name === 'Tarp'))
  // migrations must not resurrect or rewrite the fresh library
  assert.equal(state.gearSeedVersion, GEAR_SEED.version)
})

test('apply: gear step skipped (null) keeps the existing gear library', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: ['backpacking'], brands: [], kit: null, step: 2, at: NOW })
  assert.equal(state.gearLibrary.length, GEAR_SEED.items.length)
})

test('apply: answering nothing empties the library — "I\'ll add my own" is an answer', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: [], brands: [], kit: { sleep: [], cook: [] }, step: 3, at: NOW })
  assert.deepEqual(state.gearLibrary, [])
})

test('apply: writes a syncable record of the answers', () => {
  const state = freshState()
  applyOnboarding(state, { tripTypes: ['bow'], brands: ['peak'], kit: {}, step: 3, at: NOW })
  assert.deepEqual(state.onboarding, { at: NOW, step: 3, tripTypes: ['bow'], brands: ['peak'] })
})

test('apply: full skip records only the bail point and touches nothing else', () => {
  const state = freshState()
  const starsBefore = state.library.filter(f => f.favorite).map(f => f.id)
  applyOnboarding(state, { tripTypes: [], brands: [], kit: null, step: 0, at: NOW })
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

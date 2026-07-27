import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateImport } from '../js/engine.js'
import { GEAR_QUESTIONS, tripGearQuestions, tripTypes, kitRows, applyTripKit, copyKit, genericGearName, GEAR_CATEGORIES, RETIRED_GEAR_CATEGORIES } from '../js/seed.js'

const CATEGORIES = new Set(['Backpack', 'Shelter/Sleeping', 'Water', 'Cooking', 'Weapon',
  'Optics/Bino Pouch', 'Kill kit', 'Fishing', 'First aid & Safety',
  'Clothing worn', 'Clothing packed', 'Luxuries'])

const trip = (types, gear = []) => ({ id: 't1', name: 'Baranof', createdAt: 1, types, gear })
const owned = (id, name, category, weightOz = null) => ({ id, name, category, weightOz })

// ---------- catalog integrity ----------

test('questions: every row files in a real category under a safe id', () => {
  for (const q of GEAR_QUESTIONS) {
    for (const row of [...(q.rows ?? []), ...q.options.flatMap(o => o.rows)]) {
      assert.ok(CATEGORIES.has(row.category), `${row.id} category ${row.category}`)
      assert.match(row.id, /^[A-Za-z0-9_-]{1,64}$/)
      assert.ok(row.name.trim().length > 0)
      assert.ok(q.categories.includes(row.category), `${q.id} builds a ${row.category} row it doesn't own`)
    }
  }
})

test('questions: ids are unique, options distinct, every option builds something', () => {
  const seen = new Set()
  for (const q of GEAR_QUESTIONS) {
    assert.ok(!seen.has(q.id), `duplicate question id ${q.id}`)
    seen.add(q.id)
    assert.ok(q.prompt.trim().endsWith('?'), `${q.id} should ask something`)
    assert.ok(q.categories.every(c => CATEGORIES.has(c)), `${q.id} owns an unknown category`)
    const values = q.options.map(o => o.value)
    assert.equal(values.length, new Set(values).size, `${q.id} has duplicate option values`)
    assert.ok(q.options.every(o => o.rows.length > 0), `${q.id} has an empty option`)
    assert.equal(q.pick, undefined, `${q.id} still declares a pick mode — every question is multi-answer`)
  }
})

test('questions: a shared row id means the same slot everywhere it appears', () => {
  const byId = new Map()
  for (const q of GEAR_QUESTIONS) {
    for (const row of [...(q.rows ?? []), ...q.options.flatMap(o => o.rows)]) {
      const first = byId.get(row.id)
      if (first) {
        assert.equal(first.category, row.category, `${row.id} files in two categories`)
        assert.equal(first.name, row.name, `${row.id} has two names`)
      }
      byId.set(row.id, row)
    }
  }
})

test('questions: every gear category a user can own is reachable from some question', () => {
  const covered = new Set(GEAR_QUESTIONS.flatMap(q => q.categories))
  for (const c of CATEGORIES) assert.ok(covered.has(c), `nothing asks about ${c}`)
})

// ---------- which questions a trip asks ----------

test('tripGearQuestions: camp questions always, activity questions only for the trip', () => {
  const camp = tripGearQuestions(trip([])).map(q => q.id)
  assert.deepEqual(camp, ['pack', 'sleep', 'water', 'cook', 'worn', 'packed', 'safety', 'extras'])
  const hunt = tripGearQuestions(trip(['bow', 'fishing'])).map(q => q.id)
  assert.ok(hunt.includes('bow') && hunt.includes('fishing'))
  assert.ok(!hunt.includes('rifle'))
})

test('tripTypes: a legacy single type still asks the right questions', () => {
  assert.deepEqual(tripTypes({ type: 'rifle' }), ['rifle'])
  assert.deepEqual(tripTypes({ types: ['bow', 'jetski'] }), ['bow'])
  assert.deepEqual(tripTypes({}), [])
  assert.ok(tripGearQuestions({ type: 'rifle' }).some(q => q.id === 'rifle'))
})

test('tripGearQuestions: your own gear is listed under the question that owns it', () => {
  const lib = [owned('tent', 'Kifaru SuperTarp', 'Shelter/Sleeping', 40), owned('rod', 'Sage R8', 'Fishing')]
  const sleep = tripGearQuestions(trip([]), lib).find(q => q.id === 'sleep')
  assert.deepEqual(sleep.items.map(g => g.name), ['Kifaru SuperTarp'])
  // Fishing gear stays out of a trip that isn't a fishing trip.
  assert.ok(!tripGearQuestions(trip([]), lib).some(q => q.id === 'fishing'))
})

test('tripGearQuestions: an option whose slots already exist is dropped, not duplicated', () => {
  const lib = [owned('ob-tent', 'Tent', 'Shelter/Sleeping'), owned('ob-stakes', 'Stakes', 'Shelter/Sleeping')]
  const sleep = tripGearQuestions(trip([]), lib).find(q => q.id === 'sleep')
  assert.ok(!sleep.options.some(o => o.value === 'tent'), 'the tent option would repeat the owned tent')
  assert.ok(sleep.options.some(o => o.value === 'bivy'), 'gear you have never logged stays offerable')
  assert.equal(sleep.items.length, 2)
})

// ---------- answers to slots ----------

test('kitRows: generic answers build their slots, shared rows ride along once', () => {
  const rows = kitRows({ sleep: ['tent', 'tarp'], cook: ['hot', 'cold'] })
  const names = rows.map(r => r.name)
  assert.ok(names.includes('Tent') && names.includes('Tarp'))
  assert.equal(names.filter(n => n === 'Stakes').length, 1)
  assert.equal(names.filter(n => n === 'Utensil').length, 1)
  assert.equal(names.filter(n => n === 'Sleeping bag or quilt').length, 1)
})

test('kitRows: picking gear you own returns that item, not a fresh blank', () => {
  const lib = [owned('tent', 'Kifaru SuperTarp', 'Shelter/Sleeping', 40)]
  const questions = tripGearQuestions(trip([]), lib)
  const rows = kitRows({ sleep: ['tent'] }, questions)
  assert.equal(rows.find(r => r.id === 'tent').name, 'Kifaru SuperTarp')
})

test('kitRows: the bag and pad scaffold a first kit, before you own any shelter gear', () => {
  const rows = kitRows({ sleep: ['tent'] })
  assert.deepEqual(rows.map(r => r.name), ['Tent', 'Stakes', 'Sleeping bag or quilt', 'Sleeping pad'])
})

test('kitRows: an unanswered question adds nothing, not even its shared rows', () => {
  assert.equal(kitRows({ cook: ['hot'] }).some(r => r.id === 'ob-sleeping-bag'), false)
  assert.deepEqual(kitRows({}), [])
  assert.deepEqual(kitRows(null), [])
  assert.deepEqual(kitRows({ sleep: ['igloo'], snowmobiling: ['sled'] }), [])
})

// ---------- applying ----------

test('applyTripKit: new answers become blank library slots and unpacked trip entries', () => {
  const state = { gearLibrary: [] }
  const t = trip([])
  applyTripKit(state, t, { sleep: ['tent'], water: ['filter-bottle'] })
  assert.deepEqual(state.gearLibrary.map(g => g.name),
    ['Tent', 'Stakes', 'Sleeping bag or quilt', 'Sleeping pad', 'Filter bottle'])
  assert.ok(state.gearLibrary.every(g => g.weightOz === null))
  assert.equal(t.gear.length, 5)
  assert.ok(t.gear.every(e => !e.packed), 'a fresh kit starts unpacked')
})

test('applyTripKit: gear you already own is reused, never duplicated', () => {
  const state = { gearLibrary: [owned('ob-tent', 'Kifaru SuperTarp', 'Shelter/Sleeping', 40)] }
  const t = trip([])
  const questions = tripGearQuestions(t, state.gearLibrary)
  applyTripKit(state, t, { sleep: ['ob-tent'] }, questions)
  assert.equal(state.gearLibrary.filter(g => g.id === 'ob-tent').length, 1)
  assert.equal(state.gearLibrary.find(g => g.id === 'ob-tent').name, 'Kifaru SuperTarp', 'a rename survives')
  assert.ok(t.gear.some(e => e.gearId === 'ob-tent'))
})

test('applyTripKit: answering twice adds nothing the second time', () => {
  const state = { gearLibrary: [] }
  const t = trip([])
  applyTripKit(state, t, { cook: ['hot'] })
  const after = t.gear.length
  applyTripKit(state, t, { cook: ['hot'] })
  assert.equal(t.gear.length, after)
  assert.equal(state.gearLibrary.length, after)
})

test('applyTripKit: a packed mark survives re-answering', () => {
  const state = { gearLibrary: [] }
  const t = trip([])
  applyTripKit(state, t, { cook: ['hot'] })
  t.gear[0].packed = true
  applyTripKit(state, t, { cook: ['hot'], safety: ['headlamp'] })
  assert.equal(t.gear[0].packed, true)
  assert.ok(t.gear.some(e => e.gearId === 'ob-headlamp'))
})

test('copyKit: the same kit comes over unpacked', () => {
  const from = trip([], [{ gearId: 'tent', packed: true }, { gearId: 'bag', packed: true }])
  const to = { id: 't2', gear: [{ gearId: 'tent' }] }
  copyKit(from, to)
  assert.deepEqual(to.gear, [{ gearId: 'tent' }, { gearId: 'bag' }])
  assert.ok(to.gear.every(e => !e.packed), 'a new trip starts unpacked')
})

test('kitRows: once a question lists gear you own, nothing rides along uninvited', () => {
  const lib = [
    owned('ob-tarp', 'Kifaru SuperTarp', 'Shelter/Sleeping', 40),
    owned('ob-sleeping-bag', 'WM TerraLite', 'Shelter/Sleeping', 28),
  ]
  const questions = tripGearQuestions(trip([]), lib)
  const rows = kitRows({ sleep: ['ob-tarp'] }, questions)
  assert.deepEqual(rows.map(r => r.id), ['ob-tarp'],
    'leaving the bag unchecked has to mean leaving the bag')
})

// ---------- 2026-07-27 evening round ----------

test('optics is its own question, shared by both hunt types', () => {
  const rifle = tripGearQuestions(trip(['rifle'])).find(q => q.id === 'optics')
  const bow = tripGearQuestions(trip(['bow'])).find(q => q.id === 'optics')
  assert.ok(rifle && bow, 'both hunts ask about glass')
  assert.deepEqual(rifle.options.map(o => o.value).sort(),
    ['binos', 'harness', 'range-finder', 'spotter', 'tripod'])
  // It is not a weapon footnote any more.
  const weapons = tripGearQuestions(trip(['rifle'])).find(q => q.id === 'rifle')
  assert.ok(!weapons.options.some(o => o.value === 'optics'))
  // And a backpacking trip is not asked about glass.
  assert.ok(!tripGearQuestions(trip([])).some(q => q.id === 'optics'))
})

test('a pack is one object — no separate bag and frame to add up', () => {
  const pack = tripGearQuestions(trip([])).find(q => q.id === 'pack')
  assert.ok(!pack.options.some(o => o.value === 'frame'))
  for (const o of pack.options) {
    assert.equal(o.rows.length, 1, `${o.value} should build exactly one row`)
  }
  assert.deepEqual(kitRows({ pack: ['hauler'] }).map(r => r.name), ['Meat hauler'])
})

test('safety covers bear defense', () => {
  const safety = tripGearQuestions(trip([])).find(q => q.id === 'safety')
  const values = safety.options.map(o => o.value)
  assert.ok(values.includes('bear-spray') && values.includes('sidearm'))
  // Both live with the first aid kit, so a trip that asks no weapon question
  // can still declare them.
  assert.ok(kitRows({ safety: ['sidearm', 'bear-spray'] })
    .every(r => r.category === 'First aid & Safety'))
})

test('rain gear can be worn as well as packed, and they are different rows', () => {
  const rows = kitRows({ worn: ['rain-worn'], packed: ['rain'] })
  const ids = rows.map(r => r.id)
  assert.ok(ids.includes('ob-rain-shell-worn') && ids.includes('ob-rain-shell'))
  assert.equal(rows.find(r => r.id === 'ob-rain-shell-worn').category, 'Clothing worn')
  assert.equal(rows.find(r => r.id === 'ob-rain-shell').category, 'Clothing packed')
})

test('a wet forecast suggests rain gear; it never checks it', () => {
  const wet = { ...trip([]), place: { climate: { precipDays: 5, days: 7, tempLoF: 55 } } }
  const worn = tripGearQuestions(wet).find(q => q.id === 'worn')
  assert.equal(worn.options.find(o => o.value === 'rain-worn').suggested, 'likely wet')
  assert.equal(worn.options.find(o => o.value === 'boots').suggested, null)
  // Suggestion is not selection: the answer set is still empty.
  assert.deepEqual(kitRows({}, tripGearQuestions(wet)), [])
})

test('a cold forecast suggests insulation; a mild one suggests nothing', () => {
  const cold = { ...trip([]), place: { climate: { precipDays: 0, days: 7, tempLoF: 28 } } }
  const packed = tripGearQuestions(cold).find(q => q.id === 'packed')
  assert.equal(packed.options.find(o => o.value === 'puffy').suggested, 'likely cold')
  const mild = { ...trip([]), place: { climate: { precipDays: 0, days: 7, tempLoF: 60 } } }
  const mildPacked = tripGearQuestions(mild).find(q => q.id === 'packed')
  assert.ok(mildPacked.options.every(o => o.suggested === null))
  // No lookup at all is simply no suggestions.
  assert.ok(tripGearQuestions(trip([])).every(q => q.options.every(o => o.suggested === null)))
})

test('naming the product while answering lands on the gear row', () => {
  const state = { gearLibrary: [] }
  const t = trip([])
  applyTripKit(state, t, { pack: ['multiday'] }, undefined, {
    'ob-multiday-pack': { name: 'Kifaru Reckoning', url: 'https://kifaru.net/x', weightOz: 96 },
  })
  const row = state.gearLibrary.find(g => g.id === 'ob-multiday-pack')
  assert.equal(row.name, 'Kifaru Reckoning')
  assert.equal(row.weightOz, 96)
  assert.equal(row.url, 'https://kifaru.net/x')
})

test('an empty or junk detail leaves the blank slot exactly as it was', () => {
  const state = { gearLibrary: [] }
  applyTripKit(state, trip([]), { pack: ['daypack'] }, undefined, {
    'ob-daypack': { name: '   ', url: '', weightOz: 0 },
  })
  const row = state.gearLibrary[0]
  assert.equal(row.name, 'Day pack')
  assert.equal(row.weightOz, null)
  assert.equal(row.url, undefined)
})

test('naming a slot you already own updates it rather than forking a second row', () => {
  const state = { gearLibrary: [owned('ob-tent', 'Tent', 'Shelter/Sleeping')] }
  const t = trip([])
  const questions = tripGearQuestions(t, state.gearLibrary)
  applyTripKit(state, t, { sleep: ['ob-tent'] }, questions, {
    'ob-tent': { name: 'Seek Outside Cimarron', weightOz: 38 },
  })
  assert.equal(state.gearLibrary.length, 1)
  assert.equal(state.gearLibrary[0].name, 'Seek Outside Cimarron')
  assert.equal(state.gearLibrary[0].weightOz, 38)
})

test('genericGearName knows a slot label from a real one', () => {
  assert.equal(genericGearName('ob-tent'), 'Tent')
  assert.equal(genericGearName('ob-multiday-pack'), 'Multi-day pack')
  assert.equal(genericGearName('some-user-item'), null)
})

test('every question row can be recognised by its generic name', () => {
  // isBlankSlot leans on this: a row still wearing its catalog label has not
  // been told what it actually is.
  for (const q of GEAR_QUESTIONS) {
    for (const row of [...(q.rows ?? []), ...q.options.flatMap(o => o.rows)]) {
      assert.equal(genericGearName(row.id), row.name)
    }
  }
})

test('the gear category vocabulary has exactly one home', () => {
  assert.deepEqual([...CATEGORIES].sort(), [...GEAR_CATEGORIES].sort())
  for (const q of GEAR_QUESTIONS) {
    for (const row of [...(q.rows ?? []), ...q.options.flatMap(o => o.rows)]) {
      assert.ok(GEAR_CATEGORIES.includes(row.category), `${row.id} files outside the cabinet`)
    }
  }
})

test('the import gate accepts exactly the categories the app can file', () => {
  // engine.js is the pure core and imports nothing, so it spells the category
  // list out a second time. Comparing literals would not catch a divergence
  // (Codex, 2026-07-27) — this drives the real validator, so adding a category
  // to seed.js without teaching the gate about it fails right here.
  const gear = category => validateImport({
    schemaVersion: 1, library: [],
    trips: [{ id: 't', name: 'T', startDate: '2026-08-01', weightLbs: 200, days: [{ intensity: 'medium' }] }],
    gearLibrary: [{ id: 'g', name: 'Thing', category, weightOz: 10 }],
  })
  for (const c of GEAR_CATEGORIES) {
    assert.equal(gear(c).ok, true, `the gate rejects a category the app files under: ${c}`)
  }
  for (const c of Object.keys(RETIRED_GEAR_CATEGORIES)) {
    assert.equal(gear(c).ok, true, `a retired name must pass the gate — migration renames it after: ${c}`)
    assert.ok(GEAR_CATEGORIES.includes(RETIRED_GEAR_CATEGORIES[c]), `${c} retires into a category that exists`)
  }
  assert.equal(gear('Invented By Hand').ok, false)
})

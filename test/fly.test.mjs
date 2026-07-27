import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flyIssues, FLY_RULES } from '../js/engine.js'

const gear = (id, name) => ({ id, name, category: 'First aid & Safety', weightOz: null })
const trip = (flying, ids) => ({ flying, gear: ids.map(id => ({ gearId: id })) })

test('flyIssues: a trip that drives has nothing to declare', () => {
  const lib = [gear('a', 'Bear spray'), gear('b', 'Stove fuel')]
  assert.deepEqual(flyIssues(trip(false, ['a', 'b']), lib), { banned: [], checked: [], carryon: [] })
  assert.deepEqual(flyIssues(trip(undefined, ['a']), lib), { banned: [], checked: [], carryon: [] })
})

test('flyIssues: fuel and bear spray cannot fly at all', () => {
  const lib = [gear('a', 'Bear spray'), gear('b', 'MSR IsoPro fuel'), gear('c', 'Headlamp')]
  const out = flyIssues(trip(true, ['a', 'b', 'c']), lib)
  assert.deepEqual(out.banned.map(x => x.name).sort(), ['Bear spray', 'MSR IsoPro fuel'])
  assert.equal(out.checked.length, 0)
  assert.ok(out.banned.every(x => x.why.length > 0), 'every flagged item says why')
})

test('flyIssues: firearms, blades and poles fly checked; lithium flies in the cabin', () => {
  const lib = [
    gear('a', 'Tikka T3x rifle'), gear('b', 'Havalon knife'),
    gear('c', 'Trekking poles'), gear('d', 'Anker power bank'),
  ]
  const out = flyIssues(trip(true, ['a', 'b', 'c', 'd']), lib)
  assert.deepEqual(out.checked.map(x => x.name), ['Tikka T3x rifle', 'Havalon knife', 'Trekking poles'])
  assert.deepEqual(out.carryon.map(x => x.name), ['Anker power bank'])
})

test('flyIssues: a renamed item is still caught, an unknown one is left alone', () => {
  const lib = [gear('a', 'Kifaru SuperTarp'), gear('b', 'Jetboil fuel canister')]
  const out = flyIssues(trip(true, ['a', 'b']), lib)
  assert.equal(out.banned.length, 1)
  assert.equal(out.checked.length, 0)
  assert.equal(out.carryon.length, 0)
})

test('flyIssues: gear deleted from the library is skipped, not crashed on', () => {
  assert.deepEqual(flyIssues(trip(true, ['ghost']), []), { banned: [], checked: [], carryon: [] })
})

test('FLY_RULES: every rule declares a level, a reason and a usable pattern', () => {
  const levels = new Set(['banned', 'checked', 'carryon'])
  for (const r of FLY_RULES) {
    assert.ok(levels.has(r.level), `unknown level ${r.level}`)
    assert.ok(r.why.trim().length > 0)
    assert.ok(r.match instanceof RegExp)
    // Rules run against every gear name on every render — a global regex would
    // carry lastIndex between calls and start missing matches.
    assert.equal(r.match.global, false, `${r.level} rule is global`)
  }
})

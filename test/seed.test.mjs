import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED } from '../js/seed.js'

const SLOTS = ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snack']

test('seed has a version and a non-trivial food list', () => {
  assert.ok(Number.isInteger(SEED.version) && SEED.version >= 1)
  assert.ok(SEED.foods.length >= 30)
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

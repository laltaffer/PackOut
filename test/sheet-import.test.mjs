import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv, interpretSheet } from '../js/sheet-import.js'

const montana = readFileSync(new URL('./fixtures/montana-packing.csv', import.meta.url), 'utf8')

test('parseCsv splits rows and columns', () => {
  assert.deepEqual(parseCsv('a,b,c\nd,e,f'), [['a', 'b', 'c'], ['d', 'e', 'f']])
})

test('parseCsv keeps commas inside quoted fields', () => {
  assert.deepEqual(
    parseCsv('"Bow, 3 broad heads, 2 judo points",x'),
    [['Bow, 3 broad heads, 2 judo points', 'x']])
})

test('parseCsv handles escaped quotes and newlines inside quotes', () => {
  assert.deepEqual(
    parseCsv('"say ""hi""","line one\nline two"'),
    [['say "hi"', 'line one\nline two']])
})

test('parseCsv handles CRLF and a trailing newline without a ghost row', () => {
  assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']])
})

test('the real Montana sheet parses to a rectangular grid', () => {
  const grid = parseCsv(montana)
  assert.equal(grid.length, 49) // 48 newlines + an unterminated last line
  assert.equal(grid[1][0], 'PERSONAL ITEMS')
  assert.equal(grid[1][2], 'CLOTHING')
  assert.equal(grid[2][4], 'Bear Spray')
  assert.equal(grid[2][5], '3')
  // The quoted multi-comma cell survives as one cell.
  assert.equal(grid[23][2], 'Bow, 3 broad heads, 2 judo points')
})

// --- interpretSheet: the packing-list shape (the Montana sheet) ---

const montanaResult = () => interpretSheet(parseCsv(montana))

test('every header group is found, in column order', () => {
  const { groups } = montanaResult()
  assert.deepEqual(groups.map(g => g.header), [
    'PERSONAL ITEMS', 'FOOD', 'CAMP', "Joe’s Other Possibles:",
    'CLOTHING', 'HUNTING', 'TO GET IN MT',
  ])
})

test('items attach to the nearest header above in their own column', () => {
  const { groups } = montanaResult()
  const food = groups.find(g => g.header === 'FOOD')
  assert.ok(food.items.some(i => i.name === 'Granola'))
  assert.ok(!food.items.some(i => i.name === 'Headlamp (w/ batteries)')) // stays in PERSONAL ITEMS
  const hunting = groups.find(g => g.header === 'HUNTING')
  assert.ok(hunting.items.some(i => i.name === 'Elk calls and bugle'))
  assert.ok(!groups.find(g => g.header === 'CLOTHING').items.some(i => i.name === 'Elk calls and bugle'))
})

test('a FOOD header makes a food group; everything else is gear', () => {
  const { groups } = montanaResult()
  assert.equal(groups.find(g => g.header === 'FOOD').kind, 'food')
  assert.equal(groups.find(g => g.header === 'CLOTHING').kind, 'gear')
  assert.equal(groups.find(g => g.header === 'TO GET IN MT').kind, 'gear')
})

test('the silent column to the right carries notes', () => {
  const { groups } = montanaResult()
  const mt = groups.find(g => g.header === 'TO GET IN MT')
  assert.equal(mt.items.find(i => i.name === 'Bear Spray').note, '3')
  assert.equal(mt.items.find(i => i.name === 'Fuel').note, '3 medium')
  assert.equal(mt.items.find(i => i.name === 'Lighter').note, 'For stove')
})

test('gear categories default from the header, then the item name', () => {
  const { groups } = montanaResult()
  const clothing = groups.find(g => g.header === 'CLOTHING')
  assert.ok(clothing.items.every(i => i.category === 'Clothing packed'))
  const hunting = groups.find(g => g.header === 'HUNTING')
  assert.equal(hunting.items.find(i => i.name === 'Binos').category, 'Optics/Bino Pouch')
  assert.equal(hunting.items.find(i => i.name === 'Handgun and clip').category, 'Weapon')
  const mt = groups.find(g => g.header === 'TO GET IN MT')
  assert.equal(mt.items.find(i => i.name === 'Bear Spray').category, 'First aid & Safety')
})

test('a trailing question mark is a human hedge, not part of the name', () => {
  const { groups } = montanaResult()
  const clothing = groups.find(g => g.header === 'CLOTHING')
  assert.ok(clothing.items.some(i => i.name === 'Down jacket'))
  assert.ok(!clothing.items.some(i => i.name === 'Down jacket?'))
})

test('a packing list yields no day plan', () => {
  assert.equal(montanaResult().plan, null)
})

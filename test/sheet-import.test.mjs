import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv, interpretSheet, markDuplicates } from '../js/sheet-import.js'

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

// --- interpretSheet: the tabular food shape ---

const TABULAR = [
  'Item,Calories,Protein (g),Carbs (g),Fat (g),Weight (oz)',
  'Peak Refuel Chicken Alfredo,960,53,73,49,5.4',
  'Granola,520,12,62,24,4.2',
  'Mystery bar,lots,1,2,3,1.0',
].join('\n')

test('a header row with nutrition columns imports foods with macros', () => {
  const { groups, plan } = interpretSheet(parseCsv(TABULAR))
  assert.equal(plan, null)
  assert.equal(groups.length, 1)
  const g = groups[0]
  assert.equal(g.kind, 'food')
  const alfredo = g.items.find(i => i.name === 'Peak Refuel Chicken Alfredo')
  assert.deepEqual(
    [alfredo.kcal, alfredo.proteinG, alfredo.carbsG, alfredo.fatG, alfredo.weightOz],
    [960, 53, 73, 49, 5.4])
})

test('a tabular row without a readable calorie number is reported, not guessed', () => {
  const { groups, warnings } = interpretSheet(parseCsv(TABULAR))
  assert.ok(!groups[0].items.some(i => i.name === 'Mystery bar'))
  assert.ok(warnings.some(w => w.includes('Mystery bar')))
})

// --- interpretSheet: day plans, only when unambiguous ---

const PLAN = [
  'DAY 1,,DAY 2',
  'Breakfast,,Breakfast',
  'Oatmeal,,Granola',
  'Dinner,,Dinner',
  'Chicken Alfredo,,Beef Stroganoff',
  'Snacks,,Snacks',
  'Goldbears,,Trail mix',
  'Goldbears,,',
].join('\n')

test('explicit day headers with meal labels read as a plan', () => {
  const { plan } = interpretSheet(parseCsv(PLAN))
  assert.equal(plan.days.length, 2)
  assert.deepEqual(plan.days[0].meals.breakfast, ['Oatmeal'])
  assert.deepEqual(plan.days[0].meals.dinner, ['Chicken Alfredo'])
  assert.deepEqual(plan.days[0].meals.snacks, ['Goldbears', 'Goldbears'])
  assert.deepEqual(plan.days[1].meals.dinner, ['Beef Stroganoff'])
})

test('day columns are consumed by the plan, not read again as gear groups', () => {
  const { groups } = interpretSheet(parseCsv(PLAN))
  assert.ok(!groups.some(g => /^day/i.test(g.header)))
})

test('gapped day numbering is ambiguous: no plan, and the import says why', () => {
  const csv = PLAN.replace('DAY 2', 'DAY 3')
  const { plan, warnings } = interpretSheet(parseCsv(csv))
  assert.equal(plan, null)
  assert.ok(warnings.some(w => /day/i.test(w)))
})

// --- markDuplicates: what's already yours stays yours ---

test('an item matching the existing library (case-insensitive) is flagged, not re-imported', () => {
  const result = interpretSheet(parseCsv(montana))
  markDuplicates(result, {
    library: [{ id: 'x', name: 'GRANOLA' }],
    gearLibrary: [{ id: 'y', name: 'bear spray' }],
  })
  const food = result.groups.find(g => g.header === 'FOOD')
  assert.equal(food.items.find(i => i.name === 'Granola').dup, true)
  const mt = result.groups.find(g => g.header === 'TO GET IN MT')
  assert.equal(mt.items.find(i => i.name === 'Bear Spray').dup, true)
  assert.equal(mt.items.find(i => i.name === 'Onion/garlic').dup, undefined)
})

test('the second occurrence inside the sheet itself is a duplicate too', () => {
  const result = interpretSheet(parseCsv(montana))
  markDuplicates(result, { library: [], gearLibrary: [] })
  // "Wipes" appears under PERSONAL ITEMS and again under TO GET IN MT.
  const first = result.groups.find(g => g.header === 'PERSONAL ITEMS').items.find(i => i.name === 'Wipes')
  const second = result.groups.find(g => g.header === 'TO GET IN MT').items.find(i => i.name === 'Wipes')
  assert.equal(first.dup, undefined)
  assert.equal(second.dup, true)
})

test('a food and a gear item may share a name without colliding', () => {
  const result = interpretSheet(parseCsv(montana))
  markDuplicates(result, { library: [{ id: 'x', name: 'Bear Spray' }], gearLibrary: [] })
  const mt = result.groups.find(g => g.header === 'TO GET IN MT')
  assert.equal(mt.items.find(i => i.name === 'Bear Spray').dup, undefined) // gear item; only the FOOD library has that name
})

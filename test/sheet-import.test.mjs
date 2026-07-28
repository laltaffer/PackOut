import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv } from '../js/sheet-import.js'

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

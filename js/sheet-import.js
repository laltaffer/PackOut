// Sheet import — pure, DOM-free interpretation of a spreadsheet grid into
// PackOut library items (and, only when the structure is unambiguous, a day
// plan). Tested from test/sheet-import.test.mjs against the real Montana
// packing sheet; the UI in js/screens/import.js is a thin renderer over this.

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(cell); cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// A packing list names its groups in shouty header cells (CLOTHING, CAMP,
// "Joe's Other Possibles:"). A cell is a header when it is all-caps prose or
// ends with a colon; everything below it in the same column belongs to it.
const FOOD_HEADER = /\b(foods?|grocer(y|ies)|meals?|snacks?|nutrition)\b/i

const HEADER_CATEGORY = [
  [/cloth/i, 'Clothing packed'],
  [/camp|shelter|sleep/i, 'Shelter/Sleeping'],
  [/cook|kitchen/i, 'Cooking'],
  [/water/i, 'Water'],
  [/optic|glass/i, 'Optics/Bino Pouch'],
  [/weapon|archery|rifle/i, 'Weapon'],
  [/fish/i, 'Fishing'],
  [/first aid|safety|medical/i, 'First aid & Safety'],
  [/kill kit|harvest/i, 'Kill kit'],
  [/backpack/i, 'Backpack'],
]

// Order matters: the specific (game bag, bear spray) must win before the
// generic (bag, spray-adjacent words). These are defaults for the preview's
// category dropdowns, not verdicts — the user corrects, the import obeys.
const NAME_CATEGORY = [
  [/game bag|kill kit|harvest|razor/i, 'Kill kit'],
  [/bear spray|bear fence|first aid|ibuprofen|bandage|garmin|inreach|compass|whistle|sunscreen/i, 'First aid & Safety'],
  [/bino|spotting|scope|tripod|range ?finder|optic/i, 'Optics/Bino Pouch'],
  [/\b(bow|rifle|handgun|pistol|ammo|arrows?|broad ?heads?|bugle|calls?)\b/i, 'Weapon'],
  [/water|filter|bladder|nalgene/i, 'Water'],
  [/stove|fuel|jet ?boil|\bpots?\b|\bmugs?\b|spork|utensil|lighter|flint|coffee/i, 'Cooking'],
  [/fishing|\brods?\b|\breels?\b|tackle/i, 'Fishing'],
  [/tent|tarp|sleep|quilt|pillow|stakes?|cord/i, 'Shelter/Sleeping'],
  [/jacket|pants?|socks?|underwear|gloves?|mittens?|\bhats?\b|\bcaps?\b|boots?|gaiters?|shirt|sleeve|fleece|puffy|crocs|shoes?/i, 'Clothing packed'],
  [/\bpacks?\b/i, 'Backpack'],
]

function isHeader(cell) {
  const t = cell.trim()
  if (!t) return false
  if (t.endsWith(':')) return true
  const letters = t.replace(/[^a-zA-Z]/g, '')
  return letters.length >= 2 && t === t.toUpperCase()
}

function firstMatch(table, text) {
  const hit = table.find(([re]) => re.test(text))
  return hit ? hit[1] : null
}

function cleanName(cell) {
  return cell.trim().replace(/\?+$/, '').trim()
}

export function interpretSheet(grid) {
  const warnings = []
  const cols = Math.max(0, ...grid.map(r => r.length))
  const itemCols = []
  for (let c = 0; c < cols; c++) {
    if (grid.some(r => isHeader(r[c] ?? ''))) itemCols.push(c)
  }
  const groups = []
  for (const c of itemCols) {
    let group = null
    for (const row of grid) {
      const cell = (row[c] ?? '').trim()
      if (!cell) continue
      if (isHeader(cell)) {
        group = { header: cell, kind: FOOD_HEADER.test(cell) ? 'food' : 'gear', items: [] }
        groups.push(group)
        continue
      }
      if (!group) continue // stray cell above the column's first header
      const name = cleanName(cell)
      if (!name) continue
      const noteCol = c + 1
      const note = itemCols.includes(noteCol) ? '' : (row[noteCol] ?? '').trim()
      const item = { name, note }
      if (group.kind === 'gear') {
        item.category = firstMatch(HEADER_CATEGORY, group.header) ??
          firstMatch(NAME_CATEGORY, name) ?? 'Luxuries'
      }
      group.items.push(item)
    }
  }
  return { groups, plan: null, warnings }
}

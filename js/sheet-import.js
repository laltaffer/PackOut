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

// Scale guards (Codex, 2026-07-28): a 40,000-row hostile CSV must not become
// 4 MB of gear JSON that trips the server's state-size gate and locks the
// account out of syncing. Real packing sheets run well under both caps.
const MAX_ITEMS = 500
const MAX_PLAN_DAYS = 31

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

// Tabular shape: a header row naming an item column plus nutrition columns.
// Calories are the one non-negotiable — a food without kcal cannot enter the
// library, so a row whose calorie cell doesn't read as a number is reported.
const TABULAR_COLS = [
  ['name', /^(item|name|food|product|description)s?\b/i],
  // Word-bounded: "Caliber" contains cal and must never make a rifle table
  // read as food (Codex, 2026-07-28).
  ['kcal', /\b(cal(orie)?s?|kcal|energy)\b/i],
  ['proteinG', /protein/i],
  ['carbsG', /carb|cho\b/i],
  ['fatG', /fat/i],
  ['weightOz', /weight|\boz\b|ounce/i],
]

function findTabularHeader(grid) {
  for (const [r, row] of grid.entries()) {
    const map = {}
    for (const [c, cell] of row.entries()) {
      const t = cell.trim()
      if (!t) continue
      const hit = TABULAR_COLS.find(([key, re]) => !(key in map) && re.test(t))
      if (hit) map[hit[0]] = c
    }
    if ('name' in map && 'kcal' in map) return { row: r, map }
  }
  return null
}

function readTabular(grid, { row, map }) {
  const items = []
  for (const cells of grid.slice(row + 1)) {
    const name = cleanName(cells[map.name] ?? '')
    if (!name) continue
    const numAt = key => {
      if (!(key in map)) return null
      const v = parseFloat((cells[map[key]] ?? '').replace(/,/g, ''))
      return Number.isFinite(v) && v > 0 ? v : null
    }
    // A row whose calorie cell doesn't read as a number still reaches the
    // preview — with kcal null, so the inline field asks for the number
    // instead of the row silently vanishing.
    items.push({
      name, note: '', kcal: numAt('kcal'),
      proteinG: numAt('proteinG'), carbsG: numAt('carbsG'),
      fatG: numAt('fatG'), weightOz: numAt('weightOz'),
    })
  }
  return [{ header: 'Foods', kind: 'food', items }]
}

// Day plans import only from one unmistakable shape: "Day N" header cells
// with meal-label rows below. Anything less explicit is refused with a
// reason — a guessed plan is worse than no plan.
const DAY_HEADER = /^day\s*(\d+)\b/i
const MEAL_LABEL = /^(electrolytes?|breakfast|lunch|dinner|snacks?)[:.]?$/i
const MEAL_KEY = { electrolyte: 'electrolytes', snack: 'snacks' }

function readPlan(grid, warnings) {
  const dayCells = []
  for (const [r, row] of grid.entries()) {
    for (const [c, cell] of row.entries()) {
      const m = cell.trim().match(DAY_HEADER)
      if (m) dayCells.push({ r, c, n: parseInt(m[1], 10) })
    }
  }
  if (!dayCells.length) return { plan: null, planCols: new Set() }
  const planCols = new Set(dayCells.map(d => d.c))
  const ns = dayCells.map(d => d.n).sort((a, b) => a - b)
  const contiguous = ns.every((n, i) => n === i + 1)
  if (!contiguous) {
    warnings.push(`Found day headers (${ns.map(n => `Day ${n}`).join(', ')}) but not a clear Day 1…N sequence — the day plan was not imported.`)
    return { plan: null, planCols }
  }
  // No pack trip runs a month-plus; past that this is an itinerary or a
  // calendar, not a food plan.
  if (ns.length > MAX_PLAN_DAYS) {
    warnings.push(`Found ${ns.length} day headers — more than any packable trip, so the day plan was not imported.`)
    return { plan: null, planCols }
  }
  let unlabeled = false
  const days = dayCells.sort((a, b) => a.n - b.n).map(({ r, c, n }) => {
    const meals = { electrolytes: [], breakfast: [], lunch: [], dinner: [], snacks: [] }
    let meal = null // a food before any meal label makes the day a guess
    for (const row of grid.slice(r + 1)) {
      const cell = (row[c] ?? '').trim()
      if (!cell) continue
      if (DAY_HEADER.test(cell)) break // stacked layout: next day starts below
      const label = cell.match(MEAL_LABEL)
      if (label) {
        const raw = label[1].toLowerCase()
        meal = MEAL_KEY[raw] ?? raw
        continue
      }
      if (!meal) { unlabeled = true; break }
      meals[meal].push(cleanName(cell))
    }
    return { n, meals }
  })
  if (unlabeled) {
    warnings.push('Found day headers but no meal labels (Breakfast, Lunch, Dinner, Snacks) under them — the day plan was not imported.')
    return { plan: null, planCols }
  }
  if (!days.some(d => Object.values(d.meals).some(m => m.length))) {
    warnings.push('Found day headers but no foods under them — the day plan was not imported.')
    return { plan: null, planCols }
  }
  return { plan: { days }, planCols }
}

export function interpretSheet(grid) {
  const warnings = []
  const tabular = findTabularHeader(grid)
  if (tabular) {
    const groups = readTabular(grid, tabular)
    capItems(groups, warnings)
    return { groups, plan: null, warnings }
  }
  const { plan, planCols } = readPlan(grid, warnings)
  const cols = Math.max(0, ...grid.map(r => r.length))
  const itemCols = []
  for (let c = 0; c < cols; c++) {
    if (planCols.has(c)) continue
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
      const note = itemCols.includes(noteCol) || planCols.has(noteCol) ? '' : (row[noteCol] ?? '').trim()
      const item = { name, note }
      if (group.kind === 'gear') {
        item.category = firstMatch(HEADER_CATEGORY, group.header) ??
          firstMatch(NAME_CATEGORY, name) ?? 'Luxuries'
      }
      group.items.push(item)
    }
  }
  capItems(groups, warnings)
  return { groups, plan, warnings }
}

function capItems(groups, warnings) {
  let kept = 0
  let dropped = 0
  for (const g of groups) {
    const room = Math.max(0, MAX_ITEMS - kept)
    dropped += Math.max(0, g.items.length - room)
    g.items = g.items.slice(0, room)
    kept += g.items.length
  }
  if (dropped) warnings.push(`This sheet lists more than ${MAX_ITEMS} items — the first ${MAX_ITEMS} are shown and the remaining ${dropped} were left out.`)
}

// A plan's food names must all resolve against the library (imported foods
// included) or the plan does not import — half a plan would read as a
// planned day that quietly under-fuels. The libraries still import either way.
export function planToDays(plan, foods) {
  const byName = new Map(foods.map(f => [f.name.trim().toLowerCase(), f.id]))
  const missing = []
  const days = plan.days.map(({ meals }) => {
    const out = { intensity: 'medium', meals: {} }
    for (const [slot, names] of Object.entries(meals)) {
      const counts = new Map()
      for (const name of names) {
        const id = byName.get(name.trim().toLowerCase())
        if (!id) { if (!missing.includes(name)) missing.push(name); continue }
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      out.meals[slot] = [...counts].map(([foodId, qty]) => ({ foodId, qty }))
    }
    return out
  })
  return missing.length ? { days: null, missing } : { days, missing }
}

// Skip-duplicates is the import's contract: seed data and user edits are
// never clobbered. Food and gear namespaces are separate — "Bear Spray" in
// the food library says nothing about the gear item.
export function markDuplicates(result, { library, gearLibrary }) {
  const seen = {
    food: new Set(library.map(f => f.name.trim().toLowerCase())),
    gear: new Set(gearLibrary.map(g => g.name.trim().toLowerCase())),
  }
  for (const group of result.groups) {
    for (const item of group.items) {
      const key = item.name.toLowerCase()
      if (seen[group.kind].has(key)) item.dup = true
      else seen[group.kind].add(key)
    }
  }
  return result
}

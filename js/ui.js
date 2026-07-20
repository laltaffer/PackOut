// UI layer — renders state, dispatches events. No nutrition logic lives here.

import { dailyTargets, slotTargets, sumEntries, dayTotals, emptyMeals, dayVerdict, tripVerdict, stapleIds, suggestions } from './engine.js'
import { load, save, newId } from './store.js'

const app = document.getElementById('app')
let state = load()

const INTENSITIES = ['easy', 'medium', 'hard']

// ---------- routing (hash-based so the phone back button works) ----------

function route() {
  const hash = location.hash || '#/'
  const pickMatch = hash.match(/^#\/trip\/(.+)\/day\/(\d+)\/add\/([a-z]+(?:-\d+)?)$/)
  if (pickMatch) {
    const trip = state.trips.find(t => t.id === pickMatch[1])
    if (trip && trip.days[Number(pickMatch[2])]) return renderPicker(trip, Number(pickMatch[2]), pickMatch[3])
  }
  const dayMatch = hash.match(/^#\/trip\/(.+)\/day\/(\d+)$/)
  if (dayMatch) {
    const trip = state.trips.find(t => t.id === dayMatch[1])
    if (trip && trip.days[Number(dayMatch[2])]) return renderDay(trip, Number(dayMatch[2]))
  }
  const tripMatch = hash.match(/^#\/trip\/([^/]+)$/)
  if (tripMatch) {
    const trip = state.trips.find(t => t.id === tripMatch[1])
    if (trip) return renderTrip(trip)
  }
  const editMatch = hash.match(/^#\/library\/edit\/(.+)$/)
  if (editMatch) {
    const food = state.library.find(f => f.id === editMatch[1])
    if (food) return renderFoodForm(food)
  }
  if (hash === '#/library/new') return renderFoodForm(null)
  if (hash === '#/library') return renderLibrary()
  if (hash === '#/new') return renderNewTrip()
  renderDashboard()
}

window.addEventListener('hashchange', route)

// ---------- helpers ----------

function commit() {
  save(state)
  route()
}

function el(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function dayDate(trip, i) {
  const [y, m, d] = trip.startDate.split('-').map(Number)
  const date = new Date(y, m - 1, d + i)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function tripDateRange(trip) {
  return `${dayDate(trip, 0)} → ${dayDate(trip, trip.days.length - 1)}`
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ---------- dashboard ----------

function renderDashboard() {
  const trips = [...state.trips].sort((a, b) => b.startDate.localeCompare(a.startDate))
  app.replaceChildren(el(`
    <section class="dashboard">
      <div class="dashboard-head">
        <h1>Trips</h1>
        <a class="btn btn-primary" href="#/new">New Trip</a>
      </div>
      ${trips.length === 0 ? `
        <div class="empty">
          <p><strong>No trips yet.</strong></p>
          <p>Start with where you're going and how long you'll be out — PackOut computes what it takes to stay fueled.</p>
        </div>` : `
        <ul class="trip-cards">
          ${trips.map(t => `
            <li class="trip-card">
              <a href="#/trip/${t.id}" class="trip-card-link">
                <span class="trip-name">${esc(t.name)}</span>
                <span class="trip-dest">${esc(t.destination)}</span>
                <span class="trip-meta mono">${tripDateRange(t)} · ${t.days.length} days</span>
              </a>
              <button class="btn-quiet" data-del="${t.id}" aria-label="Delete ${esc(t.name)}">Delete</button>
            </li>`).join('')}
        </ul>`}
    </section>
  `))
  app.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
    const trip = state.trips.find(t => t.id === btn.dataset.del)
    if (confirm(`Delete "${trip.name}" and its whole plan?`)) {
      state.trips = state.trips.filter(t => t.id !== trip.id)
      commit()
    }
  }))
}

// ---------- new trip ----------

function renderNewTrip() {
  const last = [...state.trips].sort((a, b) => b.createdAt - a.createdAt)[0]
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/" class="crumb">&larr; Trips</a>
      <h1>New Trip</h1>
      <form id="new-trip">
        <label>Trip name
          <input name="name" required placeholder="Alaska Caribou 2026">
        </label>
        <label>Destination
          <input name="destination" required placeholder="Brooks Range, AK">
        </label>
        <label>Start date
          <input name="startDate" type="date" required>
        </label>
        <label>Days
          <input name="days" type="number" min="1" max="30" required value="5">
        </label>
        <label>Your body weight (lbs)
          <input name="weightLbs" type="number" min="50" max="400" required value="${last ? last.weightLbs : ''}">
          <small>Drives your daily calorie and macro targets. Use goal weight if you prefer.</small>
        </label>
        <button class="btn btn-primary" type="submit">Create Trip</button>
      </form>
    </section>
  `))
  document.getElementById('new-trip').addEventListener('submit', e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const trip = {
      id: newId(),
      createdAt: Date.now(),
      name: f.get('name').trim(),
      destination: f.get('destination').trim(),
      startDate: f.get('startDate'),
      weightLbs: Number(f.get('weightLbs')),
      days: Array.from({ length: Number(f.get('days')) }, () => ({ intensity: 'medium' })),
    }
    state.trips.push(trip)
    save(state)
    location.hash = `#/trip/${trip.id}`
  })
}

// ---------- trip view ----------

function renderTrip(trip) {
  const anyPlanned = trip.days.some(d => dayTotals(d, state.library).kcal > 0)
  const tv = tripVerdict(trip, state.library)
  const rollup = !anyPlanned ? '' : tv.fueled
    ? `<p class="trip-rollup rollup-fueled">Every day Fueled${tv.heavyDays.length ? ` · ${tv.heavyDays.length} heavy` : ''}</p>`
    : `<p class="trip-rollup rollup-short">${tv.shortDays.length} day${tv.shortDays.length > 1 ? 's' : ''} short: ${tv.shortDays.map(i => `Day ${i + 1}`).join(', ')}</p>`
  app.replaceChildren(el(`
    <section class="trip">
      <a href="#/" class="crumb">&larr; Trips</a>
      <div class="trip-head">
        <h1>${esc(trip.name)}</h1>
        <p class="trip-sub">${esc(trip.destination)} · <span class="mono">${tripDateRange(trip)}</span> · ${trip.weightLbs} lbs</p>
        ${rollup}
      </div>
      <ol class="days">
        ${trip.days.map((day, i) => dayCard(trip, day, i)).join('')}
      </ol>
    </section>
  `))
  app.querySelectorAll('[data-day]').forEach(sel => sel.addEventListener('change', () => {
    trip.days[Number(sel.dataset.day)].intensity = sel.value
    commit()
  }))
}

function dayCard(trip, day, i) {
  const t = dailyTargets(trip.weightLbs, day.intensity)
  const planned = dayTotals(day, state.library)
  return `
    <li class="day-card">
      <div class="day-head">
        <span class="day-label">Day ${i + 1}</span>
        ${planned.kcal > 0 ? verdictBadge(dayVerdict(day, trip.weightLbs, state.library)) : ''}
        <span class="day-date">${dayDate(trip, i)}</span>
        <label class="intensity">
          <span class="visually-hidden">Intensity for day ${i + 1}</span>
          <select data-day="${i}">
            ${INTENSITIES.map(x => `<option value="${x}" ${x === day.intensity ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}
          </select>
        </label>
      </div>
      <dl class="targets mono">
        <div><dt>kcal</dt><dd>${fmt(t.kcal.target)}</dd></div>
        <div><dt>Carbs</dt><dd>${t.carbsG.min}–${t.carbsG.max} g</dd></div>
        <div><dt>Protein</dt><dd>${t.proteinG.min}–${t.proteinG.max} g<span class="floor">floor ${t.proteinG.floor} g</span></dd></div>
        <div><dt>Fat</dt><dd>${t.fatG.min}–${t.fatG.max} g</dd></div>
      </dl>
      <a class="btn day-plan-link" href="#/trip/${trip.id}/day/${i}">
        ${planned.kcal > 0 ? `${planned.kcal.toLocaleString()} kcal planned · edit` : 'Plan meals'}
      </a>
    </li>`
}

// ---------- verdicts ----------

const VERDICT_LABELS = { fueled: 'Fueled', short: 'Short', heavy: 'Heavy' }

function verdictBadge(v) {
  return `<span class="badge badge-${v.status}">${VERDICT_LABELS[v.status]}</span>`
}

function gapSentence(v) {
  if (v.status === 'heavy') return `${v.kcalOver.toLocaleString()} kcal over the 115% line — extra weight, your call.`
  const parts = []
  parts.push(v.kcalShort > 0 ? `${v.kcalShort.toLocaleString()} kcal short` : 'calories fine')
  parts.push(v.proteinShortG > 0 ? `${v.proteinShortG} g protein short` : 'protein fine')
  return parts.join(' · ')
}

// ---------- day meal builder ----------

const SLOT_LABELS = { electrolytes: 'Electrolytes / Fluid', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function foodName(id) {
  const f = state.library.find(x => x.id === id)
  return f ? f.name : '(deleted food)'
}

function entryRows(entries, slotKey) {
  return entries.map((e, j) => {
    const f = state.library.find(x => x.id === e.foodId)
    return `
      <li class="entry">
        <span class="entry-name">${esc(foodName(e.foodId))}</span>
        <span class="entry-kcal mono">${f ? (f.kcal * e.qty).toLocaleString() + ' kcal' : '—'}</span>
        <span class="entry-ctl">
          <button data-qty="${slotKey}:${j}:-1" aria-label="Less ${esc(foodName(e.foodId))}">−</button>
          <span class="qty mono">${e.qty}</span>
          <button data-qty="${slotKey}:${j}:1" aria-label="More ${esc(foodName(e.foodId))}">+</button>
          <button data-rm="${slotKey}:${j}" aria-label="Remove ${esc(foodName(e.foodId))}">×</button>
        </span>
      </li>`
  }).join('')
}

function slotSection(trip, i, slotKey, entries, targetLine) {
  const sub = sumEntries(entries, state.library)
  return `
    <section class="slot">
      <div class="slot-head">
        <h2>${SLOT_LABELS[slotKey]}</h2>
        ${targetLine ? `<span class="slot-target mono">${targetLine}</span>` : ''}
      </div>
      <ul class="entries">${entryRows(entries, slotKey)}</ul>
      <div class="slot-foot">
        <a class="btn-add" href="#/trip/${trip.id}/day/${i}/add/${slotKey}">+ Add food</a>
        ${entries.length ? `<span class="slot-sub mono">${sub.kcal.toLocaleString()} kcal · C ${sub.carbsG}g · P ${sub.proteinG}g</span>` : ''}
      </div>
    </section>`
}

function renderDay(trip, i) {
  const day = trip.days[i]
  day.meals ??= emptyMeals()
  const targets = dailyTargets(trip.weightLbs, day.intensity)
  const st = slotTargets(targets)
  const totals = dayTotals(day, state.library)
  const otherDays = trip.days.map((_, j) => j).filter(j => j !== i)
  const v = dayVerdict(day, trip.weightLbs, state.library)
  const staples = stapleIds(state.trips)
  const suggs = v.status === 'short'
    ? suggestions({ kcalShort: v.kcalShort, proteinShortG: v.proteinShortG }, state.library, staples)
    : []
  const verdictBlock = totals.kcal === 0 ? '' : `
    <div class="verdict verdict-${v.status}">
      ${verdictBadge(v)}
      <span class="gap">${gapSentence(v)}</span>
      ${suggs.length ? `
        <div class="suggs">
          ${suggs.map(f => `
            <button class="sugg" data-sugg="${f.id}">
              + ${esc(f.name)} <span class="mono">${f.kcal} kcal${v.proteinShortG > 0 && f.proteinG ? ` · ${f.proteinG}g P` : ''}</span>
            </button>`).join('')}
        </div>` : ''}
    </div>`
  app.replaceChildren(el(`
    <section class="day-screen">
      <a href="#/trip/${trip.id}" class="crumb">&larr; ${esc(trip.name)}</a>
      <div class="day-screen-head">
        <h1>Day ${i + 1}</h1>
        <span class="day-date">${dayDate(trip, i)}</span>
        <label class="intensity">
          <span class="visually-hidden">Intensity</span>
          <select id="day-intensity">
            ${INTENSITIES.map(x => `<option value="${x}" ${x === day.intensity ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}
          </select>
        </label>
      </div>
      <dl class="targets day-totals mono">
        <div><dt>kcal</dt><dd>${totals.kcal.toLocaleString()} / ${fmt(targets.kcal.target)}</dd></div>
        <div><dt>Carbs</dt><dd>${totals.carbsG} / ${targets.carbsG.min}–${targets.carbsG.max} g</dd></div>
        <div><dt>Protein</dt><dd>${totals.proteinG} / floor ${targets.proteinG.floor} g</dd></div>
        <div><dt>Weight</dt><dd>${totals.weightOz} oz${totals.missingWeightCount ? ` <span class="floor">+${totals.missingWeightCount} unweighed</span>` : ''}</dd></div>
        ${totals.calsPerOz ? `<div><dt>Cals/oz</dt><dd>${totals.calsPerOz}</dd></div>` : ''}
      </dl>
      ${verdictBlock}
      ${slotSection(trip, i, 'electrolytes', day.meals.electrolytes, '')}
      ${slotSection(trip, i, 'breakfast', day.meals.breakfast, `${st.breakfast.kcalMin}–${st.breakfast.kcalMax} kcal · ${st.breakfast.carbsMinG}–${st.breakfast.carbsMaxG}g C`)}
      ${slotSection(trip, i, 'lunch', day.meals.lunch, '')}
      ${slotSection(trip, i, 'dinner', day.meals.dinner, `~${st.dinner.kcal} kcal · ≥${st.dinner.carbsMinG}g C · ≥${st.dinner.proteinMinG}g P`)}
      <section class="slot">
        <div class="slot-head">
          <h2>Snacks</h2>
          <span class="slot-target mono">each ~${st.snack.kcal} kcal · ${st.snack.carbsMinG}–${st.snack.carbsMaxG}g C</span>
        </div>
        ${day.meals.snacks.map((snack, sIdx) => {
          const sub = sumEntries(snack.items, state.library)
          return `
          <div class="snack-bundle">
            <div class="snack-head">
              <h3>Snack ${sIdx + 1}</h3>
              <span class="slot-sub mono">${sub.kcal.toLocaleString()} kcal · C ${sub.carbsG}g</span>
              <button data-rm-snack="${sIdx}" aria-label="Remove snack ${sIdx + 1}">×</button>
            </div>
            <ul class="entries">${entryRows(snack.items, `snack-${sIdx}`)}</ul>
            <a class="btn-add" href="#/trip/${trip.id}/day/${i}/add/snack-${sIdx}">+ Add item</a>
          </div>`
        }).join('')}
        <button class="btn" id="add-snack">+ Add Snack</button>
      </section>
      ${otherDays.length ? `
      <section class="copy-day">
        <label>Copy this day's plan to
          <select id="copy-target">
            ${otherDays.map(j => `<option value="${j}">Day ${j + 1} — ${dayDate(trip, j)}</option>`).join('')}
          </select>
        </label>
        <button class="btn" id="copy-apply">Copy</button>
      </section>` : ''}
    </section>
  `))

  document.getElementById('day-intensity').addEventListener('change', e => {
    day.intensity = e.target.value
    commit()
  })
  document.getElementById('add-snack').addEventListener('click', () => {
    day.meals.snacks.push({ items: [] })
    commit()
  })
  const copyApply = document.getElementById('copy-apply')
  if (copyApply) copyApply.addEventListener('click', () => {
    const j = Number(document.getElementById('copy-target').value)
    if (confirm(`Replace Day ${j + 1}'s plan with Day ${i + 1}'s?`)) {
      trip.days[j].meals = structuredClone(day.meals)
      save(state)
      location.hash = `#/trip/${trip.id}/day/${j}`
    }
  })

  const slotEntries = key => key.startsWith('snack-')
    ? day.meals.snacks[Number(key.slice(6))].items
    : day.meals[key]
  app.querySelectorAll('[data-qty]').forEach(btn => btn.addEventListener('click', () => {
    const [key, j, delta] = btn.dataset.qty.split(':')
    const entry = slotEntries(key)[Number(j)]
    entry.qty = Math.max(1, entry.qty + Number(delta))
    commit()
  }))
  app.querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', () => {
    const [key, j] = btn.dataset.rm.split(':')
    slotEntries(key).splice(Number(j), 1)
    commit()
  }))
  app.querySelectorAll('[data-rm-snack]').forEach(btn => btn.addEventListener('click', () => {
    day.meals.snacks.splice(Number(btn.dataset.rmSnack), 1)
    commit()
  }))
  app.querySelectorAll('[data-sugg]').forEach(btn => btn.addEventListener('click', () => {
    const food = state.library.find(f => f.id === btn.dataset.sugg)
    if (!food) return
    if (food.slotHint === 'snack') {
      day.meals.snacks.push({ items: [{ foodId: food.id, qty: 1 }] })
    } else {
      const entries = day.meals[food.slotHint] ?? day.meals.lunch
      const existing = entries.find(e => e.foodId === food.id)
      if (existing) existing.qty += 1
      else entries.push({ foodId: food.id, qty: 1 })
    }
    commit()
  }))
}

let pickerSearch = ''

function renderPicker(trip, i, slotKey) {
  const day = trip.days[i]
  day.meals ??= emptyMeals()
  const slotBase = slotKey.startsWith('snack-') ? 'snack' : slotKey
  const q = pickerSearch.trim().toLowerCase()
  const staples = stapleIds(state.trips)
  const foods = state.library
    .filter(f => !q || f.name.toLowerCase().includes(q))
    .sort((a, b) =>
      (b.favorite - a.favorite) ||
      (staples.has(b.id) - staples.has(a.id)) ||
      ((b.slotHint === slotBase) - (a.slotHint === slotBase)) ||
      a.name.localeCompare(b.name))
  const slotLabel = slotKey.startsWith('snack-') ? `Snack ${Number(slotKey.slice(6)) + 1}` : SLOT_LABELS[slotKey]
  app.replaceChildren(el(`
    <section class="picker">
      <a href="#/trip/${trip.id}/day/${i}" class="crumb">&larr; Day ${i + 1}</a>
      <h1>Add to ${slotLabel}</h1>
      <input id="picker-search" type="search" placeholder="Search foods…" value="${esc(pickerSearch)}" aria-label="Search foods">
      <ul class="food-list">
        ${foods.map(f => `
          <li class="food-row">
            <button class="food-pick" data-pick="${f.id}">
              <span class="food-name">${f.favorite ? '★ ' : ''}${esc(f.name)}${staples.has(f.id) ? ' <span class="staple-tag">every time</span>' : ''}</span>
              <span class="food-macros mono">${macroLine(f)}</span>
            </button>
          </li>`).join('')}
      </ul>
    </section>
  `))
  const search = document.getElementById('picker-search')
  search.addEventListener('input', () => {
    pickerSearch = search.value
    renderPicker(trip, i, slotKey)
    const s = document.getElementById('picker-search')
    s.focus()
    s.setSelectionRange(s.value.length, s.value.length)
  })
  app.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
    const entries = slotKey.startsWith('snack-')
      ? day.meals.snacks[Number(slotKey.slice(6))].items
      : day.meals[slotKey]
    const existing = entries.find(e => e.foodId === btn.dataset.pick)
    if (existing) existing.qty += 1
    else entries.push({ foodId: btn.dataset.pick, qty: 1 })
    save(state)
    pickerSearch = ''
    location.hash = `#/trip/${trip.id}/day/${i}`
  }))
}

// ---------- food library ----------

const SLOT_HINTS = ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snack']
let librarySearch = ''

function macroLine(f) {
  const g = v => v === null ? '—' : `${v}g`
  const oz = f.weightOz === null ? '— oz' : `${f.weightOz} oz`
  return `${f.kcal} kcal · C ${g(f.carbsG)} · F ${g(f.fatG)} · P ${g(f.proteinG)} · ${oz}`
}

function renderLibrary() {
  const q = librarySearch.trim().toLowerCase()
  const foods = state.library
    .filter(f => !q || f.name.toLowerCase().includes(q))
    .sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name))
  app.replaceChildren(el(`
    <section class="library">
      <div class="dashboard-head">
        <h1>Library</h1>
        <a class="btn btn-primary" href="#/library/new">Add Food</a>
      </div>
      <input id="lib-search" type="search" placeholder="Search ${state.library.length} foods…" value="${esc(librarySearch)}" aria-label="Search foods">
      <ul class="food-list">
        ${foods.map(f => `
          <li class="food-row">
            <button class="fav ${f.favorite ? 'is-fav' : ''}" data-fav="${f.id}" aria-pressed="${f.favorite}" aria-label="Favorite ${esc(f.name)}">★</button>
            <a class="food-link" href="#/library/edit/${f.id}">
              <span class="food-name">${esc(f.name)}</span>
              <span class="food-macros mono">${macroLine(f)}</span>
            </a>
          </li>`).join('')}
      </ul>
      ${foods.length === 0 ? '<p class="empty">No foods match.</p>' : ''}
    </section>
  `))
  const search = document.getElementById('lib-search')
  search.addEventListener('input', () => {
    librarySearch = search.value
    // Re-render the list only, preserving input focus.
    const keep = document.activeElement === search
    renderLibrary()
    if (keep) {
      const s = document.getElementById('lib-search')
      s.focus()
      s.setSelectionRange(s.value.length, s.value.length)
    }
  })
  app.querySelectorAll('[data-fav]').forEach(btn => btn.addEventListener('click', () => {
    const food = state.library.find(f => f.id === btn.dataset.fav)
    food.favorite = !food.favorite
    save(state)
    renderLibrary()
  }))
}

function renderFoodForm(food) {
  const isNew = food === null
  const numOrBlank = v => v === null || v === undefined ? '' : v
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/library" class="crumb">&larr; Library</a>
      <h1>${isNew ? 'Add Food' : 'Edit Food'}</h1>
      <form id="food-form">
        <label>Name
          <input name="name" required value="${isNew ? '' : esc(food.name)}" placeholder="Peak Chicken Teriyaki">
        </label>
        <label>Calories (whole item as you pack it)
          <input name="kcal" type="number" min="1" step="any" required value="${isNew ? '' : food.kcal}">
        </label>
        <div class="macro-grid">
          <label>Carbs g
            <input name="carbsG" type="number" min="0" step="any" value="${isNew ? '' : numOrBlank(food.carbsG)}">
          </label>
          <label>Fat g
            <input name="fatG" type="number" min="0" step="any" value="${isNew ? '' : numOrBlank(food.fatG)}">
          </label>
          <label>Protein g
            <input name="proteinG" type="number" min="0" step="any" value="${isNew ? '' : numOrBlank(food.proteinG)}">
          </label>
          <label>Weight oz
            <input name="weightOz" type="number" min="0.05" step="any" value="${isNew ? '' : numOrBlank(food.weightOz)}">
          </label>
        </div>
        <small>Leave a field blank if the label doesn't say — blanks show as “—” and count as 0.</small>
        <label>Usual slot
          <select name="slotHint">
            ${SLOT_HINTS.map(s => `<option value="${s}" ${!isNew && food.slotHint === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-primary" type="submit">${isNew ? 'Add to Library' : 'Save'}</button>
        ${isNew ? '' : `<button class="btn-quiet" type="button" id="food-delete">Delete this food</button>`}
      </form>
    </section>
  `))
  document.getElementById('food-form').addEventListener('submit', e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const num = k => f.get(k) === '' ? null : Number(f.get(k))
    const values = {
      name: f.get('name').trim(),
      kcal: Number(f.get('kcal')),
      carbsG: num('carbsG'),
      fatG: num('fatG'),
      proteinG: num('proteinG'),
      weightOz: num('weightOz'),
      slotHint: f.get('slotHint'),
    }
    if (isNew) {
      state.library.push({ id: newId(), favorite: false, ...values })
    } else {
      Object.assign(food, values)
    }
    save(state)
    location.hash = '#/library'
  })
  if (!isNew) {
    document.getElementById('food-delete').addEventListener('click', () => {
      if (confirm(`Delete "${food.name}" from the library?`)) {
        state.library = state.library.filter(x => x.id !== food.id)
        save(state)
        location.hash = '#/library'
      }
    })
  }
}

route()

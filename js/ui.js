// UI layer — renders state, dispatches events. No nutrition logic lives here.

import { dailyTargets } from './engine.js'
import { load, save, newId } from './store.js'

const app = document.getElementById('app')
let state = load()

const INTENSITIES = ['easy', 'medium', 'hard']

// ---------- routing (hash-based so the phone back button works) ----------

function route() {
  const hash = location.hash || '#/'
  const tripMatch = hash.match(/^#\/trip\/(.+)$/)
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
  app.replaceChildren(el(`
    <section class="trip">
      <a href="#/" class="crumb">&larr; Trips</a>
      <div class="trip-head">
        <h1>${esc(trip.name)}</h1>
        <p class="trip-sub">${esc(trip.destination)} · <span class="mono">${tripDateRange(trip)}</span> · ${trip.weightLbs} lbs</p>
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
  return `
    <li class="day-card">
      <div class="day-head">
        <span class="day-label">Day ${i + 1}</span>
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
    </li>`
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

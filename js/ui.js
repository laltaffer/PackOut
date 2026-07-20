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

route()

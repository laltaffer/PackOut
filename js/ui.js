// UI layer — renders state, dispatches events. No nutrition logic lives here.

import { dailyTargets, slotTargets, sumEntries, dayTotals, emptyMeals, dayVerdict, tripVerdict, stapleIds, suggestions, pickerRank, groceryList, dayPackList, readiness, validateImport, plannedDayOptions, gearStats, flyIssues, declinedIds, draftDay, draftEmptyDays, mealStyleOf, resolveSignIn } from './engine.js'
import { load, save, newId, corruptInfo, cacheOwner, setCacheOwner, clearCache } from './store.js'
import { applySeedMigrations, needsProfile, emptyProfile, applyProfile, skipProfile, tripGearQuestions, tripTypes, kitRows, applyTripKit, copyKit, genericGearName, gearCatalogMatches, BRANDS, TRIP_TYPES, GEAR_CATEGORIES } from './seed.js'
import { configureSync, initAccount, account, syncStatus, syncNow, signOut, flushPush, mountSignInButton, schedulePush } from './sync.js'

const app = document.getElementById('app')

// null until a profile (or field mode) materializes it — route() gates on it,
// so no trip data ever renders signed out.
let state = null

// Deploys stamp ?v=<commit> on this module's URL; surfacing it answers
// "which version is this browser actually running?" at a glance.
const BUILD = new URL(import.meta.url).searchParams.get('v') ?? 'dev'

const INTENSITIES = ['easy', 'medium', 'hard']

// ---------- routing (hash-based so the phone back button works) ----------

function route() {
  // The account chip lives in the masthead, so signing out is reachable from
  // every screen — not just the dashboard.
  renderAccountChip()
  if (!state) return renderGate()
  updateNav()
  const hash = location.hash || '#/'
  const pickMatch = hash.match(/^#\/trip\/(.+)\/day\/(\d+)\/add\/([a-z]+(?:-\d+)?)$/)
  if (pickMatch) {
    const trip = state.trips.find(t => t.id === pickMatch[1])
    if (trip && trip.days[Number(pickMatch[2])]) return renderPicker(trip, Number(pickMatch[2]), pickMatch[3])
  }
  const gearAddMatch = hash.match(/^#\/trip\/(.+)\/gear\/add$/)
  if (gearAddMatch) {
    const trip = state.trips.find(t => t.id === gearAddMatch[1])
    if (trip) return renderGearPicker(trip)
  }
  const kitMatch = hash.match(/^#\/trip\/(.+)\/gear\/kit$/)
  if (kitMatch) {
    const trip = state.trips.find(t => t.id === kitMatch[1])
    if (trip) return renderKitQuestions(trip)
  }
  const outMatch = hash.match(/^#\/trip\/(.+)\/(grocery|pack|ready|gear)$/)
  if (outMatch) {
    const trip = state.trips.find(t => t.id === outMatch[1])
    if (trip) {
      if (outMatch[2] === 'grocery') return renderGrocery(trip)
      if (outMatch[2] === 'pack') return renderPack(trip)
      if (outMatch[2] === 'gear') { gearRowEditId = null; return renderGear(trip) }
      return renderReady(trip)
    }
  }
  // The separate day editor retired into the board (Lawrence 2026-07-27) —
  // old links and bookmarks land on the surface that now does its job.
  const editDayMatch = hash.match(/^#\/trip\/(.+)\/day\/(\d+)\/edit$/)
  if (editDayMatch) {
    location.replace(`#/trip/${editDayMatch[1]}/day/${editDayMatch[2]}`)
    return
  }
  // Day summary opens ON the trip surface (unified strip→board morph).
  const dayMatch = hash.match(/^#\/trip\/(.+)\/day\/(\d+)$/)
  if (dayMatch) {
    const trip = state.trips.find(t => t.id === dayMatch[1])
    if (trip && trip.days[Number(dayMatch[2])]) return renderTrip(trip, Number(dayMatch[2]))
  }
  const editTripMatch = hash.match(/^#\/trip\/(.+)\/edit$/)
  if (editTripMatch) {
    const trip = state.trips.find(t => t.id === editTripMatch[1])
    if (trip) return renderEditTrip(trip)
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
  if (hash === '#/profile') return renderProfile()
  renderDashboard()
}

window.addEventListener('hashchange', route)

// Masthead nav is navigation, not tabs/filters — mark the active section.
function updateNav() {
  const inLibrary = (location.hash || '#/').startsWith('#/library')
  // Direct children only — the account chip's profile link is navigation for
  // the person, not a section, and must never wear the active underline.
  document.querySelectorAll('.masthead-nav > a').forEach(a => {
    const isLibrary = a.getAttribute('href') === '#/library'
    a.classList.toggle('is-active', isLibrary === inLibrary)
  })
}

// ---------- helpers ----------

let warnedSaveFailure = false

function persist() {
  if (save(state)) {
    schedulePush()
    return true
  }
  if (!warnedSaveFailure) {
    warnedSaveFailure = true
    alert('Saving failed — browser storage is full or blocked. Your latest change may not survive a reload. Export a backup from the Trips screen now.')
  }
  return false
}

function commit() {
  persist()
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
  return Math.round(n).toLocaleString()
}

// What the destination lookup found, as one line. `last-year` is labelled as
// history so nothing here reads as a promise about the week ahead.
function conditionsLine(trip) {
  const p = trip.place
  if (!p) return ''
  const bits = [p.label]
  if (p.elevationFt !== null) bits.push(`${p.elevationFt.toLocaleString()} ft`)
  const c = p.climate
  if (c) {
    if (c.tempLoF !== null && c.tempHiF !== null) bits.push(`${c.tempLoF}–${c.tempHiF}°F`)
    if (c.precipDays !== null) bits.push(`rain ${c.precipDays} of ${c.days} days`)
    bits.push(c.source === 'forecast' ? 'forecast' : 'last year, same week')
  }
  return bits.join(' · ')
}

// One caller for the product-page endpoint, shared by the food form, the gear
// picker and the kit questions. Never throws — a dead fetch service is a
// message, not a broken screen.
async function fetchProduct(url) {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.status === 401) return { ok: false, error: 'Sign in to fetch product pages.' }
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      return { ok: false, error: `${data?.error ?? `Couldn’t fetch that page (HTTP ${res.status}).`} Enter it by hand.` }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: 'Couldn’t reach the fetch service — enter it by hand.' }
  }
}

// Destination lookup (Lawrence 2026-07-27). Advisory: a miss leaves the typed
// destination exactly as typed and the trip saves anyway.
async function lookupDestination(query, startDate, days) {
  try {
    const res = await fetch('/api/place', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, startDate, days }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return { ok: false, error: data?.error ?? 'Lookup unavailable.' }
    return { ok: true, place: data }
  } catch {
    return { ok: false, error: 'Lookup unavailable — the trip keeps what you typed.' }
  }
}

// ---------- dashboard ----------

function renderDashboard() {
  // Upcoming trips first (soonest on top), past trips after (newest first,
  // oldest sinking to the bottom).
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = state.trips.filter(t => t.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const past = state.trips.filter(t => t.startDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const trips = [...upcoming, ...past]
  const corrupt = corruptInfo()
  app.replaceChildren(el(`
    <section class="dashboard">
      ${corrupt ? `
      <div class="corrupt-banner" role="alert">
        <strong>Stored data couldn't be read</strong> — PackOut started fresh, but a copy of the
        unreadable data was kept. <button class="btn-quiet" id="corrupt-download">Download it</button>
        in case it can be rescued.
      </div>` : ''}
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
                ${(() => {
                  if (!t.days.some(d => dayTotals(d, state.library).kcal > 0)) return ''
                  const tv = tripVerdict(t, state.library)
                  return tv.fueled
                    ? '<span class="trip-rollup rollup-fueled">Outlook · every day Fueled</span>'
                    : `<span class="trip-rollup rollup-short">Outlook · ${tv.shortDays.length} day${tv.shortDays.length > 1 ? 's' : ''} short</span>`
                })()}
              </a>
              <button class="btn-quiet" data-del="${t.id}" aria-label="Delete ${esc(t.name)}">Delete</button>
            </li>`).join('')}
        </ul>`}
      <section class="backup">
        <h2>Backup</h2>
        <p>${account() ? 'Your data syncs to your profile.' : 'Offline — changes wait on this device until you reconnect.'} Export before the trip.</p>
        <div class="backup-actions">
          <button class="btn" id="export">Export JSON</button>
          <label class="btn btn-file">Import JSON<input type="file" id="import" accept="application/json,.json"></label>
        </div>
      </section>
      <p class="build-stamp mono">build ${esc(BUILD)}</p>
    </section>
  `))
  app.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
    const trip = state.trips.find(t => t.id === btn.dataset.del)
    if (confirm(`Delete "${trip.name}" and its whole plan?`)) {
      state.trips = state.trips.filter(t => t.id !== trip.id)
      commit()
    }
  }))
  const corruptBtn = document.getElementById('corrupt-download')
  if (corruptBtn) corruptBtn.addEventListener('click', () => {
    const blob = new Blob([corruptInfo().raw], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'packout-corrupt-recovery.json'
    a.click()
    URL.revokeObjectURL(a.href)
  })
  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `packout-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  })
  document.getElementById('import').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    let data
    try {
      data = JSON.parse(await file.text())
    } catch {
      alert('That file is not valid JSON.')
      return
    }
    const check = validateImport(data)
    if (!check.ok) {
      alert(`Import rejected: ${check.error} Nothing was changed.`)
      return
    }
    const ok = confirm(
      `Replace current data (${state.trips.length} trips, ${state.library.length} foods) ` +
      `with this backup (${data.trips.length} trips, ${data.library.length} foods)?`)
    if (!ok) return
    applySeedMigrations(data) // older exports get current seed names/removals
    // Write-through: the backup must reach disk before it becomes the live
    // state, so a quota failure can't strand memory and disk out of sync.
    if (!save(data)) {
      alert('Import failed to save — browser storage is full or blocked. Nothing was changed.')
      return
    }
    state = data
    schedulePush()
    route()
  })
}

// ---------- new trip ----------

const STYLE_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function mealStyleFields(style) {
  const options = v => `
    <option value="mobile"${v === 'mobile' ? ' selected' : ''}>Mobile &mdash; grab &amp; go</option>
    <option value="sitdown"${v === 'sitdown' ? ' selected' : ''}>Sit-down &mdash; cook OK</option>`
  return `
    <fieldset class="meal-style">
      <legend>Meal style</legend>
      <small>Mobile meals never draft cook foods; sit-down meals welcome dehydrated
      pouches. You can always add any food to any meal by hand.</small>
      ${Object.entries(STYLE_LABELS).map(([slot, label]) => `
        <label>${label}
          <select name="style-${slot}">${options(style[slot])}</select>
        </label>`).join('')}
    </fieldset>`
}

// A trip can be several things at once — an Alaska hunt that also fishes.
// The picks decide which gear questions its kit screen asks.
function tripTypeFields(selected) {
  return `
    <fieldset class="onboard-q trip-types">
      <legend>What kind of trip is this?</legend>
      <p class="onboard-q-hint">Pick everything you'll do — each one adds its own gear questions.</p>
      <div class="onboard-opts">
        ${TRIP_TYPES.map(t => `
          <label class="onboard-option">
            <input type="checkbox" name="tripType" value="${t}"${selected.includes(t) ? ' checked' : ''}>
            <span>${TRIP_TYPE_LABELS[t]}</span>
          </label>`).join('')}
      </div>
    </fieldset>`
}

// The destination resolves while the form is still open (Lawrence 2026-07-27:
// "on-the-fly lookup"). Advisory throughout — the trip saves with or without
// it, and a stale in-flight answer never overwrites a newer one.
function wireDestination(form, onPlace) {
  const line = form.querySelector('#place-line')
  const dest = form.elements['destination']
  if (!line || !dest) return
  // A result belongs to the exact question that produced it. Submitting with
  // a since-edited destination — or while a lookup is still in flight — must
  // not attach the previous place to this trip (Codex, 2026-07-27), so the
  // answer carries its inputs and the caller re-checks them at save time.
  //
  // The two halves are kept apart on purpose: WHERE decides whether the label,
  // coordinates and elevation are still true, WHEN decides whether the
  // conditions are. Moving a trip a week later must not throw away the
  // mountain — only its forecast.
  const snapshot = () => ({
    where: dest.value.trim().toLowerCase(),
    when: `${form.elements['startDate']?.value ?? ''}|${form.elements['days']?.value ?? ''}`,
  })
  let seq = 0
  const say = (msg, isError) => {
    line.textContent = msg
    line.classList.toggle('field-error', !!isError)
  }
  const run = async () => {
    const mine = ++seq
    const asked = snapshot()
    // Any change invalidates the old answer immediately, before the network.
    onPlace(null, asked)
    if (!dest.value.trim()) { say(''); return }
    say('Looking it up…')
    const days = Number(form.elements['days']?.value) || null
    const res = await lookupDestination(dest.value.trim(), form.elements['startDate']?.value || null, days)
    if (mine !== seq) return
    if (!res.ok) { say(res.error, true); return }
    onPlace(res.place, asked)
    say(conditionsLine({ place: res.place }))
  }
  dest.addEventListener('change', run)
  for (const name of ['startDate', 'days']) {
    // Dates and length change the conditions, not the place — re-ask only
    // once a destination is actually on the form.
    form.elements[name]?.addEventListener('change', () => { if (dest.value.trim()) run() })
  }
  return snapshot
}

function mealStyleFromForm(f) {
  const pick = v => v === 'sitdown' ? 'sitdown' : 'mobile'
  return {
    breakfast: pick(f.get('style-breakfast')),
    lunch: pick(f.get('style-lunch')),
    dinner: pick(f.get('style-dinner')),
  }
}

function renderNewTrip() {
  const last = [...state.trips].sort((a, b) => b.createdAt - a.createdAt)[0]
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/" class="back">&larr; Trips</a>
      <h1>New Trip</h1>
      <form id="new-trip">
        <label>Trip name
          <input name="name" required placeholder="Alaska Caribou 2026">
        </label>
        <label>Destination
          <input name="destination" required placeholder="Brooks Range, AK">
          <small class="place-line" id="place-line">PackOut looks it up as you go — elevation and the week's conditions.</small>
        </label>
        ${tripTypeFields(state.profile?.tripTypes ?? [])}
        <label>Start date
          <input name="startDate" type="date" required>
        </label>
        <label>Days
          <input name="days" type="number" min="1" max="30" required value="5">
        </label>
        <label>Your body weight (lbs)
          <input name="weightLbs" type="number" min="50" max="400" required value="${state.profile?.weightLbs ?? (last ? last.weightLbs : '')}">
          <small>From your profile. Changing it here only affects this trip.</small>
        </label>
        ${mealStyleFields(state.profile?.mealStyle ?? mealStyleOf(last))}
        <button class="btn btn-primary" type="submit">Create Trip</button>
      </form>
    </section>
  `))
  let found = null
  const snapshot = wireDestination(document.getElementById('new-trip'), (place, asked) => { found = place && { place, asked } })
  // A new trip has nothing to preserve: it takes the lookup that answered
  // exactly this form, or nothing at all.
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
      mealStyle: mealStyleFromForm(f),
      days: Array.from({ length: Number(f.get('days')) }, () => ({ intensity: 'medium' })),
    }
    trip.types = f.getAll('tripType')
    const asked = snapshot()
    if (found && found.asked.where === asked.where) {
      trip.place = found.asked.when === asked.when
        ? found.place
        : { ...found.place, climate: null } // right mountain, wrong week
    }
    state.trips.push(trip)
    persist()
    // A new trip's kit is the next question, so land on the gear screen — it
    // asks rather than showing an empty list.
    location.hash = `#/trip/${trip.id}/gear`
  })
}

// ---------- edit trip ----------

function renderEditTrip(trip) {
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/trip/${trip.id}" class="back">&larr; ${esc(trip.name)}</a>
      <h1>Edit Trip</h1>
      <form id="edit-trip">
        <label>Trip name
          <input name="name" required value="${esc(trip.name)}">
        </label>
        <label>Destination
          <input name="destination" required value="${esc(trip.destination)}">
          <small class="place-line" id="place-line">${esc(conditionsLine(trip))}</small>
        </label>
        <label class="fly-toggle-inline">
          <input type="checkbox" name="flying" ${trip.flying ? 'checked' : ''}>
          <span>I'm flying to this trip</span>
        </label>
        <label>Start date
          <input name="startDate" type="date" required value="${trip.startDate}">
        </label>
        <label>Days
          <input name="days" type="number" min="1" max="30" required value="${trip.days.length}">
          <small>Adding days appends empty ones; removing days deletes them from the end.</small>
        </label>
        ${tripTypeFields(tripTypes(trip))}
        <label>Your body weight (lbs)
          <input name="weightLbs" type="number" min="50" max="400" required value="${trip.weightLbs}">
        </label>
        ${mealStyleFields(mealStyleOf(trip))}
        <button class="btn btn-primary" type="submit">Save</button>
      </form>
    </section>
  `))
  let found = null
  const snapshot = wireDestination(document.getElementById('edit-trip'), (place, asked) => { found = place && { place, asked } })
  const wasAsked = snapshot()
  document.getElementById('edit-trip').addEventListener('submit', e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const newCount = Number(f.get('days'))
    if (newCount < trip.days.length) {
      const doomed = trip.days.slice(newCount)
        .map((d, j) => ({ idx: newCount + j, kcal: dayTotals(d, state.library).kcal }))
        .filter(d => d.kcal > 0)
      if (doomed.length) {
        const ok = confirm(
          `Shortening to ${newCount} days deletes ${doomed.map(d => `Day ${d.idx + 1} (${d.kcal.toLocaleString()} kcal planned)`).join(', ')}. Continue?`)
        if (!ok) return
      }
      trip.days = trip.days.slice(0, newCount)
    } else {
      while (trip.days.length < newCount) trip.days.push({ intensity: 'medium' })
    }
    trip.name = f.get('name').trim()
    trip.destination = f.get('destination').trim()
    trip.startDate = f.get('startDate')
    trip.weightLbs = Number(f.get('weightLbs'))
    trip.types = f.getAll('tripType')
    trip.flying = f.get('flying') === 'on'
    trip.mealStyle = mealStyleFromForm(f)
    // A destination that changed without a matching lookup has no place data
    // any more — keeping the old one would describe the wrong mountain. A
    // window that changed only invalidates the conditions.
    const asked = snapshot()
    if (found && found.asked.where === asked.where) {
      trip.place = found.asked.when === asked.when ? found.place : { ...found.place, climate: null }
    } else if (asked.where !== wasAsked.where) {
      delete trip.place
    } else if (asked.when !== wasAsked.when && trip.place) {
      trip.place = { ...trip.place, climate: null }
    }
    persist()
    location.hash = `#/trip/${trip.id}`
  })
}

// ---------- trip view ----------

// The unified trip surface (spec: DESIGN.md "unified A→C"): the 7-day outlook
// strip IS the day navigation. openDay !== null opens the point-forecast board
// in place; same-surface route changes morph classes instead of re-rendering.
function renderTrip(trip, openDay = null) {
  const existing = app.querySelector(`.trip-surface[data-trip="${trip.id}"]`)
  if (existing) return updateTripSurface(existing, trip, openDay)

  app.replaceChildren(el(`
    <section class="trip-surface${openDay !== null ? ' day-open' : ''}" data-trip="${trip.id}">
      <a href="${openDay !== null ? `#/trip/${trip.id}` : '#/'}" class="back" id="surface-back">${openDay !== null ? `&larr; ${esc(trip.name)}` : '&larr; Trips'}</a>
      <div class="trip-head">
        <h1>${esc(trip.name)}</h1>
        <p class="trip-sub">${esc(trip.destination)} · <span class="mono">${tripDateRange(trip)}</span> · ${trip.weightLbs} lbs · <a class="trip-edit-link" href="#/trip/${trip.id}/edit">Edit trip</a></p>
        ${trip.place ? `<p class="trip-conditions mono">${esc(conditionsLine(trip))}</p>` : ''}
        <div id="rollup-slot">${tripRollupHTML(trip)}</div>
      </div>
      <nav class="trip-outputs">
        <a class="btn" href="#/trip/${trip.id}/gear">Gear</a>
        <a class="btn" href="#/trip/${trip.id}/grocery">Grocery</a>
        <a class="btn" href="#/trip/${trip.id}/pack">Pack Plan</a>
        <a class="btn" href="#/trip/${trip.id}/ready">Readiness</a>
      </nav>
      <div id="draft-all-slot">${draftAllHTML(trip)}</div>
      <ol class="strip" style="--days:${trip.days.length}" aria-label="Days — open one for its point forecast">
        ${trip.days.map((day, i) => `<li>${dayColumn(trip, day, i, openDay)}</li>`).join('')}
      </ol>
      <div class="board-wrap"><div class="board-inner"><div class="board" id="board"></div></div></div>
    </section>
  `))
  if (openDay !== null) {
    lastOpenDay = openDay
    fillBoard(trip, openDay, { focus: false })
  }
  wireTripSurface(trip)
}

function tripRollupHTML(trip) {
  const anyPlanned = trip.days.some(d => dayTotals(d, state.library).kcal > 0)
  if (!anyPlanned) return ''
  const tv = tripVerdict(trip, state.library)
  return tv.fueled
    ? `<p class="trip-rollup rollup-fueled">Every day Fueled${tv.heavyDays.length ? ` · ${tv.heavyDays.length} heavy` : ''}</p>`
    : `<p class="trip-rollup rollup-short">${tv.shortDays.length} day${tv.shortDays.length > 1 ? 's' : ''} short: ${tv.shortDays.map(i => `Day ${i + 1}`).join(', ')}</p>`
}

// Re-draft-everything is destructive; it only earns the primary treatment
// while there are empty days to fill (finish review 2026-07-25).
function draftAllHTML(trip) {
  if (!trip.days.length) return ''
  const emptyCount = trip.days.filter(d => dayTotals(d, state.library).kcal === 0).length
  return `
    <div class="draft-all-row">
      <button class="btn ${emptyCount ? 'btn-primary' : ''}" id="draft-all">
        ${emptyCount ? `Draft ${emptyCount} empty day${emptyCount > 1 ? 's' : ''}` : 'Re-draft all days'}
      </button>
      <span class="draft-note">${emptyCount ? 'Proposes meals from your usual food; planned days untouched.' : 'Replaces every day’s plan with a fresh proposal.'}</span>
    </div>`
}

function dayColumn(trip, day, i, openDay) {
  const t = dailyTargets(trip.weightLbs, day.intensity)
  const planned = dayTotals(day, state.library)
  const hasPlan = planned.kcal > 0
  const v = hasPlan ? dayVerdict(day, trip.weightLbs, state.library) : null
  const status = v ? v.status : 'none'
  const barbs = { easy: 1, medium: 2, hard: 3 }[day.intensity]
  return `
    <a class="col" href="#/trip/${trip.id}/day/${i}" data-i="${i}"
       ${openDay === i ? 'aria-current="true"' : ''}
       aria-label="Day ${i + 1}, ${dayDate(trip, i)}, ${hasPlan ? `${planned.kcal.toLocaleString()} of ${fmt(t.kcal.target)} kcal, ${VERDICT_LABELS[status] ?? 'not planned'}` : 'not planned'}">
      <div class="head"><div class="dnum">${i + 1}</div><div class="dow">${dayDate(trip, i)}</div></div>
      <div class="collapsible"><div>
        <div class="effort-viz" aria-hidden="true">
          <div class="barbs">${[1, 2, 3].map(b => `<i class="${b <= barbs ? '' : 'off'}" style="height:${[18, 32, 46][b - 1]}px"></i>`).join('')}</div>
          <span class="lab">${day.intensity}</span>
        </div>
      </div></div>
      <div class="hilo">
        <div class="hi mono">${hasPlan ? planned.kcal.toLocaleString() : '—'}</div>
        <div class="collapse-when-open"><span class="lo mono">of ${fmt(t.kcal.target)} kcal</span></div>
      </div>
      <div class="band band-${status}">${hasPlan ? VERDICT_LABELS[status] : 'No plan'}</div>
    </a>`
}

// The board IS the day (Lawrence 2026-07-27: "it forces me to click into edit
// this day"). Summary on the left, the real food list on the right with its
// controls inline — one surface, nothing to navigate to in order to see or
// change what you're eating. Always computed from the engine, never constants.
function fillBoard(trip, i, { focus = true } = {}) {
  const day = trip.days[i]
  const board = document.getElementById('board')
  if (!board) return
  // A same-day re-render replaces the board's DOM; if the user was focused on
  // a control inside it, put focus back on its replacement (finish review).
  // Every inline control carries a stable id so a qty tap keeps its button.
  const refocusId = !focus && board.contains(document.activeElement) ? document.activeElement.id : null
  day.meals ??= emptyMeals()
  const t = dailyTargets(trip.weightLbs, day.intensity)
  const st = slotTargets(t)
  const planned = dayTotals(day, state.library)
  const hasPlan = planned.kcal > 0
  const v = hasPlan ? dayVerdict(day, trip.weightLbs, state.library) : null
  const delta = planned.kcal - t.kcal.target
  const slotSub = key => sumEntries(day.meals[key], state.library)
  const b = slotSub('breakfast')
  const inWin = b.kcal >= st.breakfast.kcalMin && b.kcal <= st.breakfast.kcalMax
  const snacks = day.meals.snacks.flatMap(s => s.items)
  const snackSub = sumEntries(snacks, state.library)
  const din = slotSub('dinner')
  const staples = stapleIds(state.trips)
  const suggs = v?.status === 'short'
    ? suggestions({ kcalShort: v.kcalShort, proteinShortG: v.proteinShortG }, state.library, staples)
    : []
  const declined = [...declinedIds(trip)]

  board.innerHTML = `
    <div class="fc">
      <h2 id="board-title" tabindex="-1">Day ${i + 1} — ${dayDate(trip, i)}</h2>
      <div class="fmeta">
        <label class="intensity"><span class="intensity-label">Effort</span>
          <select id="board-intensity" aria-label="Effort for day ${i + 1}">
            ${INTENSITIES.map(x => `<option value="${x}" ${x === day.intensity ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}
          </select>
        </label>
      </div>
      ${hasPlan ? `
      <div class="big"><span class="n">${planned.kcal.toLocaleString()}</span><span class="of">planned / ${fmt(t.kcal.target)} target · Δ ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()}</span></div>
      <span class="obadge obadge-${v.status}">Outlook · ${VERDICT_LABELS[v.status]}</span>
      ${v.status !== 'fueled' ? `<p class="gap-line${v.status === 'heavy' ? ' gap-heavy' : ''}">${gapSentence(v)}</p>` : ''}
      ${suggs.length ? `
      <div class="suggs">
        ${suggs.map(f => `
          <button class="sugg" id="sugg-${esc(f.id)}" data-sugg="${esc(f.id)}">
            + ${esc(f.name)} <span class="mono">${f.kcal} kcal${v.proteinShortG > 0 && f.proteinG ? ` · ${f.proteinG}g P` : ''}</span>
          </button>`).join('')}
      </div>` : ''}
      <div class="discussion">
        <div class="k">Forecast discussion</div>
        <p>${forecastDiscussion(day, st, planned, v, b, din, snackSub)}</p>
      </div>
      <dl class="targets day-macros mono">
        <div><dt>Carbs</dt><dd>${planned.carbsG} / ${t.carbsG.min}–${t.carbsG.max} g</dd></div>
        <div><dt>Protein</dt><dd>${planned.proteinG} g</dd></div>
        <div><dt>Fat</dt><dd>${planned.fatG} / ${t.fatG.min}–${t.fatG.max} g</dd></div>
        <div><dt>Weight</dt><dd>${planned.weightOz} oz${planned.missingWeightCount ? ` <span class="floor">+${planned.missingWeightCount} unweighed</span>` : ''}</dd></div>
        ${planned.calsPerOz ? `<div><dt>Cals/oz</dt><dd>${planned.calsPerOz}</dd></div>` : ''}
      </dl>
      <div class="editrow">
        <button class="btn ${hasPlan ? '' : 'btn-primary'}" id="board-draft">${hasPlan ? 'Re-draft' : 'Draft this day'}</button>
        <button class="btn" id="board-draft-opt">Optimized</button>
      </div>
      ${declined.length ? `
      <p class="declined-note">
        ${declined.length} food${declined.length > 1 ? 's' : ''} excluded from drafts on this trip.
        <button class="btn-quiet" id="undo-declines">Allow them again</button>
      </p>` : ''}
      ${dayTransferHTML(trip, i)}` : `
      <div class="big"><span class="n">—</span><span class="of">nothing planned · target ${fmt(t.kcal.target)} kcal</span></div>
      <span class="obadge obadge-none">No plan yet</span>
      <div class="editrow">
        <button class="btn btn-primary" id="board-draft">Draft this day</button>
        <button class="btn" id="board-draft-opt">Optimized draft</button>
      </div>
      <p class="draft-note">…or add food to any meal on the right.</p>
      ${dayTransferHTML(trip, i)}`}
    </div>
    <div class="board-slots">
      ${boardSlot(trip, i, 'breakfast', 'Breakfast', b, day.meals.breakfast,
        b.kcal ? `<span class="w ${inWin ? 'in' : 'out'}">${inWin ? 'In window' : 'Outside window'} ${st.breakfast.kcalMin}–${st.breakfast.kcalMax}</span>` : '')}
      ${boardSlot(trip, i, 'lunch', 'Lunch', slotSub('lunch'), day.meals.lunch)}
      ${boardSlot(trip, i, 'dinner', 'Dinner', din, day.meals.dinner)}
      ${boardSnacks(trip, i, day, snackSub)}
      ${boardSlot(trip, i, 'electrolytes', 'Electrolytes', slotSub('electrolytes'), day.meals.electrolytes)}
    </div>`
  wireBoard(trip, i, day)
  const announce = document.getElementById('announce')
  if (announce) announce.textContent = hasPlan
    ? `Day ${i + 1} — outlook ${VERDICT_LABELS[v.status]}`
    : `Day ${i + 1} — nothing planned yet`
  if (focus) document.getElementById('board-title')?.focus()
  else if (refocusId) document.getElementById(refocusId)?.focus()
}

// One editable meal. The slot's own numbers stay on the header line; the
// entries below carry the controls that used to live behind "Edit this day".
function boardSlot(trip, i, key, label, sub, entries, extra = '') {
  return `
    <section class="slotrow" data-slot="${key}">
      <div class="slotrow-head">
        <span class="t">${label}</span>
        <span class="n">${sub.kcal.toLocaleString()}</span>
        ${extra}
      </div>
      ${entries.length ? `<ul class="entries">${entryRows(entries, key)}</ul>` : ''}
      <a class="btn-add" href="#/trip/${trip.id}/day/${i}/add/${key}">+ Add to ${label.toLowerCase()}</a>
    </section>`
}

function boardSnacks(trip, i, day, snackSub) {
  const bundles = day.meals.snacks
  return `
    <section class="slotrow" data-slot="snacks">
      <div class="slotrow-head">
        <span class="t">Snacks${bundles.length ? ` · ${bundles.length}` : ''}</span>
        <span class="n">${snackSub.kcal.toLocaleString()}</span>
      </div>
      ${bundles.map((s, sIdx) => `
        <div class="snack-bundle" data-bundle="${sIdx}">
          <div class="snack-head">
            <h3>Snack ${sIdx + 1}</h3>
            <span class="slot-sub mono">${sumEntries(s.items, state.library).kcal.toLocaleString()} kcal</span>
            <button id="rm-snack-${sIdx}" data-rm-snack="${sIdx}" aria-label="Remove snack ${sIdx + 1}">×</button>
          </div>
          ${s.items.length ? `<ul class="entries">${entryRows(s.items, `snack-${sIdx}`)}</ul>` : ''}
          <a class="btn-add" href="#/trip/${trip.id}/day/${i}/add/snack-${sIdx}">+ Add item</a>
        </div>`).join('')}
      <button class="btn-add" id="add-snack" type="button">+ Add snack</button>
    </section>`
}

// Copying a proven day in beats retyping it. Tucked behind a disclosure — it's
// a real capability, not a thing you reach for every visit.
function dayTransferHTML(trip, i) {
  const others = trip.days.map((_, j) => j).filter(j => j !== i)
  const imports = plannedDayOptions(state.trips, state.library)
    .filter(o => !(o.tripId === trip.id && o.dayIndex === i))
  if (!others.length && !imports.length) return ''
  const byTrip = new Map()
  for (const o of imports) {
    if (!byTrip.has(o.tripId)) byTrip.set(o.tripId, { name: o.tripName, days: [] })
    byTrip.get(o.tripId).days.push(o)
  }
  return `
    <details class="day-transfer">
      <summary>Copy or import a day</summary>
      ${others.length ? `
      <div class="transfer-row">
        <label>Copy this day to
          <select id="copy-target">
            ${others.map(j => `<option value="${j}">Day ${j + 1} — ${dayDate(trip, j)}</option>`).join('')}
          </select>
        </label>
        <button class="btn" id="copy-apply" type="button">Copy</button>
      </div>` : ''}
      ${imports.length ? `
      <div class="transfer-row">
        <label>Import a plan from
          <select id="import-source">
            ${[...byTrip.values()].map(g => `
              <optgroup label="${esc(g.name)}">
                ${g.days.map(o => `<option value="${esc(o.tripId)}:${o.dayIndex}">Day ${o.dayIndex + 1} — ${o.kcal.toLocaleString()} kcal</option>`).join('')}
              </optgroup>`).join('')}
          </select>
        </label>
        <button class="btn" id="import-apply" type="button">Import</button>
      </div>` : ''}
    </details>`
}

function forecastDiscussion(day, st, planned, v, b, din, snackSub) {
  const parts = []
  parts.push(`${day.intensity === 'easy' ? 'An' : 'A'} ${day.intensity} day ${v.status === 'fueled' ? 'in the window' : v.status === 'short' ? 'running short' : 'running heavy'}.`)
  if (b.kcal) parts.push(`Breakfast holds ${b.kcal.toLocaleString()} kcal ${b.kcal >= st.breakfast.kcalMin && b.kcal <= st.breakfast.kcalMax ? 'inside' : 'outside'} its ${st.breakfast.kcalMin}–${st.breakfast.kcalMax} band;`)
  if (din.kcal) {
    const gap = din.kcal - st.dinner.kcal
    parts.push(`dinner runs ${Math.abs(gap).toLocaleString()} ${gap < 0 ? 'under' : 'over'} its share${snackSub.kcal ? ` and snacks carry ${snackSub.kcal.toLocaleString()} kcal` : ''}.`)
  }
  parts.push(`Protein comes to ${planned.proteinG} g.`)
  parts.push(`Pack weight: ${planned.weightOz} oz logged${planned.missingWeightCount ? `, ${planned.missingWeightCount} item${planned.missingWeightCount > 1 ? 's' : ''} unweighed` : ''}.`)
  return parts.join(' ')
}

// Same-surface route change: morph instead of re-render so the strip→scrubber
// motion actually plays. Column data refreshes (a commit may have changed it).
function updateTripSurface(surface, trip, openDay) {
  const wasOpen = surface.classList.contains('day-open')
  // Navigation (open/close/switch) must morph the EXISTING columns — a
  // rebuilt node has no prior state, so its collapse transition can't run
  // and the strip pops instead of folding (regression from the stale-rollup
  // fix, 2026-07-25). Data commits keep the rebuild for fresh numbers; the
  // swap is invisible because collapsed state is ancestor-class-driven.
  const contextChanged = (openDay !== null) !== wasOpen || (openDay !== null && openDay !== lastOpenDay)
  surface.classList.toggle('day-open', openDay !== null)
  if (contextChanged) {
    surface.querySelectorAll('.col').forEach(col => {
      if (Number(col.dataset.i) === openDay) col.setAttribute('aria-current', 'true')
      else col.removeAttribute('aria-current')
    })
  } else {
    surface.querySelectorAll('.strip li').forEach((li, i) => {
      li.innerHTML = dayColumn(trip, trip.days[i], i, openDay)
    })
  }
  // Headline state must track every commit made on this surface.
  const rollupSlot = document.getElementById('rollup-slot')
  if (rollupSlot) rollupSlot.innerHTML = tripRollupHTML(trip)
  const draftSlot = document.getElementById('draft-all-slot')
  if (draftSlot) draftSlot.innerHTML = draftAllHTML(trip)
  // Focus moves only when the day CONTEXT changes — never on a same-day
  // commit (an effort change must not steal focus from the select).
  if (openDay !== null) fillBoard(trip, openDay, { focus: !wasOpen || openDay !== lastOpenDay })
  else {
    const announce = document.getElementById('announce')
    if (announce) announce.textContent = ''
    if (wasOpen) {
      const target = surface.querySelector(`.col[data-i="${lastOpenDay ?? 0}"]`) || surface.querySelector('.col[data-i]')
      target?.focus()
    }
  }
  const back = document.getElementById('surface-back')
  if (back) {
    back.setAttribute('href', openDay !== null ? `#/trip/${trip.id}` : '#/')
    back.innerHTML = openDay !== null ? `&larr; ${esc(trip.name)}` : '&larr; Trips'
  }
  if (openDay !== null) lastOpenDay = openDay
  wireTripSurface(trip)
}

let lastOpenDay = null

function wireTripSurface(trip) {
  const draftAll = document.getElementById('draft-all')
  if (draftAll && !draftAll.dataset.wired) {
    draftAll.dataset.wired = '1'
    draftAll.addEventListener('click', () => {
      const plannedCount = trip.days.filter(d => dayTotals(d, state.library).kcal > 0).length
      if (plannedCount === trip.days.length && plannedCount > 0) {
        const ok = confirm(`Re-draft all ${plannedCount} days? Every day's current plan is replaced and packed marks reset.`)
        if (!ok) return
        for (const day of trip.days) {
          delete day.meals
          delete day.packed
        }
      }
      const staples = stapleIds(state.trips)
      for (const { dayIndex, meals } of draftEmptyDays(trip, state.library, staples, 'usual')) {
        trip.days[dayIndex].meals = meals
        delete trip.days[dayIndex].packed
      }
      commit()
    })
  }
}

// The design switcher (static DOM, lives outside route renders): two skins,
// one app — switching is a token swap, never a re-render of state.
function syncBrandDock() {
  const current = document.documentElement.dataset.brand
  document.querySelectorAll('.brand-dock [data-set-brand]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.setBrand === current))
  })
}
document.querySelectorAll('.brand-dock [data-set-brand]').forEach(b => {
  b.addEventListener('click', () => {
    document.documentElement.dataset.brand = b.dataset.setBrand
    try { localStorage.setItem('packout/brand', b.dataset.setBrand) } catch { /* preference just won't stick */ }
    syncBrandDock()
  })
})
syncBrandDock()

// Escape backs out of an open day anywhere on the unified surface.
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  const m = (location.hash || '').match(/^#\/trip\/(.+)\/day\/\d+$/)
  if (m) location.hash = `#/trip/${m[1]}`
})

// ---------- verdicts ----------

const VERDICT_LABELS = { fueled: 'Fueled', short: 'Short', heavy: 'Heavy' }

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

// One place resolves a slot key ('breakfast', 'snack-2', …) to its entry list.
function resolveEntries(day, key) {
  return key.startsWith('snack-')
    ? day.meals.snacks[Number(key.slice(6))].items
    : day.meals[key]
}

// Ids are stable across a re-render so a qty tap keeps focus on its own button
// (the board rebuilds on every commit).
function entryRows(entries, slotKey) {
  return entries.map((e, j) => {
    const f = state.library.find(x => x.id === e.foodId)
    const name = esc(foodName(e.foodId))
    return `
      <li class="entry">
        <span class="entry-name">${name}</span>
        <span class="entry-kcal mono">${f ? sumEntries([e], state.library).kcal.toLocaleString() + ' kcal' : '—'}</span>
        <span class="entry-ctl">
          <button id="qty-${slotKey}-${j}-down" data-qty="${slotKey}:${j}:-1" aria-label="Less ${name}">−</button>
          <span class="qty mono">${e.qty}</span>
          <button id="qty-${slotKey}-${j}-up" data-qty="${slotKey}:${j}:1" aria-label="More ${name}">+</button>
          <button id="rm-${slotKey}-${j}" data-rm="${slotKey}:${j}" aria-label="Remove ${name}">×</button>
        </span>
      </li>`
  }).join('')
}

// Taking a food off a day is a standing decision for this trip: drafting must
// not hand it straight back (Lawrence 2026-07-27, the pico de gallo loop).
function decline(trip, foodId) {
  trip.declined ??= []
  if (!trip.declined.includes(foodId)) trip.declined.push(foodId)
}

// The Add control belonging to a given entry list: a snack key addresses its
// own bundle, everything else its slot.
function slotAddControl(key) {
  const m = /^snack-(\d+)$/.exec(key)
  return m
    ? document.querySelector(`[data-bundle="${m[1]}"] .btn-add`)
    : document.querySelector(`[data-slot="${CSS.escape(key)}"] .btn-add`)
}

function wireBoard(trip, i, day) {
  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn)
  on('board-intensity', 'change', e => { day.intensity = e.target.value; commit() })

  const draft = strategy => {
    const current = dayTotals(day, state.library)
    if (current.kcal > 0) {
      const count = dayPackList(day, state.library).length
      if (!confirm(`Day ${i + 1} already has ${count} item${count > 1 ? 's' : ''} planned — drafting replaces that work and resets this day's packed marks.`)) return
    }
    day.meals = draftDay(trip, i, state.library, stapleIds(state.trips), strategy)
    delete day.packed
    commit()
  }
  on('board-draft', 'click', () => draft('usual'))
  on('board-draft-opt', 'click', () => draft('optimized'))
  on('undo-declines', 'click', () => { delete trip.declined; commit() })
  on('add-snack', 'click', () => { day.meals.snacks.push({ items: [] }); commit() })

  document.querySelectorAll('#board [data-qty]').forEach(btn => btn.addEventListener('click', () => {
    const [key, j, delta] = btn.dataset.qty.split(':')
    const entry = resolveEntries(day, key)[Number(j)]
    entry.qty = Math.max(1, entry.qty + Number(delta))
    commit()
  }))
  document.querySelectorAll('#board [data-rm]').forEach(btn => btn.addEventListener('click', () => {
    const [key, j] = btn.dataset.rm.split(':')
    const entries = resolveEntries(day, key)
    const [removed] = entries.splice(Number(j), 1)
    if (removed) decline(trip, removed.foodId)
    commit()
    // The button that was focused no longer exists, and its id now belongs to
    // a different food. Land on the neighbour, or on the Add control of the
    // very list that was emptied — for a snack that is its own bundle's Add,
    // not the first bundle's (Codex, 2026-07-27).
    const idx = Math.min(Number(j), entries.length - 1)
    const next = idx >= 0 ? document.getElementById(`rm-${key}-${idx}`) : null
    ;(next ?? slotAddControl(key))?.focus()
  }))
  document.querySelectorAll('#board [data-rm-snack]').forEach(btn => btn.addEventListener('click', () => {
    const at = Number(btn.dataset.rmSnack)
    const [bundle] = day.meals.snacks.splice(at, 1)
    for (const e of bundle?.items ?? []) decline(trip, e.foodId)
    commit()
    // Removing the last bundle leaves no neighbour to land on — fall through
    // to the control that would make another one.
    const neighbour = Math.min(at, day.meals.snacks.length - 1)
    const next = neighbour >= 0 ? document.getElementById(`rm-snack-${neighbour}`) : null
    ;(next ?? document.getElementById('add-snack'))?.focus()
  }))
  document.querySelectorAll('#board [data-sugg]').forEach(btn => btn.addEventListener('click', () => {
    const food = state.library.find(f => f.id === btn.dataset.sugg)
    if (!food) return
    // Accepting a suggestion un-declines it: the user just asked for it back.
    if (trip.declined?.includes(food.id)) trip.declined = trip.declined.filter(id => id !== food.id)
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

  on('copy-apply', 'click', () => {
    const j = Number(document.getElementById('copy-target').value)
    if (!confirm(`Replace Day ${j + 1}'s plan with Day ${i + 1}'s?`)) return
    trip.days[j].meals = structuredClone(day.meals)
    delete trip.days[j].packed // new plan, stale marks would lie
    persist()
    location.hash = `#/trip/${trip.id}/day/${j}`
  })
  on('import-apply', 'click', () => {
    const [tripId, dayIndex] = document.getElementById('import-source').value.split(':')
    const sourceTrip = state.trips.find(t => t.id === tripId)
    const source = sourceTrip?.days[Number(dayIndex)]
    if (!source) return
    if (!confirm(`Replace Day ${i + 1}'s plan with ${sourceTrip.name} Day ${Number(dayIndex) + 1}'s?`)) return
    day.meals = structuredClone(source.meals)
    delete day.packed
    commit()
  })
}


let pickerSearch = ''

function renderPicker(trip, i, slotKey) {
  const day = trip.days[i]
  day.meals ??= emptyMeals()
  const slotBase = slotKey.startsWith('snack-') ? 'snack' : slotKey
  const q = pickerSearch.trim().toLowerCase()
  const staples = stapleIds(state.trips)
  const foods = pickerRank(state.library, staples, slotBase)
    .filter(f => !q || f.name.toLowerCase().includes(q))
  const slotLabel = slotKey.startsWith('snack-') ? `Snack ${Number(slotKey.slice(6)) + 1}` : SLOT_LABELS[slotKey]
  app.replaceChildren(el(`
    <section class="picker">
      <a href="#/trip/${trip.id}/day/${i}" class="back">&larr; Day ${i + 1}</a>
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
    const entries = resolveEntries(day, slotKey)
    const existing = entries.find(e => e.foodId === btn.dataset.pick)
    if (existing) existing.qty += 1
    else entries.push({ foodId: btn.dataset.pick, qty: 1 })
    // Adding it back by hand overrides the standing decline.
    if (trip.declined?.includes(btn.dataset.pick)) {
      trip.declined = trip.declined.filter(id => id !== btn.dataset.pick)
    }
    persist()
    pickerSearch = ''
    location.hash = `#/trip/${trip.id}/day/${i}`
  }))
}

// ---------- outputs: grocery, pack plan, readiness ----------

function renderGrocery(trip) {
  trip.groceryChecked ??= {}
  const rows = groceryList(trip, state.library)
  app.replaceChildren(el(`
    <section class="output">
      <a href="#/trip/${trip.id}" class="back">&larr; ${esc(trip.name)}</a>
      <div class="dashboard-head">
        <h1>Grocery</h1>
        <button class="btn" id="print">Print</button>
      </div>
      ${rows.length === 0 ? '<p class="empty">Nothing planned yet — build some days first.</p>' : `
      <ul class="check-list">
        ${rows.map(r => `
          <li>
            <label class="check-row">
              <span class="check-lead mono">×${r.count}</span>
              <span class="check-name ${trip.groceryChecked[r.foodId] === r.count ? 'is-done' : ''}">${esc(r.name)}</span>
              <input type="checkbox" data-check="${esc(r.foodId)}" data-count="${r.count}" ${trip.groceryChecked[r.foodId] === r.count ? 'checked' : ''}>
            </label>
          </li>`).join('')}
      </ul>`}
    </section>
  `))
  wirePrint()
  app.querySelectorAll('[data-check]').forEach(cb => cb.addEventListener('change', () => {
    // Stamp the count so the mark goes stale if the plan grows.
    if (cb.checked) trip.groceryChecked[cb.dataset.check] = Number(cb.dataset.count)
    else delete trip.groceryChecked[cb.dataset.check]
    commit()
  }))
}

function renderPack(trip) {
  app.replaceChildren(el(`
    <section class="output">
      <a href="#/trip/${trip.id}" class="back">&larr; ${esc(trip.name)}</a>
      <div class="dashboard-head">
        <h1>Pack Plan</h1>
        <button class="btn" id="print">Print</button>
      </div>
      ${trip.days.map((day, i) => {
        const items = dayPackList(day, state.library)
        return `
        <section class="pack-day">
          <h2>Day ${i + 1} <span class="day-date">${dayDate(trip, i)}</span></h2>
          ${items.length === 0 ? '<p class="empty-line">Nothing planned.</p>' : `
          <ul class="check-list">
            ${items.map(it => `
              <li>
                <label class="check-row">
                  <span class="check-lead mono">×${it.qty}</span>
                  <span class="check-name ${day.packed?.[it.foodId] === it.qty ? 'is-done' : ''}">${esc(it.name)}</span>
                  <input type="checkbox" data-pack="${i}:${esc(it.foodId)}" data-qty="${it.qty}" ${day.packed?.[it.foodId] === it.qty ? 'checked' : ''}>
                </label>
              </li>`).join('')}
          </ul>`}
        </section>`
      }).join('')}
    </section>
  `))
  wirePrint()
  app.querySelectorAll('[data-pack]').forEach(cb => cb.addEventListener('change', () => {
    const [i, foodId] = cb.dataset.pack.split(':')
    const day = trip.days[Number(i)]
    day.packed ??= {}
    if (cb.checked) day.packed[foodId] = Number(cb.dataset.qty)
    else delete day.packed[foodId]
    commit()
  }))
}

// ---------- gear ----------

// A trip whose kit is empty gets asked rather than shown an empty list. This
// remembers the trips where the user said "I'll add them myself" so the ask
// doesn't reappear on every visit — session-only, deliberately not synced.
const kitAskSkipped = new Set()

function renderGear(trip) {
  trip.gear ??= []
  if (trip.gear.length === 0 && !kitAskSkipped.has(trip.id)) return renderKitQuestions(trip)
  // The gear screen is the only door to the picker — arriving here clears
  // any category scope a section CTA set on a previous visit, and any
  // half-open library edit.
  gearNewCategory = null
  gearEditId = null
  const byId = new Map(state.gearLibrary.map(g => [g.id, g]))
  const stats = gearStats(trip, state.gearLibrary)
  const inKit = new Set(trip.gear.map(e => e.gearId))
  const otherTrips = state.trips.filter(t => t.id !== trip.id && (t.gear?.length ?? 0) > 0)
  const grouped = GEAR_CATEGORIES
    .map(cat => ({ cat, entries: trip.gear.filter(e => byId.get(e.gearId)?.category === cat) }))
    .filter(g => g.entries.length > 0)
  app.replaceChildren(el(`
    <section class="output">
      <a href="#/trip/${trip.id}" class="back">&larr; ${esc(trip.name)}</a>
      <div class="dashboard-head">
        <h1>Gear</h1>
        <button class="btn" id="print">Print</button>
      </div>
      ${trip.gear.length ? `
      <p class="gear-stats mono">${stats.packed} / ${stats.total} packed${stats.weightOz ? ` · ${stats.weightOz} oz on your back` : ''}${stats.wornOz ? ` · ${stats.wornOz} oz worn` : ''}${stats.missingWeightCount ? ` · ${stats.missingWeightCount} unweighed` : ''}</p>` : `
      <p class="empty">No gear on this trip yet. Start from your standard kit, or add items one by one.</p>`}
      <label class="fly-toggle">
        <input type="checkbox" id="trip-flying" ${trip.flying ? 'checked' : ''}>
        <span>I'm flying to this trip</span>
      </label>
      <div class="backup-actions gear-actions">
        <a class="btn" href="#/trip/${trip.id}/gear/kit">Build from questions</a>
        <a class="btn" href="#/trip/${trip.id}/gear/add">Add item</a>
        <button class="btn" id="gear-full-kit">Add everything I own</button>
        ${otherTrips.length ? `
        <label class="gear-import-label">Import kit from
          <select id="gear-import-source">
            ${otherTrips.map(t => `<option value="${t.id}">${esc(t.name)} (${t.gear.length} items)</option>`).join('')}
          </select>
        </label>
        <button class="btn" id="gear-import">Import</button>` : ''}
      </div>
      ${flyBlockHTML(trip)}
      ${grouped.map(g => `
        <section class="pack-day">
          <h2>${esc(g.cat)}</h2>
          <ul class="check-list">
            ${g.entries.map(e => gearRow(byId.get(e.gearId), e)).join('')}
          </ul>
          <a class="btn-add gear-add" href="#/trip/${trip.id}/gear/add" data-gear-cat="${esc(g.cat)}">+ Add to ${esc(g.cat)}</a>
        </section>`).join('')}
    </section>
  `))
  wirePrint()
  wireGearRows(trip)
  // Section CTAs open the picker scoped to their category: the search
  // prefilters the library and the new-item form starts on that category.
  app.querySelectorAll('[data-gear-cat]').forEach(a => a.addEventListener('click', () => {
    gearSearch = a.dataset.gearCat
    gearNewCategory = a.dataset.gearCat
  }))
  document.getElementById('gear-full-kit').addEventListener('click', () => {
    for (const g of state.gearLibrary) {
      if (!inKit.has(g.id)) trip.gear.push({ gearId: g.id, packed: false })
    }
    commit()
  })
  const importBtn = document.getElementById('gear-import')
  if (importBtn) importBtn.addEventListener('click', () => {
    const source = state.trips.find(t => t.id === document.getElementById('gear-import-source').value)
    if (!source) return
    if (confirm(`Replace this trip's gear list with ${source.name}'s? Packed marks reset.`)) {
      trip.gear = source.gear.map(e => ({ gearId: e.gearId, packed: false }))
      commit()
    }
  })
  document.getElementById('trip-flying').addEventListener('change', e => {
    trip.flying = e.target.checked
    commit()
  })
}

// A row that still carries its question's generic name and no weight is a
// slot, not a decision. Saying so is the whole point of the note: "there is
// nothing that lets me specify what I'm actually bringing."
function isBlankSlot(item) {
  if (!item.id.startsWith('ob-') || item.weightOz !== null || item.url) return false
  // Naming it is answering the question, even without a weight yet (Codex,
  // 2026-07-27) — only a row still wearing its catalog label is a slot.
  return item.name === genericGearName(item.id)
}

// The gear list edits in place (Lawrence 2026-07-27) — name it, paste the
// product page, take the weight off it, without leaving for the picker.
// Buttons sit outside the label so a tap on Specify never toggles Packed.
function gearRow(item, entry) {
  const open = gearRowEditId === item.id
  const blank = isBlankSlot(item)
  const cb = `gp-${esc(item.id)}`
  return `
    <li class="gear-item">
      <div class="check-row gear-row${blank ? ' is-blank' : ''}">
        <label class="check-name ${entry.packed ? 'is-done' : ''}" for="${cb}">${esc(item.name)}</label>
        <span class="check-meta mono">${item.weightOz !== null ? `${esc(item.weightOz)} oz` : 'no weight'}</span>
        <button class="btn-quiet" data-gear-edit-row="${esc(item.id)}" aria-expanded="${open}">${blank ? 'Specify' : 'Edit'}</button>
        <button class="btn-quiet gear-rm" data-gear-rm="${esc(item.id)}" aria-label="Remove ${esc(item.name)} from this trip">&times;</button>
        <input id="${cb}" type="checkbox" data-gear-pack="${esc(item.id)}" ${entry.packed ? 'checked' : ''}>
      </div>
      ${open ? `
      <form class="gear-inline" id="gear-inline">
        <label>What is it?
          <!-- A blank slot's name is a placeholder, not an answer, so the box
               starts empty and Fetch (which only fills blanks) can name it. -->
          <input name="name" value="${blank ? '' : esc(item.name)}" placeholder="${esc(item.name)}">
        </label>
        <label>Product page URL<input name="url" type="url" value="${esc(item.url ?? '')}" placeholder="https://kifaru.net/products/…"></label>
        <div class="fetch-row">
          <button class="btn" type="button" id="scrape-btn">Fetch name + weight</button>
          <span class="fetch-status mono" role="status" id="scrape-status"></span>
        </div>
        <div class="macro-grid">
          <label>Weight oz<input name="weightOz" type="number" min="0.05" step="any" value="${esc(item.weightOz ?? '')}"></label>
          <label>Category
            <select name="category">${GEAR_CATEGORIES.map(c => `<option${c === item.category ? ' selected' : ''}>${c}</option>`).join('')}</select>
          </label>
        </div>
        <div class="onboard-actions">
          <button class="btn btn-primary" type="submit">Save</button>
          <button class="btn-quiet" type="button" id="gear-inline-cancel">Cancel</button>
        </div>
      </form>` : ''}
    </li>`
}

function wireGearRows(trip) {
  app.querySelectorAll('[data-gear-pack]').forEach(cb => cb.addEventListener('change', () => {
    const entry = trip.gear.find(e => e.gearId === cb.dataset.gearPack)
    entry.packed = cb.checked
    commit()
  }))
  app.querySelectorAll('[data-gear-rm]').forEach(btn => btn.addEventListener('click', () => {
    trip.gear = trip.gear.filter(x => x.gearId !== btn.dataset.gearRm)
    commit()
  }))
  app.querySelectorAll('[data-gear-edit-row]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.gearEditRow
    gearRowEditId = gearRowEditId === id ? null : id
    renderGear(trip)
    document.querySelector(`[data-gear-edit-row="${CSS.escape(id)}"]`)?.focus()
  }))
  const form = document.getElementById('gear-inline')
  if (!form) return
  const item = state.gearLibrary.find(g => g.id === gearRowEditId)
  document.getElementById('gear-inline-cancel').addEventListener('click', () => {
    gearRowEditId = null
    renderGear(trip)
  })
  form.addEventListener('submit', e => {
    e.preventDefault()
    const f = new FormData(e.target)
    // The edit lands on the library row, so every trip sharing this slot gets
    // the real item — that is what makes naming it once worth doing.
    Object.assign(item, {
      // Leaving the name alone keeps the slot's own label — never blanks it.
      name: f.get('name').trim() || item.name,
      category: f.get('category'),
      weightOz: f.get('weightOz') === '' ? null : Number(f.get('weightOz')),
      url: f.get('url').trim() || null,
    })
    gearRowEditId = null
    persist()
    renderGear(trip)
  })
  wireScrape(form, ['name', 'weightOz'])
}

// What this kit can't do at an airport. Advisory by construction — it names
// items and the rule, and never blocks a checklist.
const FLY_BLOCKS = [
  { key: 'banned', title: "Can't fly with these", note: 'Buy them at the other end.' },
  { key: 'checked', title: 'Checked baggage only', note: 'Never in the cabin.' },
  { key: 'carryon', title: 'Carry-on only', note: 'Lithium cells cannot ride in the hold.' },
]

function flyBlockHTML(trip) {
  if (!trip.flying) return ''
  const issues = flyIssues(trip, state.gearLibrary)
  const blocks = FLY_BLOCKS.filter(b => issues[b.key].length)
  if (!blocks.length) return '<p class="fly-clear">Flying — nothing in this kit is restricted.</p>'
  return `
    <section class="fly-note" aria-label="Airline restrictions">
      ${blocks.map(b => `
        <div class="fly-group fly-${b.key}">
          <h3>${b.title} <span class="mono">${b.note}</span></h3>
          <ul>${issues[b.key].map(x => `<li><strong>${esc(x.name)}</strong> — ${esc(x.why)}</li>`).join('')}</ul>
        </div>`).join('')}
    </section>`
}

// The kit questions (spec #24, reworked twice: 2026-07-27 morning to plain
// questions, 2026-07-27 evening to a board). Lawrence: "the initial
// questionnaire should be more than a long list … on a big screen it makes me
// scroll unnecessarily." So the questions lay out as cards across the wide
// canvas, answers are chips, and a running tally sits at the foot. Density is
// NOT the goal — the desktop canvas buys columns, not smaller type.
//
// Answers live here rather than in the DOM because the question set is live:
// picking "rifle hunt" adds its blocks immediately, and a re-render must not
// forget what has already been answered.
let kitAnswers = {}
let kitDetails = {}
let kitTripId = null

// Clearing the answers clears the trip they belonged to, so the next render
// re-seeds from the trip instead of finding a half-empty answer set.
function kitReset() {
  kitAnswers = {}
  kitDetails = {}
  kitTripId = null
}

// Everything the answers currently imply, for the foot tally.
function kitTally(questions) {
  const rows = kitRows(kitAnswers, questions)
  // A weight the user just fetched counts immediately — the tally has to
  // agree with the detail row sitting right above it.
  const weightOf = r => kitDetails[r.id]?.weightOz ?? r.weightOz
  const known = rows.map(weightOf).filter(w => typeof w === 'number' && w > 0)
  const oz = known.reduce((a, w) => a + w, 0)
  return { count: rows.length, oz: Math.round(oz * 10) / 10, unweighed: rows.length - known.length }
}

function chip(qId, value, label, { note = '', suggested = null, checked = false, meta = '' } = {}) {
  const id = `chip-${qId}-${value}`.replace(/[^A-Za-z0-9_-]/g, '_')
  return `
    <label class="chip" for="${id}">
      <input type="checkbox" id="${id}" data-q="${esc(qId)}" value="${esc(value)}"${checked ? ' checked' : ''}>
      <span class="chip-face">
        <span class="chip-label">${esc(label)}</span>
        ${meta ? `<span class="chip-meta mono">${esc(meta)}</span>` : ''}
        ${note ? `<span class="chip-note">${esc(note)}</span>` : ''}
        ${suggested ? `<span class="chip-flag mono">${esc(suggested)}</span>` : ''}
      </span>
    </label>`
}

// A checked generic option opens its detail row: name the actual product, or
// let the product page name and weigh it (Lawrence 2026-07-27). Only generic
// options get one — picking gear you already own is already specific.
function detailRow(qId, o) {
  const rowId = o.rows[0].id
  const d = kitDetails[rowId] ?? {}
  return `
    <div class="chip-detail" data-row="${esc(rowId)}">
      <label class="chip-detail-name">Which one?
        <input data-detail="${esc(rowId)}:name" value="${esc(d.name ?? '')}" placeholder="${esc(o.rows[0].name)} — brand and model">
      </label>
      <div class="chip-detail-fetch">
        <input type="url" data-detail="${esc(rowId)}:url" value="${esc(d.url ?? '')}" placeholder="https://… product page" aria-label="Product page URL for ${esc(o.rows[0].name)}">
        <button class="btn" type="button" data-fetch="${esc(rowId)}">Fetch</button>
        <span class="fetch-status mono" role="status" id="fetch-${esc(rowId)}">${d.weightOz ? `${d.weightOz} oz` : ''}</span>
      </div>
    </div>`
}

function renderKitQuestions(trip) {
  trip.gear ??= []
  // Answers belong to the trip that was asked. Opening another trip's kit
  // starts clean; re-rendering this one (every chip does) keeps them.
  if (kitTripId !== trip.id) {
    kitReset()
    kitTripId = trip.id
    // Seed from the trip, not from nothing: submitting writes both fields
    // back, so an uninitialised chip would silently clear a flag the trip
    // already carries (Codex, 2026-07-27).
    kitAnswers.tripTypes = tripTypes(trip)
    kitAnswers.flying = !!trip.flying
  }
  // The trip's own types are an answer on this screen now (Lawrence: "we
  // should ask if this trip is a rifle hunt, bow hunt, or fishing trip, and
  // that will simplify some of the follow-up questions"). They are read live
  // from kitAnswers so the dependent blocks appear the moment they're picked.
  const asked = { ...trip, types: kitAnswers.tripTypes }
  const questions = tripGearQuestions(asked, state.gearLibrary)
  const source = [...state.trips]
    .filter(t => t.id !== trip.id && (t.gear?.length ?? 0) > 0)
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  const picked = q => kitAnswers[q.id] ?? []
  const tally = kitTally(questions)
  const climate = trip.place?.climate

  app.replaceChildren(el(`
    <section class="kit-ask">
      <a href="#/trip/${trip.id}" class="back">&larr; ${esc(trip.name)}</a>
      <h1>What's going on this trip?</h1>
      <p class="kit-lead">Pick what's coming. Anything PackOut hasn't seen becomes a slot in your
      gear list — name it here, or name it later.</p>
      ${climate ? `<p class="kit-conditions mono">${esc(conditionsLine(trip))}</p>` : ''}
      ${source ? `
      <div class="kit-shortcut">
        <button class="btn" id="kit-copy" type="button">Same kit as ${esc(source.name)}</button>
        <span class="draft-note">${source.gear.length} items, none marked packed. Or answer below.</span>
      </div>` : ''}
      <form id="kit-form">
        <div class="q-grid">
          <fieldset class="q-card">
            <legend>What are you doing out there?</legend>
            <p class="onboard-q-hint">Each one adds its own gear questions.</p>
            <div class="chips">
              ${TRIP_TYPES.map(t => chip('tripTypes', t, TRIP_TYPE_LABELS[t],
                { checked: kitAnswers.tripTypes.includes(t) })).join('')}
            </div>
          </fieldset>
          <fieldset class="q-card">
            <legend>Are you flying to this trip?</legend>
            <p class="onboard-q-hint">PackOut flags what won't make it through an airport.</p>
            <div class="chips">
              ${chip('flying', 'yes', 'Flying', { checked: !!kitAnswers.flying })}
            </div>
          </fieldset>
          ${questions.map(q => `
            <fieldset class="q-card">
              <legend>${esc(q.prompt)}</legend>
              ${q.hint && !q.items.length ? `<p class="onboard-q-hint">${esc(q.hint)}</p>` : ''}
              <div class="chips">
                ${q.items.map(g => chip(q.id, g.id, g.name, {
                  checked: picked(q).includes(g.id),
                  meta: g.weightOz !== null ? `${g.weightOz} oz` : 'no weight yet',
                })).join('')}
                ${q.options.map(o => chip(q.id, o.value, q.items.length ? `+ ${o.label}` : o.label, {
                  note: o.note, suggested: o.suggested, checked: picked(q).includes(o.value),
                })).join('')}
              </div>
              ${q.options.filter(o => picked(q).includes(o.value)).map(o => detailRow(q.id, o)).join('')}
            </fieldset>`).join('')}
        </div>
        <div class="kit-foot">
          <span class="kit-tally mono">${tally.count} item${tally.count === 1 ? '' : 's'}${tally.oz ? ` · ${tally.oz} oz known` : ''}${tally.unweighed ? ` · ${tally.unweighed} unweighed` : ''}</span>
          <button class="btn btn-primary" type="submit">Build my kit</button>
          <button class="btn-quiet" type="button" id="kit-skip">Add items myself</button>
        </div>
      </form>
    </section>
  `))

  // Both paths land on the kit itself — the questions are a way in, not a
  // screen to sit on.
  const showKit = () => {
    kitAskSkipped.add(trip.id)
    kitReset()
    persist()
    const target = `#/trip/${trip.id}/gear`
    if (location.hash === target) route()
    else location.hash = target
  }

  app.querySelectorAll('[data-q]').forEach(cb => cb.addEventListener('change', () => {
    const q = cb.dataset.q
    if (q === 'flying') kitAnswers.flying = cb.checked
    else {
      const set = new Set(kitAnswers[q] ?? [])
      cb.checked ? set.add(cb.value) : set.delete(cb.value)
      kitAnswers[q] = [...set]
    }
    // A chip changes which questions exist and what the tally says, so the
    // board rebuilds — focus rides back to the chip that was just tapped.
    const id = cb.id
    renderKitQuestions(trip)
    document.getElementById(id)?.focus()
  }))

  app.querySelectorAll('[data-detail]').forEach(input => input.addEventListener('input', () => {
    const [rowId, field] = input.dataset.detail.split(':')
    kitDetails[rowId] = { ...kitDetails[rowId], [field]: input.value }
  }))

  app.querySelectorAll('[data-fetch]').forEach(btn => btn.addEventListener('click', async () => {
    const rowId = btn.dataset.fetch
    const status = document.getElementById(`fetch-${rowId}`)
    const url = (kitDetails[rowId]?.url ?? '').trim()
    if (!url) { status.textContent = 'Paste a product URL first.'; return }
    btn.disabled = true
    status.textContent = 'Fetching…'
    const data = await fetchProduct(url)
    btn.disabled = false
    if (!data.ok) { status.textContent = data.error; return }
    const nameInput = app.querySelector(`[data-detail="${CSS.escape(rowId)}:name"]`)
    if (data.name && nameInput && !nameInput.value) {
      nameInput.value = data.name
      kitDetails[rowId] = { ...kitDetails[rowId], name: data.name }
    }
    if (Array.isArray(data.weightOptions) && data.weightOptions.length > 1) {
      // Same rule as the gear form: say so, never guess.
      status.textContent = `Page lists multiple weights (${data.weightOptions.join(' / ')} oz) — enter yours.`
      status.classList.add('field-error')
      return
    }
    if (typeof data.weightOz === 'number') {
      kitDetails[rowId] = { ...kitDetails[rowId], weightOz: data.weightOz }
      // The foot tally counts this weight now, so the board has to redraw —
      // otherwise the screen shows a weight and calls the item unweighed
      // in the same breath (Codex, 2026-07-27).
      renderKitQuestions(trip)
      const again = app.querySelector(`[data-fetch="${CSS.escape(rowId)}"]`)
      again?.focus()
      const said = document.getElementById(`fetch-${rowId}`)
      if (said) said.textContent = `${data.weightOz} oz`
      return
    }
    status.textContent = 'No weight on that page — type it later.'
  }))

  const copy = document.getElementById('kit-copy')
  if (copy) copy.addEventListener('click', () => {
    copyKit(source, trip)
    showKit()
  })
  document.getElementById('kit-skip').addEventListener('click', () => {
    kitAskSkipped.add(trip.id)
    kitReset()
    renderGear(trip)
  })
  document.getElementById('kit-form').addEventListener('submit', e => {
    e.preventDefault()
    trip.types = TRIP_TYPES.filter(t => kitAnswers.tripTypes.includes(t))
    trip.flying = !!kitAnswers.flying
    applyTripKit(state, trip, kitAnswers, questions, kitDetails)
    showKit()
  })
}

let gearSearch = ''
let gearNewCategory = null
let gearEditId = null
// Which gear row on the trip's gear screen has its inline editor open.
let gearRowEditId = null

function renderGearPicker(trip) {
  trip.gear ??= []
  const editing = gearEditId ? state.gearLibrary.find(g => g.id === gearEditId) ?? null : null
  const inKit = new Set(trip.gear.map(e => e.gearId))
  const q = gearSearch.trim().toLowerCase()
  const items = state.gearLibrary
    .filter(g => !inKit.has(g.id))
    .filter(g => !q || g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q))
    .sort((a, b) => GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name))
  // Gear anyone can look up, already weighed. Offered, never installed: it
  // joins your library only when you pick it (Lawrence 2026-07-27).
  const catalog = gearCatalogMatches(gearSearch, state.gearLibrary)
  app.replaceChildren(el(`
    <section class="picker">
      <a href="#/trip/${trip.id}/gear" class="back">&larr; Gear</a>
      <h1>Add Gear</h1>
      <input id="gear-search" type="search" placeholder="Search gear…" value="${esc(gearSearch)}" aria-label="Search gear">
      <ul class="food-list">
        ${items.map(g => `
          <li class="food-row">
            <button class="food-pick" data-gear-pick="${g.id}">
              <span class="food-name">${esc(g.name)}</span>
              <span class="food-macros mono">${esc(g.category)}${g.weightOz !== null ? ` · ${esc(g.weightOz)} oz` : ''}</span>
            </button>
            <button class="btn-quiet" data-gear-edit="${g.id}" aria-label="Edit ${esc(g.name)}">&#9998;</button>
          </li>`).join('')}
      </ul>
      ${catalog.length ? `
      <section class="catalog">
        <h2>Known gear</h2>
        <p class="draft-note">Weighed already. Picking one copies it into your library — nothing arrives on its own.</p>
        <ul class="food-list">
          ${catalog.map(c => `
            <li class="food-row">
              <button class="food-pick" data-catalog="${esc(c.id)}">
                <span class="food-name">${esc(c.name)} <span class="staple-tag">catalog</span></span>
                <span class="food-macros mono">${esc(c.category)}${c.weightOz !== null ? ` · ${esc(c.weightOz)} oz` : ' · no weight yet'}</span>
              </button>
            </li>`).join('')}
        </ul>
      </section>` : ''}
      <form id="gear-new" class="gear-new">
        <h2>${editing ? `Edit: ${esc(editing.name)}` : 'New gear item'}</h2>
        <label>Product page URL (optional)<input name="url" type="url" placeholder="https://kifaru.net/products/…" value="${esc(editing?.url ?? '')}"></label>
        <div class="fetch-row">
          <button class="btn" type="button" id="scrape-btn">Fetch from page</button>
          <span class="fetch-status mono" role="status" id="scrape-status"></span>
        </div>
        <label>Name<input name="name" required placeholder="Kifaru Woobie" value="${esc(editing?.name ?? '')}"></label>
        <label>Category
          <select name="category">${GEAR_CATEGORIES.map(c => `<option${c === (editing ? editing.category : gearNewCategory) ? ' selected' : ''}>${c}</option>`).join('')}</select>
        </label>
        <label>Weight oz (optional)<input name="weightOz" type="number" min="0.05" step="any" value="${esc(editing?.weightOz ?? '')}"></label>
        ${editing ? `
        <div class="onboard-actions">
          <button class="btn btn-primary" type="submit">Save changes</button>
          <button class="btn-quiet" type="button" id="gear-edit-cancel">Cancel</button>
          <button class="btn-quiet" type="button" id="gear-edit-delete">Delete from library</button>
        </div>` : `
        <button class="btn btn-primary" type="submit">Add to library + trip</button>`}
      </form>
    </section>
  `))
  const search = document.getElementById('gear-search')
  search.addEventListener('input', () => {
    gearSearch = search.value
    renderGearPicker(trip)
    const s = document.getElementById('gear-search')
    s.focus()
    s.setSelectionRange(s.value.length, s.value.length)
  })
  app.querySelectorAll('[data-gear-pick]').forEach(btn => btn.addEventListener('click', () => {
    trip.gear.push({ gearId: btn.dataset.gearPick, packed: false })
    persist()
    gearSearch = ''
    location.hash = `#/trip/${trip.id}/gear`
  }))
  app.querySelectorAll('[data-catalog]').forEach(btn => btn.addEventListener('click', () => {
    const entry = gearCatalogMatches('', state.gearLibrary).find(c => c.id === btn.dataset.catalog)
    if (!entry) return
    // Adopting takes a copy: edits to your row are yours, and the catalog is
    // never written back to from a trip.
    state.gearLibrary.push({ id: entry.id, name: entry.name, category: entry.category, weightOz: entry.weightOz, url: entry.url })
    trip.gear.push({ gearId: entry.id, packed: false })
    persist()
    gearSearch = ''
    location.hash = `#/trip/${trip.id}/gear`
  }))
  app.querySelectorAll('[data-gear-edit]').forEach(btn => btn.addEventListener('click', () => {
    gearEditId = btn.dataset.gearEdit
    renderGearPicker(trip)
  }))
  if (editing) {
    document.getElementById('gear-edit-cancel').addEventListener('click', () => {
      gearEditId = null
      renderGearPicker(trip)
    })
    document.getElementById('gear-edit-delete').addEventListener('click', () => {
      if (!confirm(`Delete "${editing.name}" from your gear library? It comes off every trip's kit too.`)) return
      state.gearLibrary = state.gearLibrary.filter(g => g.id !== editing.id)
      for (const t of state.trips) {
        if (t.gear) t.gear = t.gear.filter(e => e.gearId !== editing.id)
      }
      gearEditId = null
      persist()
      renderGearPicker(trip)
    })
  }
  document.getElementById('gear-new').addEventListener('submit', e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const fields = {
      name: f.get('name').trim(),
      category: f.get('category'),
      weightOz: f.get('weightOz') === '' ? null : Number(f.get('weightOz')),
      url: f.get('url').trim() || null,
    }
    if (editing) {
      // Filling in a blank onboarding slot happens right here: same row id,
      // real gear on it now — every trip referencing the slot updates free.
      Object.assign(editing, fields)
      gearEditId = null
      persist()
      renderGearPicker(trip)
      return
    }
    const item = { id: newId(), ...fields }
    state.gearLibrary.push(item)
    trip.gear.push({ gearId: item.id, packed: false })
    persist()
    gearSearch = ''
    location.hash = `#/trip/${trip.id}/gear`
  })
  wireScrape(document.getElementById('gear-new'), ['name', 'weightOz'])
}

function renderReady(trip) {
  trip.actions ??= []
  const r = readiness(trip, state.library, state.gearLibrary)
  const foodLine = r.fueled
    ? `Every day Fueled${r.heavyDays.length ? ` (${r.heavyDays.map(i => `Day ${i + 1}`).join(', ')} heavy)` : ''}.`
    : `Short: ${r.shortDays.map(i => `<a href="#/trip/${trip.id}/day/${i}">Day ${i + 1}</a>`).join(', ')}.`
  app.replaceChildren(el(`
    <section class="output">
      <a href="#/trip/${trip.id}" class="back">&larr; ${esc(trip.name)}</a>
      <div class="dashboard-head">
        <h1>Readiness</h1>
        <button class="btn" id="print">Print</button>
      </div>
      <p class="ready-verdict ${r.ready ? 'rollup-fueled' : 'rollup-short'}">
        ${r.ready ? 'READY. Get after it.' : 'Not ready yet.'}
      </p>
      <section class="ready-block">
        <h2>Food</h2>
        <p>${r.totalItems === 0 ? 'Nothing planned yet.' : foodLine}</p>
      </section>
      <section class="ready-block">
        <h2>Food packing</h2>
        <p>${r.packedItems} of ${r.totalItems} items packed.</p>
        ${r.unpacked.length ? `
        <ul class="unpacked mono">
          ${r.unpacked.map(u => `<li><a href="#/trip/${trip.id}/pack">Day ${u.day + 1}</a> — ${esc(u.name)} ×${u.qty}</li>`).join('')}
        </ul>` : ''}
      </section>
      <section class="ready-block">
        <h2>Gear</h2>
        <p>${r.gear.total === 0 ? `No gear list yet — <a href="#/trip/${trip.id}/gear">build one</a>.` : `${r.gear.packed} of ${r.gear.total} packed.`}</p>
        ${r.gear.unpacked.length ? `
        <ul class="unpacked mono">
          ${r.gear.unpacked.slice(0, 12).map(u => `<li><a href="#/trip/${trip.id}/gear">${esc(u.category)}</a> — ${esc(u.name)}</li>`).join('')}
          ${r.gear.unpacked.length > 12 ? `<li>…and ${r.gear.unpacked.length - 12} more</li>` : ''}
        </ul>` : ''}
      </section>
      ${trip.flying ? `<section class="ready-block"><h2>Flying</h2>${flyBlockHTML(trip)}</section>` : ''}
      <section class="ready-block">
        <h2>Pre-trip actions</h2>
        <ul class="check-list">
          ${trip.actions.map(a => `
            <li class="check-row">
              <label class="check-name ${a.done ? 'is-done' : ''}" for="act-${esc(a.id)}">${esc(a.text)}</label>
              <button class="btn-quiet" data-action-rm="${esc(a.id)}" aria-label="Remove ${esc(a.text)}">Remove</button>
              <input id="act-${esc(a.id)}" type="checkbox" data-action-done="${esc(a.id)}" ${a.done ? 'checked' : ''}>
            </li>`).join('')}
        </ul>
        <form id="action-add" class="action-add">
          <input name="text" required placeholder="Charge inReach, download maps…" aria-label="New action">
          <button class="btn" type="submit">Add</button>
        </form>
      </section>
    </section>
  `))
  wirePrint()
  app.querySelectorAll('[data-action-done]').forEach(cb => cb.addEventListener('change', () => {
    trip.actions.find(a => a.id === cb.dataset.actionDone).done = cb.checked
    commit()
  }))
  app.querySelectorAll('[data-action-rm]').forEach(btn => btn.addEventListener('click', () => {
    trip.actions = trip.actions.filter(a => a.id !== btn.dataset.actionRm)
    commit()
  }))
  document.getElementById('action-add').addEventListener('submit', e => {
    e.preventDefault()
    const text = new FormData(e.target).get('text').trim()
    if (text) trip.actions.push({ id: newId(), text, done: false })
    commit()
  })
}

function wirePrint() {
  const b = document.getElementById('print')
  if (b) b.addEventListener('click', () => window.print())
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
    persist()
    renderLibrary()
  }))
}

// Scrape-to-prefill (issue #23): fetch product data for the pasted URL and
// fill only the still-blank fields — never clobber typed values, never save.
// JSON-LD nutrition is per serving; PackOut kcal is whole-item-as-packed, so
// any filled nutrition number carries an explicit scale-it-yourself caution.
const SCRAPE_LABELS = { name: 'name', kcal: 'calories', carbsG: 'carbs', fatG: 'fat', proteinG: 'protein', weightOz: 'weight' }

function wireScrape(form, fields) {
  const btn = form.querySelector('#scrape-btn')
  const status = form.querySelector('#scrape-status')
  const say = (msg, isError) => {
    status.textContent = msg
    status.classList.toggle('field-error', !!isError)
  }
  btn.addEventListener('click', async () => {
    const url = form.elements['url'].value.trim()
    if (!url) { say('Paste a product URL first.'); return }
    btn.disabled = true
    say('Fetching…')
    const data = await fetchProduct(url)
    btn.disabled = false
    if (!data.ok) { say(data.error); return }
    const filled = fields.filter(name => {
      const input = form.elements[name]
      if (!input || input.value !== '' || data[name] == null) return false
      input.value = data[name]
      return true
    })
    if (!filled.length) {
      if (weightsAmbiguous(form, data, say)) return
      say(data.found ? 'Nothing new to fill — the blank fields weren’t on that page.' : 'No product data on that page — enter it by hand.')
      return
    }
    const nutrition = filled.some(k => ['kcal', 'carbsG', 'fatG', 'proteinG'].includes(k))
    const filledMsg = `Filled ${filled.map(k => SCRAPE_LABELS[k]).join(', ')}.` +
      (nutrition && data.perServing ? ' Nutrition is per serving — scale to the whole item as you pack it.' : '')
    const options = data.weightOptions ?? []
    if (options.length > 1 && form.elements['weightOz']?.value === '') {
      say(`${filledMsg} Page lists multiple weights (${options.join(' / ')} oz) — enter the one for your setup.`, true)
    } else {
      say(filledMsg)
    }
  })
}

// A page that states several weights has narrowed the answer without giving
// it — a tripod lists its long and short columns, a pack tables four models.
// Say so and stop: nothing in the markup says which one is on your back, and
// guessing would put a wrong number in a pack total. Lawrence 2026-07-27:
// "this is pretty common for these types of products so the user will
// understand" — so it is a sentence, not a picker.
function weightsAmbiguous(form, data, say) {
  const options = data.weightOptions ?? []
  const input = form.elements['weightOz']
  if (options.length < 2 || !input || input.value !== '') return false
  say(`Page lists multiple weights (${options.join(' / ')} oz) — enter the one for your setup.`, true)
  return true
}

function renderFoodForm(food) {
  const isNew = food === null
  const numOrBlank = v => v === null || v === undefined ? '' : v
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/library" class="back">&larr; Library</a>
      <h1>${isNew ? 'Add Food' : 'Edit Food'}</h1>
      <form id="food-form">
        <label>Product page URL (optional)
          <input name="url" type="url" value="${isNew ? '' : esc(food.url ?? '')}" placeholder="https://peakrefuel.com/products/…">
        </label>
        <div class="fetch-row">
          <button class="btn" type="button" id="scrape-btn">Fetch from page</button>
          <span class="fetch-status mono" role="status" id="scrape-status"></span>
        </div>
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
        <label>Prep
          <select name="prep">
            <option value="ready" ${isNew || food.prep !== 'cook' ? 'selected' : ''}>Ready to eat</option>
            <option value="cook" ${!isNew && food.prep === 'cook' ? 'selected' : ''}>Needs hot water</option>
          </select>
          <small>Drafts avoid hot-water breakfasts — mornings are mobile.</small>
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
      prep: f.get('prep') === 'cook' ? 'cook' : undefined,
      url: f.get('url').trim() || null,
    }
    if (isNew) {
      state.library.push({ id: newId(), favorite: false, ...values })
    } else {
      Object.assign(food, values)
    }
    persist()
    location.hash = '#/library'
  })
  wireScrape(document.getElementById('food-form'), ['name', 'kcal', 'carbsG', 'fatG', 'proteinG', 'weightOz'])
  if (!isNew) {
    document.getElementById('food-delete').addEventListener('click', () => {
      // Impact-aware cascade: never leave ghost entries that silently drop
      // calories out of existing plans.
      let refs = 0
      const tripsHit = new Set()
      for (const trip of state.trips) {
        for (const day of trip.days) {
          if (!day.meals) continue
          for (const key of ['electrolytes', 'breakfast', 'lunch', 'dinner']) {
            if (day.meals[key].some(e => e.foodId === food.id)) { refs++; tripsHit.add(trip.name) }
          }
          for (const s of day.meals.snacks) {
            if (s.items.some(e => e.foodId === food.id)) { refs++; tripsHit.add(trip.name) }
          }
        }
      }
      const warning = refs > 0
        ? `Delete "${food.name}"? It is planned in ${refs} place${refs > 1 ? 's' : ''} (${[...tripsHit].join(', ')}) — it will be removed from those plans too, and their totals will drop.`
        : `Delete "${food.name}" from the library?`
      if (!confirm(warning)) return
      state.library = state.library.filter(x => x.id !== food.id)
      for (const trip of state.trips) {
        delete trip.groceryChecked?.[food.id]
        for (const day of trip.days) {
          delete day.packed?.[food.id]
          if (!day.meals) continue
          for (const key of ['electrolytes', 'breakfast', 'lunch', 'dinner']) {
            day.meals[key] = day.meals[key].filter(e => e.foodId !== food.id)
          }
          for (const s of day.meals.snacks) {
            s.items = s.items.filter(e => e.foodId !== food.id)
          }
        }
      }
      persist()
      location.hash = '#/library'
    })
  }
}

// ---------- account gate + chip (spec #19, account-required) ----------

function renderGate() {
  app.replaceChildren(el(`
    <section class="gate">
      <h1>Sign in</h1>
      <p>Your trips live in your Google profile — sign in on any device and they follow.</p>
      <div class="gsi-holder"></div>
      <p class="build-stamp mono">build ${esc(BUILD)}</p>
    </section>
  `))
  mountSignInButton(app.querySelector('.gsi-holder'), afterSignIn).catch(() => {
    app.querySelector('.gsi-holder').innerHTML =
      '<span class="mono account-note">Sign-in unavailable — check your connection and reload.</span>'
  })
}

// Runs once a profile owns the session (boot or fresh sign-in): settle whose
// data the device cache is, then let resolveSync move the blob.
async function afterSignIn() {
  const p = account()
  if (resolveSignIn(cacheOwner(), p.sub) === 'discard') clearCache()
  setCacheOwner(p.sub)
  state = load()
  const sync = await syncNow()
  // Only a server that explicitly answered "no stored state" marks a
  // brand-new account. A sync ERROR must never look like one: stamping a
  // seeded state (or onboarding answers) with a fresh clock would overwrite
  // the real profile the moment connectivity returns.
  if (sync === 'empty') {
    // Ask their preferences before anything persists — saving (or skipping)
    // the profile stamps and pushes the state.
    if (needsProfile(state)) {
      welcomeProfile = true
      return renderProfile()
    }
    // A brand-new profile on a clean device: stamp the seeded state and push
    // it up so the next device pulls something.
    if (!state.updatedAt) persist()
  }
  route()
}

// ---------- profile (spec #24, reworked: preferences live in one place) ----------

const TRIP_TYPE_LABELS = { backpacking: 'Backpacking', rifle: 'Rifle hunt', bow: 'Bow hunt', fishing: 'Fishing' }

// First sign-in lands on the profile with a welcome line; every visit after
// that is a plain edit screen. One implementation, one home for preferences.
let welcomeProfile = false

function renderProfile() {
  const p = state.profile ?? emptyProfile()
  const welcome = welcomeProfile
  const style = p.mealStyle ?? mealStyleOf(null)
  // Same question board as the trip's kit screen (Lawrence 2026-07-27: the
  // initial questionnaire "makes me scroll unnecessarily" on a big screen).
  // One chip vocabulary across both questionnaires, one thing to learn.
  const brandChip = b => `
    <label class="chip" for="brand-${esc(b.id)}">
      <input type="checkbox" id="brand-${esc(b.id)}" name="brand" value="${esc(b.id)}"${p.brands.includes(b.id) ? ' checked' : ''}>
      <span class="chip-face"><span class="chip-label">${esc(b.label)}</span></span>
    </label>`

  app.replaceChildren(el(`
    <section class="kit-ask profile">
      ${welcome ? '' : '<a href="#/" class="back">&larr; Trips</a>'}
      <h1>${welcome ? 'Welcome to PackOut' : 'Your profile'}</h1>
      <p class="kit-lead">${welcome
        ? 'Set this up once — you can change any of it later under your name.'
        : 'Changes apply to new trips. Trips you have already planned keep the weight and style you planned them with.'}</p>
      <form id="profile-form">
        <div class="q-grid">
          <fieldset class="q-card">
            <legend>What do you weigh?</legend>
            <p class="onboard-q-hint">Drives your daily calorie and macro targets.</p>
            <label class="q-field">Body weight (lbs)
              <input name="weightLbs" type="number" min="50" max="400" value="${p.weightLbs ?? ''}" placeholder="208">
            </label>
          </fieldset>
          <fieldset class="q-card">
            <legend>Which meals do you reach for?</legend>
            <p class="onboard-q-hint">Their foods get starred, and drafting reaches for starred foods first.</p>
            <div class="chips">${BRANDS.filter(b => b.kind === 'meal').map(brandChip).join('')}</div>
          </fieldset>
          <fieldset class="q-card">
            <legend>Which snacks and drink mixes?</legend>
            <div class="chips">${BRANDS.filter(b => b.kind === 'snack').map(brandChip).join('')}</div>
          </fieldset>
          <fieldset class="q-card">
            <legend>What kind of trips do you take?</legend>
            <p class="onboard-q-hint">New trips start with these types selected.</p>
            <div class="chips">
              ${TRIP_TYPES.map(t => `
                <label class="chip" for="ptype-${t}">
                  <input type="checkbox" id="ptype-${t}" name="tripType" value="${t}"${p.tripTypes.includes(t) ? ' checked' : ''}>
                  <span class="chip-face"><span class="chip-label">${TRIP_TYPE_LABELS[t]}</span></span>
                </label>`).join('')}
            </div>
          </fieldset>
          <fieldset class="q-card q-card-wide">
            <legend>How do you eat out there?</legend>
            <p class="onboard-q-hint">Mobile meals never draft cook foods; sit-down meals welcome dehydrated
            pouches. You can always add any food to any meal by hand.</p>
            <div class="style-row">
              ${Object.entries(STYLE_LABELS).map(([slot, label]) => `
                <label>${label}
                  <select name="style-${slot}">
                    <option value="mobile"${style[slot] === 'mobile' ? ' selected' : ''}>Mobile — grab &amp; go</option>
                    <option value="sitdown"${style[slot] === 'sitdown' ? ' selected' : ''}>Sit-down — cook OK</option>
                  </select>
                </label>`).join('')}
            </div>
          </fieldset>
        </div>
        <div class="kit-foot">
          <button class="btn btn-primary" type="submit">${welcome ? 'Save and start' : 'Save'}</button>
          ${welcome ? '<button class="btn-quiet" type="button" id="profile-skip">Skip for now</button>' : ''}
        </div>
      </form>
    </section>
  `))
  const leave = () => {
    welcomeProfile = false
    location.hash = '#/'
    if ((location.hash || '#/') === '#/') route()
  }
  const skip = document.getElementById('profile-skip')
  if (skip) skip.addEventListener('click', () => {
    skipProfile(state, Date.now())
    persist()
    leave()
  })
  document.getElementById('profile-form').addEventListener('submit', e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const weight = Number(f.get('weightLbs'))
    applyProfile(state, {
      weightLbs: f.get('weightLbs') === '' ? null : weight,
      brands: f.getAll('brand'),
      tripTypes: f.getAll('tripType'),
      mealStyle: mealStyleFromForm(f),
      at: Date.now(),
    })
    persist()
    leave()
  })
}

function renderAccountChip() {
  const chip = document.getElementById('account-chip')
  if (!chip) return
  // Signed out (the gate): the masthead carries nothing but navigation.
  if (!state) { chip.replaceChildren(); return }
  const p = account()
  if (!p) {
    // Field mode: the session couldn't be verified but this device's cache
    // is owned — render, and sync when connectivity returns.
    chip.innerHTML = '<span class="mono account-note">Offline — reload when you have signal to sync.</span>'
    return
  }
  const s = syncStatus()
  const label = { idle: '', syncing: 'syncing…', synced: 'synced', error: 'sync failed' }[s]
  chip.innerHTML = `
    <a class="mono account-name" href="#/profile">${esc(p.name || 'Profile')}</a>
    <span class="mono sync-note sync-${esc(s)}">${label}</span>
    <button class="btn-quiet" id="sign-out">Sign out</button>`
  chip.querySelector('#sign-out').addEventListener('click', async () => {
    const flushed = await flushPush()
    if (!flushed && !confirm("Couldn't reach the server to save your latest changes. Sign out anyway and leave them behind?")) return
    await signOut()
    // The device is a cache of a profile, not a home: signing out clears it.
    clearCache()
    state = null
    route()
  })
}

configureSync({
  getState: () => state,
  replaceState: remote => {
    // Server blobs were validated on write, but never trust storage more
    // than an import: same gate, then local migrations catch old seeds.
    if (!validateImport(remote).ok) return
    state = applySeedMigrations(remote)
    save(state)
    route()
  },
  onChange: () => renderAccountChip(),
})

initAccount().then(({ profile, offline }) => {
  if (profile) return afterSignIn()
  if (offline && cacheOwner()) {
    // No network to verify the session, but the cache belongs to a profile —
    // field mode beats a gate nobody can pass without signal.
    state = load()
  }
  route()
})

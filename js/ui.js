// UI layer — renders state, dispatches events. No nutrition logic lives here.

import { dailyTargets, slotTargets, sumEntries, dayTotals, emptyMeals, dayVerdict, tripVerdict, stapleIds, suggestions, pickerRank, groceryList, dayPackList, readiness, validateImport, plannedDayOptions, gearStats, draftDay, draftEmptyDays, mealStyleOf, resolveSignIn } from './engine.js'
import { load, save, newId, corruptInfo, cacheOwner, setCacheOwner, clearCache } from './store.js'
import { applySeedMigrations } from './seed.js'
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
  const outMatch = hash.match(/^#\/trip\/(.+)\/(grocery|pack|ready|gear)$/)
  if (outMatch) {
    const trip = state.trips.find(t => t.id === outMatch[1])
    if (trip) {
      if (outMatch[2] === 'grocery') return renderGrocery(trip)
      if (outMatch[2] === 'pack') return renderPack(trip)
      if (outMatch[2] === 'gear') return renderGear(trip)
      return renderReady(trip)
    }
  }
  const editDayMatch = hash.match(/^#\/trip\/(.+)\/day\/(\d+)\/edit$/)
  if (editDayMatch) {
    const trip = state.trips.find(t => t.id === editDayMatch[1])
    if (trip && trip.days[Number(editDayMatch[2])]) return renderDay(trip, Number(editDayMatch[2]))
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
  renderDashboard()
}

window.addEventListener('hashchange', route)

// Masthead nav is navigation, not tabs/filters — mark the active section.
function updateNav() {
  const inLibrary = (location.hash || '#/').startsWith('#/library')
  document.querySelectorAll('.masthead-nav a').forEach(a => {
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
      <div id="account-chip" class="account-chip"></div>
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
  renderAccountChip()
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
        ${mealStyleFields(mealStyleOf(last))}
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
      mealStyle: mealStyleFromForm(f),
      days: Array.from({ length: Number(f.get('days')) }, () => ({ intensity: 'medium' })),
    }
    state.trips.push(trip)
    persist()
    location.hash = `#/trip/${trip.id}`
  })
}

// ---------- edit trip ----------

function renderEditTrip(trip) {
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/trip/${trip.id}" class="crumb">&larr; ${esc(trip.name)}</a>
      <h1>Edit Trip</h1>
      <form id="edit-trip">
        <label>Trip name
          <input name="name" required value="${esc(trip.name)}">
        </label>
        <label>Destination
          <input name="destination" required value="${esc(trip.destination)}">
        </label>
        <label>Start date
          <input name="startDate" type="date" required value="${trip.startDate}">
        </label>
        <label>Days
          <input name="days" type="number" min="1" max="30" required value="${trip.days.length}">
          <small>Adding days appends empty ones; removing days deletes them from the end.</small>
        </label>
        <label>Your body weight (lbs)
          <input name="weightLbs" type="number" min="50" max="400" required value="${trip.weightLbs}">
        </label>
        ${mealStyleFields(mealStyleOf(trip))}
        <button class="btn btn-primary" type="submit">Save</button>
      </form>
    </section>
  `))
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
    trip.mealStyle = mealStyleFromForm(f)
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
      <a href="${openDay !== null ? `#/trip/${trip.id}` : '#/'}" class="crumb" id="surface-crumb">${openDay !== null ? `&lsaquo; ${esc(trip.name)}` : '&larr; Trips'}</a>
      <div class="trip-head">
        <h1>${esc(trip.name)}</h1>
        <p class="trip-sub">${esc(trip.destination)} · <span class="mono">${tripDateRange(trip)}</span> · ${trip.weightLbs} lbs · <a class="trip-edit-link" href="#/trip/${trip.id}/edit">Edit trip</a></p>
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

// Board content is a day *summary* — always computed from the engine, never
// constants (audit 2026-07-25). Editing lives one level deeper at /edit.
function fillBoard(trip, i, { focus = true } = {}) {
  const day = trip.days[i]
  const board = document.getElementById('board')
  if (!board) return
  // A same-day re-render replaces the board's DOM; if the user was focused on
  // a control inside it, put focus back on its replacement (finish review).
  const refocusId = !focus && board.contains(document.activeElement) ? document.activeElement.id : null
  const t = dailyTargets(trip.weightLbs, day.intensity)
  const st = slotTargets(t)
  const planned = dayTotals(day, state.library)
  const hasPlan = planned.kcal > 0
  const v = hasPlan ? dayVerdict(day, trip.weightLbs, state.library) : null
  const delta = planned.kcal - t.kcal.target
  const slotSub = key => sumEntries(day.meals?.[key] ?? [], state.library)
  const names = list => list.map(e => {
    const f = state.library.find(x => x.id === e.foodId)
    const n = f ? f.name.replace('Peak Refuel ', '').replace(' (2 oz)', '').replace(' (per oz)', '') : '(deleted food)'
    return e.qty > 1 ? `${esc(n)} ×${e.qty}` : esc(n)
  }).join(' · ')
  const b = slotSub('breakfast')
  const inWin = b.kcal >= st.breakfast.kcalMin && b.kcal <= st.breakfast.kcalMax
  const snacks = (day.meals?.snacks ?? []).flatMap(s => s.items)
  const snackSub = sumEntries(snacks, state.library)
  const din = slotSub('dinner')
  const slotRow = (label, sub, dd, extra = '') => sub.kcal === 0 && !dd ? '' : `
    <div class="slotrow"><span class="t">${label}</span><span class="n">${sub.kcal.toLocaleString()}</span>
    ${dd ? `<span class="dd">${dd}</span>` : ''}${extra}</div>`
  board.innerHTML = `
    <div class="fc">
      <h2 id="board-title" tabindex="-1">Day ${i + 1} — ${dayDate(trip, i)}</h2>
      <div class="fmeta">
        <label class="intensity"><span class="intensity-label">Effort</span>
          <select id="board-intensity" aria-label="Effort for day ${i + 1}">
            ${INTENSITIES.map(x => `<option value="${x}" ${x === day.intensity ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}
          </select>
        </label>
        <span>TARGET ${fmt(t.kcal.target)} KCAL · PROTEIN FLOOR ${t.proteinG.floor} G</span>
      </div>
      ${hasPlan ? `
      <div class="big"><span class="n">${planned.kcal.toLocaleString()}</span><span class="of">planned / ${fmt(t.kcal.target)} target · Δ ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()}</span></div>
      <span class="obadge obadge-${v.status}">Outlook · ${VERDICT_LABELS[v.status]}</span>
      ${v.status !== 'fueled' ? `<p class="gap-line${v.status === 'heavy' ? ' gap-heavy' : ''}">${gapSentence(v)}</p>` : ''}
      <div class="discussion">
        <div class="k">Forecast discussion</div>
        <p>${forecastDiscussion(day, t, st, planned, v, b, din, snackSub)}</p>
      </div>
      <div class="editrow">
        <a class="btn btn-primary" href="#/trip/${trip.id}/day/${i}/edit">Edit this day</a>
      </div>` : `
      <div class="big"><span class="n">—</span><span class="of">nothing planned · target ${fmt(t.kcal.target)} kcal</span></div>
      <span class="obadge obadge-none">No plan yet</span>
      <div class="editrow">
        <button class="btn btn-primary" id="board-draft">Draft this day</button>
        <a class="btn" href="#/trip/${trip.id}/day/${i}/edit">Build by hand</a>
      </div>`}
    </div>
    <div class="board-slots">
      ${slotRow('Breakfast', b, names(day.meals?.breakfast ?? []),
        b.kcal ? `<span class="w ${inWin ? 'in' : 'out'}">${inWin ? 'In window' : 'Outside window'} ${st.breakfast.kcalMin}–${st.breakfast.kcalMax}</span>` : '')}
      ${slotRow('Lunch', slotSub('lunch'), names(day.meals?.lunch ?? []))}
      ${slotRow('Dinner', din, names(day.meals?.dinner ?? []))}
      ${snacks.length ? slotRow(`Snacks · ${day.meals.snacks.length} bundle${day.meals.snacks.length > 1 ? 's' : ''}`, snackSub, names(snacks)) : ''}
      ${slotRow('Electrolytes', slotSub('electrolytes'), names(day.meals?.electrolytes ?? []))}
    </div>`
  const sel = document.getElementById('board-intensity')
  if (sel) sel.addEventListener('change', e => { day.intensity = e.target.value; commit() })
  const draftBtn = document.getElementById('board-draft')
  if (draftBtn) draftBtn.addEventListener('click', () => {
    day.meals = draftDay(trip, i, state.library, stapleIds(state.trips), 'usual')
    delete day.packed
    commit()
  })
  const announce = document.getElementById('announce')
  if (announce) announce.textContent = hasPlan
    ? `Day ${i + 1} — outlook ${VERDICT_LABELS[v.status]}`
    : `Day ${i + 1} — nothing planned yet`
  if (focus) document.getElementById('board-title')?.focus()
  else if (refocusId) document.getElementById(refocusId)?.focus()
}

function forecastDiscussion(day, t, st, planned, v, b, din, snackSub) {
  const parts = []
  parts.push(`${day.intensity === 'easy' ? 'An' : 'A'} ${day.intensity} day ${v.status === 'fueled' ? 'in the window' : v.status === 'short' ? 'running short' : 'running heavy'}.`)
  if (b.kcal) parts.push(`Breakfast holds ${b.kcal.toLocaleString()} kcal ${b.kcal >= st.breakfast.kcalMin && b.kcal <= st.breakfast.kcalMax ? 'inside' : 'outside'} its ${st.breakfast.kcalMin}–${st.breakfast.kcalMax} band;`)
  if (din.kcal) {
    const gap = din.kcal - st.dinner.kcal
    parts.push(`dinner runs ${Math.abs(gap).toLocaleString()} ${gap < 0 ? 'under' : 'over'} its share${snackSub.kcal ? ` and snacks carry ${snackSub.kcal.toLocaleString()} kcal` : ''}.`)
  }
  const pOver = planned.proteinG - t.proteinG.floor
  parts.push(pOver >= 0 ? `Protein finishes ${pOver} g above the floor.` : `Protein sits ${Math.abs(pOver)} g under the floor.`)
  parts.push(`Pack weight: ${planned.weightOz} oz logged${planned.missingWeightCount ? `, ${planned.missingWeightCount} item${planned.missingWeightCount > 1 ? 's' : ''} unweighed` : ''}.`)
  return parts.join(' ')
}

// Same-surface route change: morph instead of re-render so the strip→scrubber
// motion actually plays. Column data refreshes (a commit may have changed it).
function updateTripSurface(surface, trip, openDay) {
  const wasOpen = surface.classList.contains('day-open')
  surface.classList.toggle('day-open', openDay !== null)
  surface.querySelectorAll('.strip li').forEach((li, i) => {
    li.innerHTML = dayColumn(trip, trip.days[i], i, openDay)
  })
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
  const crumb = document.getElementById('surface-crumb')
  if (crumb) {
    crumb.setAttribute('href', openDay !== null ? `#/trip/${trip.id}` : '#/')
    crumb.innerHTML = openDay !== null ? `&lsaquo; ${esc(trip.name)}` : '&larr; Trips'
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

// One place resolves a slot key ('breakfast', 'snack-2', …) to its entry list.
function resolveEntries(day, key) {
  return key.startsWith('snack-')
    ? day.meals.snacks[Number(key.slice(6))].items
    : day.meals[key]
}

function entryRows(entries, slotKey) {
  return entries.map((e, j) => {
    const f = state.library.find(x => x.id === e.foodId)
    return `
      <li class="entry">
        <span class="entry-name">${esc(foodName(e.foodId))}</span>
        <span class="entry-kcal mono">${f ? sumEntries([e], state.library).kcal.toLocaleString() + ' kcal' : '—'}</span>
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
      <a href="#/trip/${trip.id}/day/${i}" class="crumb">&lsaquo; Day ${i + 1} forecast</a>
      <div class="day-screen-head">
        <h1>Day ${i + 1}</h1>
        <span class="day-date">${dayDate(trip, i)}</span>
        <label class="intensity">
          <span class="intensity-label">Effort</span>
          <select id="day-intensity">
            ${INTENSITIES.map(x => `<option value="${x}" ${x === day.intensity ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}
          </select>
        </label>
      </div>
      <dl class="targets day-totals mono">
        <div class="totals-legend"><dt></dt><dd>planned / target</dd></div>
        <div><dt>kcal</dt><dd>${totals.kcal.toLocaleString()} / ${fmt(targets.kcal.target)}</dd></div>
        <div><dt>Carbs</dt><dd>${totals.carbsG} / ${targets.carbsG.min}–${targets.carbsG.max} g</dd></div>
        <div><dt>Protein</dt><dd>${totals.proteinG} / ${targets.proteinG.min}–${targets.proteinG.max} g</dd></div>
        <div><dt>Fat</dt><dd>${totals.fatG} / ${targets.fatG.min}–${targets.fatG.max} g</dd></div>
        <div><dt>Weight</dt><dd>${totals.weightOz} oz${totals.missingWeightCount ? ` <span class="floor">+${totals.missingWeightCount} unweighed</span>` : ''}</dd></div>
        ${totals.calsPerOz ? `<div><dt>Cals/oz</dt><dd>${totals.calsPerOz}</dd></div>` : ''}
      </dl>
      ${totals.kcal === 0 ? `
      <section class="draft-panel">
        <p class="draft-lead">Let PackOut propose this day from your usual food — then edit anything.</p>
        <div class="backup-actions">
          <button class="btn btn-primary" data-draft="usual">Draft this day</button>
          <button class="btn" data-draft="optimized">Optimized draft</button>
        </div>
        <p class="draft-note">…or build it manually below.</p>
      </section>` : ''}
      ${verdictBlock}
      ${totals.kcal > 0 ? `
      <div class="draft-redo">
        <span class="draft-note">Re-propose this day (replaces the current plan):</span>
        <button class="btn" data-draft="usual">Draft</button>
        <button class="btn" data-draft="optimized">Optimized</button>
      </div>` : ''}
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
      ${importOptions(trip, i)}
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
  app.querySelectorAll('[data-draft]').forEach(btn => btn.addEventListener('click', () => {
    const current = dayTotals(day, state.library)
    if (current.kcal > 0) {
      const count = dayPackList(day, state.library).length
      const ok = confirm(
        `Day ${i + 1} already has ${count} item${count > 1 ? 's' : ''} planned — ` +
        `drafting replaces that work and resets this day's packed marks.`)
      if (!ok) return
    }
    day.meals = draftDay(trip, i, state.library, stapleIds(state.trips), btn.dataset.draft)
    delete day.packed
    commit()
  }))
  wireImportDay(trip, i, day)
  const copyApply = document.getElementById('copy-apply')
  if (copyApply) copyApply.addEventListener('click', () => {
    const j = Number(document.getElementById('copy-target').value)
    if (confirm(`Replace Day ${j + 1}'s plan with Day ${i + 1}'s?`)) {
      trip.days[j].meals = structuredClone(day.meals)
      delete trip.days[j].packed // new plan, stale marks would lie
      persist()
      location.hash = `#/trip/${trip.id}/day/${j}`
    }
  })

  app.querySelectorAll('[data-qty]').forEach(btn => btn.addEventListener('click', () => {
    const [key, j, delta] = btn.dataset.qty.split(':')
    const entry = resolveEntries(day, key)[Number(j)]
    entry.qty = Math.max(1, entry.qty + Number(delta))
    commit()
  }))
  app.querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', () => {
    const [key, j] = btn.dataset.rm.split(':')
    resolveEntries(day, key).splice(Number(j), 1)
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

// Import a planned day from any trip — proven meals over manual re-entry.
function importOptions(trip, i) {
  const options = plannedDayOptions(state.trips, state.library)
    .filter(o => !(o.tripId === trip.id && o.dayIndex === i))
  if (!options.length) return ''
  const byTrip = new Map()
  for (const o of options) {
    if (!byTrip.has(o.tripId)) byTrip.set(o.tripId, { name: o.tripName, days: [] })
    byTrip.get(o.tripId).days.push(o)
  }
  return `
    <section class="copy-day">
      <label>Import a day's plan from
        <select id="import-source">
          ${[...byTrip.values()].map(g => `
            <optgroup label="${esc(g.name)}">
              ${g.days.map(o => `<option value="${o.tripId}:${o.dayIndex}">Day ${o.dayIndex + 1} — ${o.kcal.toLocaleString()} kcal</option>`).join('')}
            </optgroup>`).join('')}
        </select>
      </label>
      <button class="btn" id="import-apply">Import</button>
    </section>`
}

function wireImportDay(trip, i, day) {
  const btn = document.getElementById('import-apply')
  if (!btn) return
  btn.addEventListener('click', () => {
    const [tripId, dayIndex] = document.getElementById('import-source').value.split(':')
    const source = state.trips.find(t => t.id === tripId)?.days[Number(dayIndex)]
    if (!source) return
    const sourceName = state.trips.find(t => t.id === tripId).name
    if (confirm(`Replace Day ${i + 1}'s plan with ${sourceName} Day ${Number(dayIndex) + 1}'s?`)) {
      day.meals = structuredClone(source.meals)
      delete day.packed
      commit()
    }
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
      <a href="#/trip/${trip.id}/day/${i}/edit" class="crumb">&larr; Day ${i + 1}</a>
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
    persist()
    pickerSearch = ''
    location.hash = `#/trip/${trip.id}/day/${i}/edit`
  }))
}

// ---------- outputs: grocery, pack plan, readiness ----------

function renderGrocery(trip) {
  trip.groceryChecked ??= {}
  const rows = groceryList(trip, state.library)
  app.replaceChildren(el(`
    <section class="output">
      <a href="#/trip/${trip.id}" class="crumb">&larr; ${esc(trip.name)}</a>
      <div class="dashboard-head">
        <h1>Grocery</h1>
        <button class="btn" id="print">Print</button>
      </div>
      ${rows.length === 0 ? '<p class="empty">Nothing planned yet — build some days first.</p>' : `
      <ul class="check-list">
        ${rows.map(r => `
          <li>
            <label class="check-row">
              <input type="checkbox" data-check="${r.foodId}" data-count="${r.count}" ${trip.groceryChecked[r.foodId] === r.count ? 'checked' : ''}>
              <span class="check-name ${trip.groceryChecked[r.foodId] === r.count ? 'is-done' : ''}">${esc(r.name)}</span>
              <span class="check-qty mono">×${r.count}</span>
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
      <a href="#/trip/${trip.id}" class="crumb">&larr; ${esc(trip.name)}</a>
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
                  <input type="checkbox" data-pack="${i}:${it.foodId}" data-qty="${it.qty}" ${day.packed?.[it.foodId] === it.qty ? 'checked' : ''}>
                  <span class="check-name ${day.packed?.[it.foodId] === it.qty ? 'is-done' : ''}">${esc(it.name)}</span>
                  <span class="check-qty mono">×${it.qty}</span>
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

const GEAR_CATEGORIES = [
  'Pack', 'Shelter/Sleeping', 'Water', 'Food kit', 'Weapon', 'Optics/Bino Pouch',
  'Kill kit', 'First aid & Safety', 'Clothing worn', 'Clothing packed', 'Luxuries',
]

function renderGear(trip) {
  trip.gear ??= []
  const byId = new Map(state.gearLibrary.map(g => [g.id, g]))
  const stats = gearStats(trip, state.gearLibrary)
  const inKit = new Set(trip.gear.map(e => e.gearId))
  const otherTrips = state.trips.filter(t => t.id !== trip.id && (t.gear?.length ?? 0) > 0)
  const grouped = GEAR_CATEGORIES
    .map(cat => ({ cat, entries: trip.gear.filter(e => byId.get(e.gearId)?.category === cat) }))
    .filter(g => g.entries.length > 0)
  app.replaceChildren(el(`
    <section class="output">
      <a href="#/trip/${trip.id}" class="crumb">&larr; ${esc(trip.name)}</a>
      <div class="dashboard-head">
        <h1>Gear</h1>
        <button class="btn" id="print">Print</button>
      </div>
      ${trip.gear.length ? `
      <p class="gear-stats mono">${stats.packed} / ${stats.total} packed${stats.weightOz ? ` · ${stats.weightOz} oz known weight` : ''}${stats.missingWeightCount ? ` · ${stats.missingWeightCount} unweighed` : ''}</p>` : `
      <p class="empty">No gear on this trip yet. Start from your standard kit, or add items one by one.</p>`}
      <div class="backup-actions gear-actions">
        <button class="btn" id="gear-full-kit">Add full kit</button>
        <a class="btn" href="#/trip/${trip.id}/gear/add">Add item</a>
        ${otherTrips.length ? `
        <label class="gear-import-label">Import kit from
          <select id="gear-import-source">
            ${otherTrips.map(t => `<option value="${t.id}">${esc(t.name)} (${t.gear.length} items)</option>`).join('')}
          </select>
        </label>
        <button class="btn" id="gear-import">Import</button>` : ''}
      </div>
      ${grouped.map(g => `
        <section class="pack-day">
          <h2>${esc(g.cat)}</h2>
          <ul class="check-list">
            ${g.entries.map(e => {
              const item = byId.get(e.gearId)
              return `
              <li>
                <label class="check-row">
                  <input type="checkbox" data-gear-pack="${e.gearId}" ${e.packed ? 'checked' : ''}>
                  <span class="check-name ${e.packed ? 'is-done' : ''}">${esc(item.name)}</span>
                  <span class="check-qty mono">${item.weightOz !== null ? `${item.weightOz} oz` : ''}</span>
                  <button class="btn-quiet" data-gear-rm="${e.gearId}" aria-label="Remove ${esc(item.name)}">×</button>
                </label>
              </li>`
            }).join('')}
          </ul>
        </section>`).join('')}
    </section>
  `))
  wirePrint()
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
  app.querySelectorAll('[data-gear-pack]').forEach(cb => cb.addEventListener('change', () => {
    const entry = trip.gear.find(e => e.gearId === cb.dataset.gearPack)
    entry.packed = cb.checked
    commit()
  }))
  app.querySelectorAll('[data-gear-rm]').forEach(btn => btn.addEventListener('click', e => {
    e.preventDefault()
    trip.gear = trip.gear.filter(x => x.gearId !== btn.dataset.gearRm)
    commit()
  }))
}

let gearSearch = ''

function renderGearPicker(trip) {
  trip.gear ??= []
  const inKit = new Set(trip.gear.map(e => e.gearId))
  const q = gearSearch.trim().toLowerCase()
  const items = state.gearLibrary
    .filter(g => !inKit.has(g.id))
    .filter(g => !q || g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q))
    .sort((a, b) => GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name))
  app.replaceChildren(el(`
    <section class="picker">
      <a href="#/trip/${trip.id}/gear" class="crumb">&larr; Gear</a>
      <h1>Add Gear</h1>
      <input id="gear-search" type="search" placeholder="Search gear…" value="${esc(gearSearch)}" aria-label="Search gear">
      <ul class="food-list">
        ${items.map(g => `
          <li class="food-row">
            <button class="food-pick" data-gear-pick="${g.id}">
              <span class="food-name">${esc(g.name)}</span>
              <span class="food-macros mono">${esc(g.category)}${g.weightOz !== null ? ` · ${g.weightOz} oz` : ''}</span>
            </button>
          </li>`).join('')}
      </ul>
      <form id="gear-new" class="gear-new">
        <h2>New gear item</h2>
        <label>Product page URL (optional)<input name="url" type="url" placeholder="https://kifaru.net/products/…"></label>
        <div class="fetch-row">
          <button class="btn" type="button" id="scrape-btn">Fetch from page</button>
          <span class="fetch-status mono" role="status" id="scrape-status"></span>
        </div>
        <label>Name<input name="name" required placeholder="Kifaru Woobie"></label>
        <label>Category
          <select name="category">${GEAR_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select>
        </label>
        <label>Weight oz (optional)<input name="weightOz" type="number" min="0.05" step="any"></label>
        <button class="btn btn-primary" type="submit">Add to library + trip</button>
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
  document.getElementById('gear-new').addEventListener('submit', e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const item = {
      id: newId(),
      name: f.get('name').trim(),
      category: f.get('category'),
      weightOz: f.get('weightOz') === '' ? null : Number(f.get('weightOz')),
      url: f.get('url').trim() || null,
    }
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
      <a href="#/trip/${trip.id}" class="crumb">&larr; ${esc(trip.name)}</a>
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
      <section class="ready-block">
        <h2>Pre-trip actions</h2>
        <ul class="check-list">
          ${trip.actions.map(a => `
            <li>
              <label class="check-row">
                <input type="checkbox" data-action-done="${a.id}" ${a.done ? 'checked' : ''}>
                <span class="check-name ${a.done ? 'is-done' : ''}">${esc(a.text)}</span>
                <button class="btn-quiet" data-action-rm="${a.id}" aria-label="Remove ${esc(a.text)}">×</button>
              </label>
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
  app.querySelectorAll('[data-action-rm]').forEach(btn => btn.addEventListener('click', e => {
    e.preventDefault()
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
  const say = msg => { status.textContent = msg }
  btn.addEventListener('click', async () => {
    const url = form.elements['url'].value.trim()
    if (!url) { say('Paste a product URL first.'); return }
    btn.disabled = true
    say('Fetching…')
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (res.status === 401) { say('Sign in to fetch product pages.'); return }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) { say(data?.error ?? `Couldn't fetch that page (HTTP ${res.status}).`); return }
      const filled = fields.filter(name => {
        const input = form.elements[name]
        if (!input || input.value !== '' || data[name] == null) return false
        input.value = data[name]
        return true
      })
      if (!filled.length) {
        say(data.found ? 'Nothing new to fill — the blank fields weren’t on that page.' : 'No product data on that page — enter it by hand.')
        return
      }
      const nutrition = filled.some(k => ['kcal', 'carbsG', 'fatG', 'proteinG'].includes(k))
      say(`Filled ${filled.map(k => SCRAPE_LABELS[k]).join(', ')}.` +
        (nutrition && data.perServing ? ' Nutrition is per serving — scale to the whole item as you pack it.' : ''))
    } catch {
      say('Couldn’t reach the fetch service — offline or local dev.')
    } finally {
      btn.disabled = false
    }
  })
}

function renderFoodForm(food) {
  const isNew = food === null
  const numOrBlank = v => v === null || v === undefined ? '' : v
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/library" class="crumb">&larr; Library</a>
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
  await syncNow()
  // A brand-new profile on a clean device: stamp the seeded state and push
  // it up so the next device pulls something.
  if (!state.updatedAt) persist()
  route()
}

function renderAccountChip() {
  const chip = document.getElementById('account-chip')
  if (!chip) return
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
    <span class="mono account-name">${esc(p.name || 'Signed in')}</span>
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

// The unified trip surface (spec: DESIGN.md "unified A→C"): the 7-day outlook
// strip IS the day navigation, the point-forecast board IS the day editor,
// and the food picker feeds it. Same-surface route changes morph instead of
// re-rendering so the strip→scrubber motion actually plays.

import { dailyTargets, slotTargets, sumEntries, dayTotals, emptyMeals, dayVerdict, tripVerdict, stapleIds, suggestions, pickerRank, dayPackList, plannedDayOptions, declinedIds, draftDay, draftEmptyDays } from '../engine.js'
import { state, persist, commit } from '../state.js'
import { app, el, esc } from '../dom.js'
import { INTENSITIES, VERDICT_LABELS, SLOT_LABELS, fmt, fmtOz, macroLine, dayDate, tripDateRange, conditionsLine, gapSentence } from '../format.js'

// ---------- trip view ----------

// The unified trip surface (spec: DESIGN.md "unified A→C"): the 7-day outlook
// strip IS the day navigation. openDay !== null opens the point-forecast board
// in place; same-surface route changes morph classes instead of re-rendering.
export function renderTrip(trip, openDay = null) {
  const existing = app.querySelector(`.trip-surface[data-trip="${trip.id}"]`)
  if (existing) return updateTripSurface(existing, trip, openDay)

  app.replaceChildren(el(`
    <section class="trip-surface${openDay !== null ? ' day-open' : ''}" data-trip="${trip.id}">
      <a href="${openDay !== null ? `#/trip/${trip.id}` : '#/'}" class="back" id="surface-back">${openDay !== null ? `&larr; ${esc(trip.name)}` : '&larr; Trips'}</a>
      <div class="trip-head">
        <h1>${esc(trip.name)}</h1>
        <p class="trip-sub">
          <span>${esc(trip.destination)}</span>
          <span>${tripDateRange(trip)}</span>
          <span>${trip.weightLbs} lbs</span>
          <a class="trip-edit-link" href="#/trip/${trip.id}/edit">Edit trip</a>
        </p>
        ${trip.place ? `<p class="trip-conditions mono">${esc(conditionsLine(trip, { withLabel: false }))}</p>` : ''}
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
  const snackSub = slotSub('snacks')
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
        <div><dt>Weight</dt><dd>${fmtOz(planned.weightOz)}${planned.missingWeightCount ? ` <span class="floor">+${planned.missingWeightCount} unweighed</span>` : ''}</dd></div>
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
      ${boardSlot(trip, i, 'snacks', 'Snacks', snackSub, day.meals.snacks)}
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
  parts.push(`Pack weight: ${fmtOz(planned.weightOz)} logged${planned.missingWeightCount ? `, ${planned.missingWeightCount} item${planned.missingWeightCount > 1 ? 's' : ''} unweighed` : ''}.`)
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

// Escape backs out of an open day anywhere on the unified surface.
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  const m = (location.hash || '').match(/^#\/trip\/(.+)\/day\/\d+$/)
  if (m) location.hash = `#/trip/${m[1]}`
})

// ---------- day meal builder ----------

function foodName(id) {
  const f = state.library.find(x => x.id === id)
  return f ? f.name : '(deleted food)'
}

// One place resolves a slot key ('breakfast', 'snacks', …) to its entry list.
function resolveEntries(day, key) {
  return day.meals[key]
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

// The Add control belonging to a given entry list's slot.
function slotAddControl(key) {
  return document.querySelector(`[data-slot="${CSS.escape(key)}"] .btn-add`)
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
    // very list that was emptied.
    const idx = Math.min(Number(j), entries.length - 1)
    const next = idx >= 0 ? document.getElementById(`rm-${key}-${idx}`) : null
    ;(next ?? slotAddControl(key))?.focus()
  }))
  document.querySelectorAll('#board [data-sugg]').forEach(btn => btn.addEventListener('click', () => {
    const food = state.library.find(f => f.id === btn.dataset.sugg)
    if (!food) return
    // Accepting a suggestion un-declines it: the user just asked for it back.
    if (trip.declined?.includes(food.id)) trip.declined = trip.declined.filter(id => id !== food.id)
    const slot = food.slotHint === 'snack' ? 'snacks' : food.slotHint
    const entries = day.meals[slot] ?? day.meals.lunch
    const existing = entries.find(e => e.foodId === food.id)
    if (existing) existing.qty += 1
    else entries.push({ foodId: food.id, qty: 1 })
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

export function renderPicker(trip, i, slotKey) {
  const day = trip.days[i]
  day.meals ??= emptyMeals()
  const slotBase = slotKey === 'snacks' ? 'snack' : slotKey
  const q = pickerSearch.trim().toLowerCase()
  const staples = stapleIds(state.trips)
  const foods = pickerRank(state.library, staples, slotBase)
    .filter(f => !q || f.name.toLowerCase().includes(q))
  const slotLabel = SLOT_LABELS[slotKey]
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

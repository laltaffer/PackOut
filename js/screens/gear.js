// The trip's gear world: the gear screen, the kit questions that build it,
// the gear picker, and the airline-restriction notes.

import { gearStats, carryModeOf, flyIssues, tripFoodWeight } from '../engine.js'
import { tripGearQuestions, tripTypes, kitRows, applyTripKit, copyKit, gearCatalogMatches, TRIP_TYPES, GEAR_CATEGORIES } from '../seed.js'
import { newId } from '../store.js'
import { state, persist, commit, rerender } from '../state.js'
import { app, el, esc, wirePrint } from '../dom.js'
import { TRIP_TYPE_LABELS, fmtOz, conditionsLine } from '../format.js'
import { lookupProduct, wireScrape } from '../api.js'
import { isBlankSlot, gearEditorFields, gearEditorValues, deleteGearFromLibrary } from './gear-editor.js'

// ---------- gear ----------

// A trip whose kit is empty gets asked rather than shown an empty list. This
// remembers the trips where the user said "I'll add them myself" so the ask
// doesn't reappear on every visit — session-only, deliberately not synced.
const kitAskSkipped = new Set()

// Route entry: arriving from the router clears any inline row edit; internal
// re-renders (kit skip, editor saves) keep it open.
export function openGear(trip) {
  gearRowEditId = null
  renderGear(trip)
}

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
  const food = tripFoodWeight(trip, state.library)
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
      <p class="gear-stats mono">${stats.packed} / ${stats.total} packed${stats.missingWeightCount ? ` · ${stats.missingWeightCount} unweighed` : ''}</p>
      ${stats.carriedOz || food.weightOz ? `
      <dl class="carry-split">
        <div><dt>Gear in your pack</dt><dd>${fmtOz(stats.weightOz)}</dd></div>
        ${food.weightOz || food.missingWeightCount ? `<div><dt>Food · ${trip.days.length} day${trip.days.length > 1 ? 's' : ''}</dt><dd>${fmtOz(food.weightOz)}${food.missingWeightCount ? ` <span class="floor">+${food.missingWeightCount} unweighed</span>` : ''}</dd></div>` : ''}
        <div class="carry-total"><dt>Total pack</dt><dd>${fmtOz(stats.weightOz + food.weightOz)}</dd></div>
        ${stats.harnessOz ? `<div><dt>On your harness</dt><dd>${fmtOz(stats.harnessOz)}</dd></div>` : ''}
        ${stats.wornOz ? `<div><dt>Worn</dt><dd>${fmtOz(stats.wornOz)}</dd></div>` : ''}
        <div class="carry-total"><dt>Total carried</dt><dd>${fmtOz(stats.carriedOz + food.weightOz)}</dd></div>
      </dl>` : ''}` : `
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
        ${blank
          // A slot still wearing its catalog name is a question, not an item.
          // Ticking "packed" on a tent you have not chosen means nothing, so
          // the name itself is the invitation to say which one is yours
          // (Lawrence 2026-07-27: "I've been removing the generic and adding
          // my specific" — the edit was there, it just did not read as one).
          ? `<button class="check-name blank-cta" data-gear-edit-row="${esc(item.id)}" aria-expanded="${open}">${esc(item.name)}<span class="blank-hint">name yours</span></button>`
          : `<label class="check-name ${entry.packed ? 'is-done' : ''}" for="${cb}">${esc(item.name)}</label>`}
        <span class="check-meta mono">${item.weightOz !== null ? fmtOz(item.weightOz) : 'no weight'}${carryModeOf(item) !== 'pack' ? ` · ${carryModeOf(item)}` : ''}</span>
        ${blank ? '' : `<button class="btn-quiet" data-gear-edit-row="${esc(item.id)}" aria-expanded="${open}">Edit</button>`}
        <button class="btn-quiet gear-rm" data-gear-rm="${esc(item.id)}" aria-label="Remove ${esc(item.name)} from this trip">&times;</button>
        <input id="${cb}" type="checkbox" data-gear-pack="${esc(item.id)}" ${entry.packed ? 'checked' : ''}>
      </div>
      ${open ? `
      <form class="gear-inline" id="gear-inline">
        ${gearEditorFields(item, blank)}
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
    // The edit lands on the library row, so every trip sharing this slot gets
    // the real item — that is what makes naming it once worth doing.
    Object.assign(item, gearEditorValues(e.target, item))
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

export function flyBlockHTML(trip) {
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

export function renderKitQuestions(trip) {
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
                  meta: g.weightOz !== null ? fmtOz(g.weightOz) : 'no weight yet',
                })).join('')}
                ${q.options.map(o => chip(q.id, o.value, q.items.length ? `+ ${o.label}` : o.label, {
                  note: o.note, suggested: o.suggested, checked: picked(q).includes(o.value),
                })).join('')}
              </div>
              ${q.options.filter(o => picked(q).includes(o.value)).map(o => detailRow(q.id, o)).join('')}
            </fieldset>`).join('')}
        </div>
        <div class="kit-foot">
          <span class="kit-tally mono">${tally.count} item${tally.count === 1 ? '' : 's'}${tally.oz ? ` · ${fmtOz(tally.oz)} known` : ''}${tally.unweighed ? ` · ${tally.unweighed} unweighed` : ''}</span>
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
    if (location.hash === target) rerender()
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
    const data = await lookupProduct(url, { onRetry: () => { status.textContent = 'Reading it from your browser…' } })
    btn.disabled = false
    if (!data.ok) {
      status.textContent = data.error
      status.classList.add('field-error')
      return
    }
    status.classList.remove('field-error')
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

export function renderGearPicker(trip) {
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
              <span class="food-macros mono">${esc(g.category)}${g.weightOz !== null ? ` · ${fmtOz(g.weightOz)}` : ''}</span>
            </button>
            <button class="btn-quiet" data-gear-edit="${g.id}">Edit</button>
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
                <span class="food-macros mono">${esc(c.category)}${c.weightOz !== null ? ` · ${fmtOz(c.weightOz)}` : ' · no weight yet'}</span>
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
      if (!deleteGearFromLibrary(editing)) return
      gearEditId = null
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


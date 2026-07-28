// Import from a Google Sheet link (issue #26). Interpretation is pure and
// tested in js/sheet-import.js; this screen is the preview and the commit.
// Nothing writes until the user has seen exactly what will be created —
// duplicates arrive disabled, foods without calories don't import, and a
// day plan either resolves completely or is refused with the reason.

import { parseCsv, interpretSheet, markDuplicates, planToDays } from '../sheet-import.js'
import { GEAR_CATEGORIES } from '../seed.js'
import { newId } from '../store.js'
import { state, persist } from '../state.js'
import { app, el, esc } from '../dom.js'
import { fetchSheet } from '../api.js'

let sheetUrl = ''
let result = null   // interpretSheet output, dup-annotated — the preview
let summary = null  // what the last commit did

export function renderImport() {
  if (summary) return renderSummary()
  if (result) return renderPreview()
  renderLinkForm()
}

function renderLinkForm(error = '') {
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/" class="back">&larr; Dashboard</a>
      <h1>Import from Google Sheets</h1>
      <p>Paste a link to a Google Sheet — a packing list, a food list with
      calories, or a day-by-day plan. You'll see everything it found and
      choose what joins your library before anything is saved.</p>
      <form id="sheet-form">
        <label>Sheet link
          <input name="url" type="url" required value="${esc(sheetUrl)}"
            placeholder="https://docs.google.com/spreadsheets/d/…">
        </label>
        <small>The sheet must be shared: in Google Sheets, Share → General
        access → “Anyone with the link”.</small>
        ${error ? `<p class="field-error">⚠ ${esc(error)}</p>` : ''}
        <button class="btn btn-primary" type="submit" id="sheet-fetch">Fetch sheet</button>
      </form>
    </section>
  `))
  document.getElementById('sheet-form').addEventListener('submit', async e => {
    e.preventDefault()
    sheetUrl = e.target.elements['url'].value.trim()
    const btn = document.getElementById('sheet-fetch')
    btn.disabled = true
    btn.textContent = 'Fetching…'
    const res = await fetchSheet(sheetUrl)
    if (!res.ok) return renderLinkForm(res.error)
    const parsed = interpretSheet(parseCsv(res.csv))
    if (!parsed.groups.length && !parsed.plan) {
      return renderLinkForm('No lists found in that sheet — PackOut reads header groups (CLOTHING, FOOD, …), nutrition tables, or Day 1…N plans.')
    }
    result = markDuplicates(parsed, { library: state.library, gearLibrary: state.gearLibrary })
    renderImport()
  })
}

function renderPreview() {
  const { groups, plan, warnings } = result
  app.replaceChildren(el(`
    <section class="form-screen import-preview">
      <a href="#/" class="back">&larr; Dashboard</a>
      <h1>Choose what to import</h1>
      <p>From your sheet: uncheck anything that shouldn't join your library.
      Items already in your library are skipped automatically.</p>
      ${warnings.map(w => `<p class="field-error">⚠ ${esc(w)}</p>`).join('')}
      ${plan ? `
      <section class="pack-day">
        <h2>Day plan <span class="check-meta">${plan.days.length} days</span></h2>
        <p>Imports as a new trip — meals land on each day exactly as the sheet
        lists them.</p>
        <label>Trip name
          <input id="import-trip-name" value="Imported plan">
        </label>
      </section>` : ''}
      ${groups.map((g, gi) => `
      <section class="pack-day">
        <h2>${esc(g.header || 'Ungrouped')} <span class="check-meta">${g.kind === 'food' ? 'food' : 'gear'}</span></h2>
        ${g.kind === 'gear' ? `
        <label class="import-cat">Category
          <select data-group-cat="${gi}">
            <option value="">As guessed per item</option>
            ${GEAR_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
          </select>
        </label>` : ''}
        <ul class="check-list">
          ${g.items.map((it, ii) => `
          <li class="check-row">
            <input class="import-name" data-name="${gi}:${ii}" value="${esc(it.name)}" aria-label="Item name">
            ${it.note ? `<span class="check-meta">${esc(it.note)}</span>` : ''}
            ${it.dup ? '<span class="check-meta">already in your library</span>' : ''}
            ${g.kind === 'food' && !it.dup ? `
            <input class="import-kcal" data-kcal="${gi}:${ii}" type="number" min="1" step="any"
              value="${it.kcal ?? ''}" placeholder="kcal" aria-label="Calories for ${esc(it.name)}">` : ''}
            <input type="checkbox" data-item="${gi}:${ii}" ${it.dup ? 'disabled' : 'checked'}
              aria-label="Import ${esc(it.name)}">
          </li>`).join('')}
        </ul>
      </section>`).join('')}
      <div class="onboard-actions">
        <button class="btn btn-primary" id="import-commit">Import selected</button>
        <button class="btn-quiet" id="import-restart">Start over</button>
      </div>
    </section>
  `))
  document.getElementById('import-restart').addEventListener('click', () => {
    result = null
    renderImport()
  })
  document.getElementById('import-commit').addEventListener('click', commit)
}

function commit() {
  const { groups, plan } = result
  const counts = { foods: 0, gear: 0, dups: 0, needKcal: [] }
  for (const [gi, g] of groups.entries()) {
    const groupCat = g.kind === 'gear'
      ? document.querySelector(`[data-group-cat="${gi}"]`).value
      : ''
    for (const [ii, it] of g.items.entries()) {
      if (it.dup) { counts.dups++; continue }
      if (!document.querySelector(`[data-item="${gi}:${ii}"]`).checked) continue
      const name = document.querySelector(`[data-name="${gi}:${ii}"]`).value.trim().slice(0, 200)
      if (!name) continue
      if (g.kind === 'gear') {
        state.gearLibrary.push({
          id: newId(), name,
          category: groupCat || it.category,
          weightOz: null, url: null,
        })
        counts.gear++
      } else {
        const kcal = Number(document.querySelector(`[data-kcal="${gi}:${ii}"]`)?.value)
        if (!kcal || kcal <= 0) { counts.needKcal.push(name); continue }
        state.library.push({
          id: newId(), favorite: false, name, kcal,
          carbsG: it.carbsG ?? null, fatG: it.fatG ?? null,
          proteinG: it.proteinG ?? null, weightOz: it.weightOz ?? null,
          slotHint: 'snack', url: null,
        })
        counts.foods++
      }
    }
  }
  let planOutcome = null
  if (plan) {
    const { days, missing } = planToDays(plan, state.library)
    if (days) {
      const trip = {
        id: newId(), createdAt: Date.now(),
        name: document.getElementById('import-trip-name').value.trim() || 'Imported plan',
        destination: '',
        startDate: new Date().toISOString().slice(0, 10),
        weightLbs: state.profile?.weightLbs ?? 180,
        days,
      }
      state.trips.push(trip)
      planOutcome = { tripId: trip.id, tripName: trip.name, days: days.length, defaultWeight: !state.profile?.weightLbs }
    } else {
      planOutcome = { missing }
    }
  }
  persist()
  summary = { ...counts, plan: planOutcome }
  result = null
  renderImport()
}

function renderSummary() {
  const s = summary
  app.replaceChildren(el(`
    <section class="form-screen">
      <a href="#/" class="back">&larr; Dashboard</a>
      <h1>Imported</h1>
      <ul class="import-summary">
        ${s.gear ? `<li>${s.gear} gear item${s.gear > 1 ? 's' : ''} added — weights are blank; open the <a href="#/library/gear">gear shelf</a> to weigh or link them.</li>` : ''}
        ${s.foods ? `<li>${s.foods} food${s.foods > 1 ? 's' : ''} added to your <a href="#/library">library</a>.</li>` : ''}
        ${s.dups ? `<li>${s.dups} already in your library — left untouched.</li>` : ''}
        ${s.needKcal.length ? `<li>${s.needKcal.length} food${s.needKcal.length > 1 ? 's' : ''} had no calories and did not import: ${esc(s.needKcal.join(', '))}. Add them from the Library when you know the numbers.</li>` : ''}
        ${s.plan?.tripId ? `<li>Day plan imported as <a href="#/trip/${s.plan.tripId}">${esc(s.plan.tripName)}</a> (${s.plan.days} days)${s.plan.defaultWeight ? ' — set your body weight in Edit Trip so the targets are yours' : ''}.</li>` : ''}
        ${s.plan?.missing ? `<li>The day plan did not import — it names food${s.plan.missing.length > 1 ? 's' : ''} with no calories on the sheet or in your library: ${esc(s.plan.missing.join(', '))}.</li>` : ''}
        ${!s.gear && !s.foods && !s.plan ? '<li>Nothing was selected.</li>' : ''}
      </ul>
      <div class="onboard-actions">
        <button class="btn" id="import-again">Import another sheet</button>
      </div>
    </section>
  `))
  document.getElementById('import-again').addEventListener('click', () => {
    summary = null
    sheetUrl = ''
    renderImport()
  })
}

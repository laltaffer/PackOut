// Output screens: grocery list, per-day pack plan, and the readiness rollup.

import { groceryList, dayPackList, readiness } from '../engine.js'
import { newId } from '../store.js'
import { state, commit } from '../state.js'
import { app, el, esc, wirePrint } from '../dom.js'
import { dayDate } from '../format.js'
import { flyBlockHTML } from './gear.js'

// ---------- outputs: grocery, pack plan, readiness ----------

export function renderGrocery(trip) {
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

export function renderPack(trip) {
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

export function renderReady(trip) {
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

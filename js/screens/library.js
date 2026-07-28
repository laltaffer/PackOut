// The Library is everything you own, independent of any trip — and that has
// always been two things, food and gear. Only food had a screen, so adding a
// piece of gear said "added to your library" and the Library tab showed food
// (Lawrence, 2026-07-27). One roof, two shelves.

import { carryModeOf } from '../engine.js'
import { GEAR_CATEGORIES } from '../seed.js'
import { newId } from '../store.js'
import { state, persist } from '../state.js'
import { app, el, esc } from '../dom.js'
import { macroLine, fmtOz } from '../format.js'
import { wireScrape } from '../api.js'
import { isBlankSlot, gearEditorFields, gearEditorValues, deleteGearFromLibrary } from './gear-editor.js'

const SLOT_HINTS = ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snack']
let librarySearch = ''
// Which gear row in the Library has its editor open.
let libraryGearEditId = null

export function renderLibrary(tab = 'food') {
  const q = librarySearch.trim().toLowerCase()
  const shelves = `
    <nav class="shelves" role="tablist" aria-label="Library">
      <a role="tab" href="#/library" aria-selected="${tab === 'food'}">Food <span class="mono">${state.library.length}</span></a>
      <a role="tab" href="#/library/gear" aria-selected="${tab === 'gear'}">Gear <span class="mono">${state.gearLibrary.length}</span></a>
    </nav>`
  if (tab === 'gear') return renderGearLibrary(q, shelves)

  // Arriving on the food shelf closes any half-open gear editor.
  libraryGearEditId = null
  const foods = state.library
    .filter(f => !q || f.name.toLowerCase().includes(q))
    .sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name))
  app.replaceChildren(el(`
    <section class="library">
      <div class="dashboard-head">
        <h1>Library</h1>
        <a class="btn btn-primary" href="#/library/new">Add Food</a>
      </div>
      ${shelves}
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
  wireLibrarySearch(() => renderLibrary('food'))
  app.querySelectorAll('[data-fav]').forEach(btn => btn.addEventListener('click', () => {
    const food = state.library.find(f => f.id === btn.dataset.fav)
    food.favorite = !food.favorite
    persist()
    renderLibrary('food')
  }))
}

// Everything you own, weighed or not — editable here without going through a
// trip, because a typo or a weight you finally put on a scale is not a
// trip-shaped thought.
function renderGearLibrary(q, shelves) {
  const items = state.gearLibrary
    .filter(g => !q || g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q))
    .sort((a, b) => GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name))
  const weighed = state.gearLibrary.filter(g => g.weightOz !== null)
  const totalOz = Math.round(weighed.reduce((a, g) => a + g.weightOz, 0) * 10) / 10
  app.replaceChildren(el(`
    <section class="library">
      <div class="dashboard-head">
        <h1>Library</h1>
      </div>
      ${shelves}
      ${state.gearLibrary.length ? `
      <p class="gear-stats mono">${weighed.length} of ${state.gearLibrary.length} weighed · ${fmtOz(totalOz)} logged</p>` : ''}
      <input id="lib-search" type="search" placeholder="Search ${state.gearLibrary.length} gear items…" value="${esc(librarySearch)}" aria-label="Search gear">
      ${state.gearLibrary.length === 0 ? `
      <p class="empty">No gear yet. Gear joins your library when you answer a trip's
      kit questions, pick it from Known gear, or add it by hand on a trip.</p>` : ''}
      <ul class="food-list">
        ${items.map(g => `
          <li class="gear-item">
            <div class="food-row">
              <button class="food-pick" data-lib-gear="${esc(g.id)}" aria-expanded="${libraryGearEditId === g.id}">
                <span class="food-name">${esc(g.name)}${isBlankSlot(g) ? '<span class="blank-hint">name yours</span>' : ''}</span>
                <span class="food-macros mono">${esc(g.category)}${g.weightOz !== null ? ` · ${fmtOz(g.weightOz)}` : ' · no weight'}${carryModeOf(g) !== 'pack' ? ` · ${carryModeOf(g)}` : ''}${g.url ? ' · linked' : ''}</span>
              </button>
            </div>
            ${libraryGearEditId === g.id ? `
            <form class="gear-inline" id="gear-inline">
              ${gearEditorFields(g, isBlankSlot(g))}
              <div class="onboard-actions">
                <button class="btn btn-primary" type="submit">Save</button>
                <button class="btn-quiet" type="button" id="gear-lib-cancel">Cancel</button>
                <button class="btn-quiet" type="button" id="gear-lib-delete">Delete from library</button>
              </div>
            </form>` : ''}
          </li>`).join('')}
      </ul>
      ${state.gearLibrary.length && items.length === 0 ? '<p class="empty">No gear matches.</p>' : ''}
    </section>
  `))
  wireLibrarySearch(() => renderLibrary('gear'))
  app.querySelectorAll('[data-lib-gear]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.libGear
    libraryGearEditId = libraryGearEditId === id ? null : id
    renderLibrary('gear')
    document.querySelector(`[data-lib-gear="${CSS.escape(id)}"]`)?.focus()
  }))
  const form = document.getElementById('gear-inline')
  if (!form) return
  const item = state.gearLibrary.find(g => g.id === libraryGearEditId)
  document.getElementById('gear-lib-cancel').addEventListener('click', () => {
    libraryGearEditId = null
    renderLibrary('gear')
  })
  document.getElementById('gear-lib-delete').addEventListener('click', () => {
    if (!deleteGearFromLibrary(item)) return
    libraryGearEditId = null
    renderLibrary('gear')
  })
  form.addEventListener('submit', e => {
    e.preventDefault()
    Object.assign(item, gearEditorValues(e.target, item))
    libraryGearEditId = null
    persist()
    renderLibrary('gear')
  })
  wireScrape(form, ['name', 'weightOz'])
}

// One search box, two shelves — the query survives the tab it was typed on.
function wireLibrarySearch(rerender) {
  const search = document.getElementById('lib-search')
  if (!search) return
  search.addEventListener('input', () => {
    librarySearch = search.value
    const keep = document.activeElement === search
    rerender()
    if (keep) {
      const s = document.getElementById('lib-search')
      s.focus()
      s.setSelectionRange(s.value.length, s.value.length)
    }
  })
}

export function renderFoodForm(food) {
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

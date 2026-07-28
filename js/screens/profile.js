// Profile board (spec #24, reworked: preferences live in one place). First
// sign-in lands here with a welcome line; every visit after that is a plain
// edit screen. One implementation, one home for preferences.

import { mealStyleOf } from '../engine.js'
import { emptyProfile, applyProfile, skipProfile, BRANDS, TRIP_TYPES } from '../seed.js'
import { state, persist, rerender } from '../state.js'
import { app, el, esc } from '../dom.js'
import { STYLE_LABELS, TRIP_TYPE_LABELS } from '../format.js'
import { setBrand } from '../brand.js'
import { mealStyleFromForm } from './trip-form.js'

let welcomeProfile = false

// The first-sign-in entry: ask preferences before anything persists.
export function openWelcomeProfile() {
  welcomeProfile = true
  renderProfile()
}

export function renderProfile() {
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
          <fieldset class="q-card">
            <legend>Which look do you want?</legend>
            <p class="onboard-q-hint">Two designs over one app. Switch whenever you like.</p>
            <div class="chips" id="brand-chips">
              ${[['flag', 'One Flag on Snow'], ['command', 'Field Command']].map(([id, label]) => `
                <label class="chip" for="brand-look-${id}">
                  <input type="radio" name="brandLook" id="brand-look-${id}" value="${id}"${document.documentElement.dataset.brand === id ? ' checked' : ''}>
                  <span class="chip-face"><span class="chip-label">${label}</span></span>
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
  // The look is a preference, not part of the saved profile — it belongs to
  // this device, the way the dock always set it. Applies on tap, no save.
  app.querySelectorAll('[name="brandLook"]').forEach(r => r.addEventListener('change', () => {
    setBrand(r.value)
  }))
  const leave = () => {
    welcomeProfile = false
    location.hash = '#/'
    if ((location.hash || '#/') === '#/') rerender()
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

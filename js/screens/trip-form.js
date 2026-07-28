// New-trip and edit-trip forms, plus the shared field groups (meal style,
// trip types) and the advisory destination lookup wiring.

import { dayTotals, mealStyleOf } from '../engine.js'
import { TRIP_TYPES, tripTypes } from '../seed.js'
import { newId } from '../store.js'
import { state, persist } from '../state.js'
import { app, el, esc } from '../dom.js'
import { STYLE_LABELS, TRIP_TYPE_LABELS, conditionsLine } from '../format.js'
import { lookupDestination } from '../api.js'

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
function wireDestination(form, onPlace, hasPlace = false) {
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
  // The in-flight lookup, so a submit can wait for it instead of racing it.
  let pending = null
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
  const start = () => { pending = run(); return pending }
  dest.addEventListener('change', start)
  // Typing resolves it while the form is still being filled, so saving rarely
  // has anything to wait for. `change` alone fires on blur — which for someone
  // who edits a field and goes straight for Save is the same instant as the
  // submit (Lawrence 2026-07-27: "it's not registering or trying to look up").
  let typing
  dest.addEventListener('input', () => {
    clearTimeout(typing)
    typing = setTimeout(start, 600)
  })
  for (const name of ['startDate', 'days']) {
    // Dates and length change the conditions, not the place — re-ask only
    // once a destination is actually on the form.
    form.elements[name]?.addEventListener('change', () => { if (dest.value.trim()) start() })
  }
  // A trip that predates the lookup has a destination and no place data, and
  // nothing would ever ask: `change` only fires on an edit. Ask on open.
  if (dest.value.trim() && !hasPlace) start()

  // Saving waits for an answer already on its way, but never hangs on one:
  // the lookup is advisory, and a trip must always be saveable.
  const settle = async () => {
    if (!pending) return
    await Promise.race([pending, new Promise(r => setTimeout(r, 2500))])
  }
  return { snapshot, settle }
}

export function mealStyleFromForm(f) {
  const pick = v => v === 'sitdown' ? 'sitdown' : 'mobile'
  return {
    breakfast: pick(f.get('style-breakfast')),
    lunch: pick(f.get('style-lunch')),
    dinner: pick(f.get('style-dinner')),
  }
}

export function renderNewTrip() {
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
  const { snapshot, settle } = wireDestination(
    document.getElementById('new-trip'), (place, asked) => { found = place && { place, asked } })
  // A new trip has nothing to preserve: it takes the lookup that answered
  // exactly this form, or nothing at all.
  document.getElementById('new-trip').addEventListener('submit', async e => {
    e.preventDefault()
    await settle()
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

export function renderEditTrip(trip) {
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
  // `hasPlace` is false for any trip made before the lookup existed, so opening
  // Edit finally asks for it instead of waiting for a destination edit that
  // never comes.
  const { snapshot, settle } = wireDestination(
    document.getElementById('edit-trip'), (place, asked) => { found = place && { place, asked } }, !!trip.place)
  const wasAsked = snapshot()
  document.getElementById('edit-trip').addEventListener('submit', async e => {
    e.preventDefault()
    await settle()
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

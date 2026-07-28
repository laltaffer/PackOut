// UI layer — renders state, dispatches events. No nutrition logic lives here.

import { validateImport, resolveSignIn } from './engine.js'
import { load, save, cacheOwner, setCacheOwner, clearCache } from './store.js'
import { applySeedMigrations, needsProfile } from './seed.js'
import { configureSync, initAccount, account, syncStatus, syncNow, signOut, flushPush, mountSignInButton } from './sync.js'
// `state` is null until a profile (or field mode) materializes it — route()
// gates on it, so no trip data ever renders signed out.
import { state, setState, onRerender, persist } from './state.js'
import { app, el, esc, BUILD } from './dom.js'
import './brand.js' // wires the desktop brand dock at import
import { renderDashboard } from './screens/dashboard.js'
import { renderNewTrip, renderEditTrip } from './screens/trip-form.js'
import { renderTrip, renderPicker } from './screens/trip.js'
import { openGear, renderGearPicker, renderKitQuestions } from './screens/gear.js'
import { renderGrocery, renderPack, renderReady } from './screens/outputs.js'
import { renderLibrary, renderFoodForm } from './screens/library.js'
import { renderProfile, openWelcomeProfile } from './screens/profile.js'

// ---------- routing (hash-based so the phone back button works) ----------

function route() {
  // The account chip lives in the masthead, so signing out is reachable from
  // every screen — not just the dashboard.
  renderAccountChip()
  if (!state) return renderGate()
  updateNav()
  const hash = location.hash || '#/'
  const pickMatch = hash.match(/^#\/trip\/(.+)\/day\/(\d+)\/add\/([a-z]+)$/)
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
      if (outMatch[2] === 'gear') return openGear(trip)
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
  if (hash === '#/library/gear') return renderLibrary('gear')
  if (hash === '#/library') return renderLibrary('food')
  if (hash === '#/new') return renderNewTrip()
  if (hash === '#/profile') return renderProfile()
  renderDashboard()
}

window.addEventListener('hashchange', route)
// commit() re-renders through this seam — screens never import the router.
onRerender(route)

// Masthead nav is navigation, not tabs/filters — mark the active section.
function updateNav() {
  const inLibrary = (location.hash || '#/').startsWith('#/library')  // both shelves
  // Direct children only — the account chip's profile link is navigation for
  // the person, not a section, and must never wear the active underline.
  document.querySelectorAll('.masthead-nav > a').forEach(a => {
    const isLibrary = a.getAttribute('href') === '#/library'
    a.classList.toggle('is-active', isLibrary === inLibrary)
  })
}


// ---------- account gate + chip (spec #19, account-required) ----------

function renderGate() {
  // Redirect-mode sign-in bounces back here with ?signin=failed rather than
  // dying on a blank page, so the gate has to say what happened.
  const failed = new URLSearchParams(location.search).get('signin') === 'failed'
  app.replaceChildren(el(`
    <section class="gate">
      <h1>Sign in</h1>
      ${failed ? '<p class="field-error">That sign-in didn\'t complete. Try again — and if you opened this from a link inside another app, opening it in Safari or Chrome is more reliable.</p>' : ''}
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
  setState(load())
  const sync = await syncNow()
  // Only a server that explicitly answered "no stored state" marks a
  // brand-new account. A sync ERROR must never look like one: stamping a
  // seeded state (or onboarding answers) with a fresh clock would overwrite
  // the real profile the moment connectivity returns.
  if (sync === 'empty') {
    // Ask their preferences before anything persists — saving (or skipping)
    // the profile stamps and pushes the state.
    if (needsProfile(state)) return openWelcomeProfile()
    // A brand-new profile on a clean device: stamp the seeded state and push
    // it up so the next device pulls something.
    if (!state.updatedAt) persist()
  }
  route()
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
    setState(null)
    route()
  })
}

configureSync({
  getState: () => state,
  replaceState: remote => {
    // Server blobs were validated on write, but never trust storage more
    // than an import: same gate, then local migrations catch old seeds.
    if (!validateImport(remote).ok) return
    setState(applySeedMigrations(remote))
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
    setState(load())
  }
  route()
})

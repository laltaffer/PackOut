// Trips dashboard: upcoming/past cards, delete, and the backup seam
// (export/import JSON, corrupt-state recovery).

import { dayTotals, tripVerdict, validateImport } from '../engine.js'
import { save, corruptInfo } from '../store.js'
import { applySeedMigrations } from '../seed.js'
import { account, schedulePush } from '../sync.js'
import { state, setState, commit, rerender } from '../state.js'
import { app, el, esc, BUILD } from '../dom.js'
import { tripDateRange } from '../format.js'

export function renderDashboard() {
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
    setState(data)
    schedulePush()
    rerender()
  })
}

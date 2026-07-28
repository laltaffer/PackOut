// The shared gear-item editor: one editor body for a gear item, wherever it
// is opened from (the trip's gear screen or the Library's gear shelf).
// Adding a field here reaches both at once.

import { carryModeOf, CARRY_MODES } from '../engine.js'
import { genericGearName, GEAR_CATEGORIES } from '../seed.js'
import { state, persist } from '../state.js'
import { esc } from '../dom.js'

// A row that still carries its question's generic name and no weight is a
// slot, not a decision. Saying so is the whole point of the note: "there is
// nothing that lets me specify what I'm actually bringing."
export function isBlankSlot(item) {
  if (!item.id.startsWith('ob-') || item.weightOz !== null || item.url) return false
  // Naming it is answering the question, even without a weight yet (Codex,
  // 2026-07-27) — only a row still wearing its catalog label is a slot.
  return item.name === genericGearName(item.id)
}

const CARRY_LABELS = { pack: 'In the pack', harness: 'On my harness', worn: 'Worn' }

// `blank` = the row still wears its catalog name, so the box starts empty
// (Fetch only fills blanks) while the placeholder keeps saying what the slot
// is for.
export function gearEditorFields(item, blank = false) {
  return `
    <label>Name<input name="name" value="${blank ? '' : esc(item.name)}" placeholder="${esc(item.name)}"></label>
    <label>Product page URL<input name="url" type="url" value="${esc(item.url ?? '')}" placeholder="https://…"></label>
    <div class="fetch-row">
      <button class="btn" type="button" id="scrape-btn">Fetch name + weight</button>
      <span class="fetch-status mono" role="status" id="scrape-status"></span>
    </div>
    <div class="macro-grid">
      <label>Weight oz<input name="weightOz" type="number" min="0.05" step="any" value="${esc(item.weightOz ?? '')}"></label>
      <label>Category
        <select name="category">${GEAR_CATEGORIES.map(c => `<option${c === item.category ? ' selected' : ''}>${c}</option>`).join('')}</select>
      </label>
    </div>
    <label>Where it rides
      <select name="carry">${CARRY_MODES.map(m => `<option value="${m}"${m === carryModeOf(item) ? ' selected' : ''}>${CARRY_LABELS[m]}</option>`).join('')}</select>
      <small>Only what's in the pack counts toward pack weight. Harness and worn
      still count toward what you carry.</small>
    </label>`
}

// What the editor's form says the item now is. Leaving the name blank keeps
// the slot's own label rather than blanking it.
export function gearEditorValues(form, item) {
  const f = new FormData(form)
  return {
    name: f.get('name').trim() || item.name,
    category: f.get('category'),
    weightOz: f.get('weightOz') === '' ? null : Number(f.get('weightOz')),
    url: f.get('url').trim() || null,
    carry: f.get('carry'),
  }
}

// Deleting gear is one act wherever it is done: it leaves the library and
// every trip that carried it. Names the trips first — a kit quietly losing an
// item is how you find out at the trailhead.
export function deleteGearFromLibrary(item) {
  const onTrips = state.trips.filter(t => (t.gear ?? []).some(e => e.gearId === item.id))
  const warning = onTrips.length
    ? `Delete "${item.name}" from your gear library? It comes off ${onTrips.length} trip${onTrips.length > 1 ? 's' : ''} too (${onTrips.map(t => t.name).join(', ')}).`
    : `Delete "${item.name}" from your gear library?`
  if (!confirm(warning)) return false
  state.gearLibrary = state.gearLibrary.filter(g => g.id !== item.id)
  for (const t of state.trips) {
    if (t.gear) t.gear = t.gear.filter(e => e.gearId !== item.id)
  }
  persist()
  return true
}

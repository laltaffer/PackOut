// Storage adapter — the only module that touches localStorage.

import { SEED, applySeedMigrations } from './seed.js'

const KEY = 'packout/v1'

const DEFAULT_STATE = { schemaVersion: 1, trips: [] }

// Seed once: fills the library on first run (or for states created before the
// library existed) without ever clobbering user edits to seeded foods.
function ensureLibrary(state) {
  if (!Array.isArray(state.library)) {
    state.library = SEED.foods.map(f => ({ ...f, favorite: false }))
    state.seedVersion = SEED.version
  }
  return state
}

// Packed marks are quantity-stamped numbers; drop anything else (e.g. booleans
// written by earlier builds) so stale marks read as unpacked, never as packed.
function sanitizePacked(state) {
  for (const trip of state.trips) {
    for (const day of trip.days ?? []) {
      if (!day.packed) continue
      for (const [k, v] of Object.entries(day.packed)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) delete day.packed[k]
      }
    }
  }
  return state
}

let corrupt = null

// Non-null after load() had to fall back because stored state was unreadable:
// { key, raw } of the preserved copy, for a UI recovery banner.
export function corruptInfo() {
  return corrupt
}

export function load() {
  let raw
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return ensureLibrary(structuredClone(DEFAULT_STATE))
  }
  if (!raw) return ensureLibrary(structuredClone(DEFAULT_STATE))
  try {
    const state = JSON.parse(raw)
    if (!state || state.schemaVersion !== 1 || !Array.isArray(state.trips)) throw new Error('bad shape')
    return applySeedMigrations(sanitizePacked(ensureLibrary(state)))
  } catch {
    // Never crash the shell on corrupt state; keep a timestamped copy and
    // expose it via corruptInfo() so the UI can offer recovery.
    const key = `${KEY}/corrupt-${Date.now()}`
    try { localStorage.setItem(key, raw) } catch { /* full or blocked */ }
    corrupt = { key, raw }
    return ensureLibrary(structuredClone(DEFAULT_STATE))
  }
}

// Returns true when the state actually reached disk. Quota/security failures
// return false so callers can warn instead of silently losing edits.
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function newId() {
  return crypto.randomUUID()
}

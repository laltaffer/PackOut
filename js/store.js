// Storage adapter — the only module that touches localStorage.

import { SEED } from './seed.js'

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
    return ensureLibrary(state)
  } catch {
    // Never crash the shell on corrupt state; keep the corpse for manual rescue.
    try { localStorage.setItem(KEY + '/corrupt', raw) } catch { /* full or blocked */ }
    return ensureLibrary(structuredClone(DEFAULT_STATE))
  }
}

export function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function newId() {
  return crypto.randomUUID()
}

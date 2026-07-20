// Storage adapter — the only module that touches localStorage.

const KEY = 'packout/v1'

const DEFAULT_STATE = { schemaVersion: 1, trips: [] }

export function load() {
  let raw
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return structuredClone(DEFAULT_STATE)
  }
  if (!raw) return structuredClone(DEFAULT_STATE)
  try {
    const state = JSON.parse(raw)
    if (!state || state.schemaVersion !== 1 || !Array.isArray(state.trips)) throw new Error('bad shape')
    return state
  } catch {
    // Never crash the shell on corrupt state; keep the corpse for manual rescue.
    try { localStorage.setItem(KEY + '/corrupt', raw) } catch { /* full or blocked */ }
    return structuredClone(DEFAULT_STATE)
  }
}

export function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function newId() {
  return crypto.randomUUID()
}

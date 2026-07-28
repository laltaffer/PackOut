// App-state holder — the one place the in-memory state lives, and the seam
// between "a screen changed something" and "the app persists and re-renders".
// `state` is a live binding: importers always read the current object, so
// boot, sign-out and sync replacement swap it in one place.

import { save } from './store.js'
import { schedulePush } from './sync.js'

export let state = null

export function setState(s) {
  state = s
}

// The router registers itself here so screens can trigger a re-render without
// importing the entry module (which imports them).
let rerenderFn = () => {}

export function onRerender(fn) {
  rerenderFn = fn
}

export function rerender() {
  rerenderFn()
}

let warnedSaveFailure = false

export function persist() {
  if (save(state)) {
    schedulePush()
    return true
  }
  if (!warnedSaveFailure) {
    warnedSaveFailure = true
    alert('Saving failed — browser storage is full or blocked. Your latest change may not survive a reload. Export a backup from the Trips screen now.')
  }
  return false
}

export function commit() {
  persist()
  rerenderFn()
}

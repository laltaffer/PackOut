// Account + sync layer (spec #19). Local-first: localStorage stays the
// working copy; this module mirrors it to the profile when signed in.
// Whole-state last-write-wins — resolveSync (engine) makes the call, this
// module just moves the blob. Signed out, nothing here runs a request
// except the single /api/me probe at boot.

import { resolveSync } from './engine.js'

export const GOOGLE_CLIENT_ID = '174203219428-gqpd1eg96se72a133pel20tgd43qv5sh.apps.googleusercontent.com'
const PUSH_DEBOUNCE_MS = 2000

let profile = null            // { sub, name } | null
let status = 'idle'           // idle | syncing | synced | error
let hooks = { getState: () => null, replaceState: () => {}, onChange: () => {} }
let pushTimer = null

export function configureSync(h) { hooks = { ...hooks, ...h } }
export function account() { return profile }
export function syncStatus() { return status }

function setStatus(s) {
  status = s
  hooks.onChange()
}

const api = (path, opts = {}) => fetch(path, { credentials: 'same-origin', ...opts })

export async function initAccount() {
  try {
    const res = await api('/api/me')
    profile = res.ok ? await res.json() : null
  } catch {
    profile = null
  }
  if (profile) await syncNow()
  return profile
}

export async function signInWithCredential(credential) {
  const res = await api('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) throw new Error('Sign-in rejected.')
  profile = await res.json()
  await syncNow()
  return profile
}

export async function signOut() {
  try { await api('/api/logout', { method: 'POST' }) } catch { /* cookie may outlive; next /api/me settles it */ }
  profile = null
  clearTimeout(pushTimer)
  setStatus('idle')
}

// Pull-or-push to agreement with the server. Runs at sign-in and boot; the
// pull path replaces local state wholesale (the UI re-renders and persists).
export async function syncNow() {
  if (!profile) return
  setStatus('syncing')
  try {
    const res = await api('/api/state')
    if (!res.ok) throw new Error(String(res.status))
    const remote = await res.json()
    const local = hooks.getState()
    const action = resolveSync(local?.updatedAt, remote)
    if (action === 'pull') hooks.replaceState(remote.state)
    else if (action === 'push') await push(local)
    setStatus('synced')
  } catch {
    setStatus('error')
  }
}

export function schedulePush() {
  if (!profile) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    setStatus('syncing')
    try {
      await push(hooks.getState())
      setStatus('synced')
    } catch {
      setStatus('error')
    }
  }, PUSH_DEBOUNCE_MS)
}

async function push(state) {
  if (!state?.updatedAt) return
  const res = await api('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, updatedAt: state.updatedAt }),
  })
  if (res.status === 409) {
    // Someone else's save is newer — last write wins means theirs does.
    const remote = await (await api('/api/state')).json()
    if (remote.state) hooks.replaceState(remote.state)
    return
  }
  if (!res.ok) throw new Error(String(res.status))
}

// ---------- Google Identity Services button ----------

let gisLoading = null

function ensureGis() {
  if (window.google?.accounts?.id) return Promise.resolve()
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = resolve
    s.onerror = () => { gisLoading = null; reject(new Error('GIS failed to load')) }
    document.head.appendChild(s)
  })
  return gisLoading
}

export async function mountSignInButton(container, onSignedIn) {
  await ensureGis()
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async ({ credential }) => {
      try {
        await signInWithCredential(credential)
        onSignedIn()
      } catch {
        setStatus('error')
      }
    },
  })
  window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'medium', text: 'signin_with' })
}

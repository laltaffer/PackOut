// Stateless signed sessions for PackOut accounts (spec #19). A session is
// `base64url(JSON payload).base64url(HMAC-SHA256(payload))` — no server-side
// session store; SESSION_SECRET is the only trust anchor. Pure module so the
// engine-style node tests cover it directly.

const SESSION_DAYS = 30
export const COOKIE_NAME = 'po_session'

const enc = new TextEncoder()

function b64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function unb64url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const raw = atob(s.replaceAll('-', '+').replaceAll('_', '/') + pad)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function hmac(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
}

export async function createSession({ sub, name }, secret, now = Date.now()) {
  const payload = b64url(enc.encode(JSON.stringify({
    sub, name, exp: now + SESSION_DAYS * 24 * 3600 * 1000,
  })))
  return `${payload}.${b64url(await hmac(payload, secret))}`
}

export async function verifySession(token, secret, now = Date.now()) {
  try {
    const [payload, sig] = String(token ?? '').split('.')
    if (!payload || !sig) return null
    const expected = b64url(await hmac(payload, secret))
    // Same-length compare; a mismatch of any kind is just an invalid session.
    if (sig.length !== expected.length) return null
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    if (diff !== 0) return null
    const s = JSON.parse(new TextDecoder().decode(unb64url(payload)))
    if (typeof s.sub !== 'string' || typeof s.exp !== 'number' || s.exp <= now) return null
    return { sub: s.sub, name: typeof s.name === 'string' ? s.name : '' }
  } catch {
    return null
  }
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 3600}`
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export function readCookie(header, name) {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=') || null
  }
  return null
}

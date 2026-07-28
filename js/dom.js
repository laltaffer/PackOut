// DOM utilities shared by every screen.

// Deploys stamp ?v=<commit> on every module URL; surfacing it answers
// "which version is this browser actually running?" at a glance.
export const BUILD = new URL(import.meta.url).searchParams.get('v') ?? 'dev'

export const app = document.getElementById('app')

export function el(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function wirePrint() {
  const b = document.getElementById('print')
  if (b) b.addEventListener('click', () => window.print())
}

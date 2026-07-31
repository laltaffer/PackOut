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

// One tap for a whole checklist. Callers render it only when the list has
// items; a half-checked list shows as indeterminate. `apply(checked)` mutates
// the model and commits.
export function checkAllHTML(done) {
  return `
    <label class="check-row check-all">
      <span class="check-name">Select all</span>
      <input type="checkbox" data-check-all ${done ? 'checked' : ''}>
    </label>`
}

export function wireCheckAll(some, apply) {
  const cb = app.querySelector('[data-check-all]')
  if (!cb) return
  cb.indeterminate = !cb.checked && some
  cb.addEventListener('change', () => apply(cb.checked))
}

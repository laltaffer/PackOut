// The design switcher: two skins, one app — switching is a token swap, never
// a re-render of state. The desktop dock is static DOM outside route renders;
// the profile's look chips call setBrand too (the phone has no dock to reach).

export function syncBrandDock() {
  const current = document.documentElement.dataset.brand
  document.querySelectorAll('.brand-dock [data-set-brand]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.setBrand === current))
  })
}

export function setBrand(brand) {
  document.documentElement.dataset.brand = brand
  try { localStorage.setItem('packout/brand', brand) } catch { /* preference just won't stick */ }
  syncBrandDock()
}

document.querySelectorAll('.brand-dock [data-set-brand]').forEach(b => {
  b.addEventListener('click', () => setBrand(b.dataset.setBrand))
})
syncBrandDock()

// Product-page extraction for the scrape endpoint (issue #23). Structured
// data only — JSON-LD schema.org Product (+ NutritionInformation), then
// OpenGraph, then <title>. Pure string-in/fields-out so the engine-style
// node tests cover it directly; no DOM, no per-retailer scrapers.

const OZ_PER = { oz: 1, ounce: 1, ounces: 1, g: 0.035274, gram: 0.035274, grams: 0.035274, kg: 35.274, lb: 16, lbs: 16, pound: 16, pounds: 16 }
const UNIT_CODE = { ONZ: 'oz', GRM: 'g', KGM: 'kg', LBR: 'lb' } // UN/CEFACT codes

const round2 = n => Math.round(n * 100) / 100

// First number in a value like "250 calories", "25 g", "25g", 250, "250".
function amount(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const m = String(v ?? '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

// schema.org weight: QuantitativeValue { value, unitText|unitCode } or "5.6 oz".
function weightOz(w) {
  if (w == null) return null
  let value, unit
  if (typeof w === 'object') {
    value = amount(w.value)
    unit = String(w.unitText ?? UNIT_CODE[w.unitCode] ?? '').toLowerCase()
  } else {
    value = amount(w)
    unit = String(w).toLowerCase().match(/[a-z]+/g)?.pop() ?? ''
  }
  const per = OZ_PER[unit]
  return value !== null && per ? round2(value * per) : null
}

const isProduct = t => t === 'Product' || (Array.isArray(t) && t.includes('Product'))

// Depth-first hunt for the first Product node in a JSON-LD document
// (bare object, top-level array, or @graph wrapper).
function findProduct(node) {
  if (Array.isArray(node)) {
    for (const n of node) { const hit = findProduct(n); if (hit) return hit }
    return null
  }
  if (!node || typeof node !== 'object') return null
  if (isProduct(node['@type'])) return node
  return findProduct(node['@graph'] ?? null)
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)

// <meta property="og:title" content="..."> in either attribute order.
function metaContent(html, property) {
  const p = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m =
    html.match(new RegExp(`<meta[^>]*\\bproperty=["']${p}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]*\\bcontent=["']([^"']*)["'][^>]*\\bproperty=["']${p}["']`, 'i'))
  return m ? decode(m[1]).trim() || null : null
}

export function extractProduct(html) {
  const out = { name: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, perServing: false }
  const src = String(html ?? '')

  // JSON-LD blocks, best source first.
  for (const m of src.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let product
    try { product = findProduct(JSON.parse(m[1])) } catch { continue }
    if (!product) continue
    out.name = String(product.name ?? '').trim() || null
    out.weightOz = weightOz(product.weight)
    const n = product.nutrition
    if (n && typeof n === 'object') {
      out.kcal = amount(n.calories)
      out.proteinG = amount(n.proteinContent)
      out.carbsG = amount(n.carbohydrateContent)
      out.fatG = amount(n.fatContent)
      // schema.org nutrition is stated per serving; PackOut kcal is
      // whole-item-as-packed. The UI must say so next to prefilled numbers.
      out.perServing = [out.kcal, out.proteinG, out.carbsG, out.fatG].some(v => v !== null)
    }
    break
  }

  if (!out.name) out.name = metaContent(src, 'og:title')
  if (!out.name) {
    const t = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    out.name = t ? decode(t[1]).trim() || null : null
  }
  return out
}

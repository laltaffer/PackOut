// Product-page extraction for the scrape endpoint (issue #23). Structured
// data only — JSON-LD schema.org Product (+ NutritionInformation), then
// OpenGraph, then <title>. Pure string-in/fields-out so the engine-style
// node tests cover it directly; no DOM, no per-retailer scrapers.

const OZ_PER = { oz: 1, ounce: 1, ounces: 1, g: 0.035274, gram: 0.035274, grams: 0.035274, kg: 35.274, lb: 16, lbs: 16, pound: 16, pounds: 16 }
const UNIT_CODE = { ONZ: 'oz', GRM: 'g', KGM: 'kg', LBR: 'lb' } // UN/CEFACT codes

const round2 = n => Math.round(n * 100) / 100

// First number in a value like "250 calories", "1,200 calories", "25 g", 250.
// Grouped thousands parse whole — "1,200" must never read as 1.
function amount(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const m = String(v ?? '').match(/-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/)
  return m ? Number(m[0].replaceAll(',', '')) : null
}

// schema.org weight: QuantitativeValue { value, unitText|unitCode } or a
// string. Compound strings ("1 lb 8 oz") sum their number-unit pairs.
function weightOz(w) {
  if (w == null) return null
  if (typeof w === 'object') {
    const value = amount(w.value)
    const per = OZ_PER[String(w.unitText ?? UNIT_CODE[w.unitCode] ?? '').toLowerCase()]
    return value !== null && per ? round2(value * per) : null
  }
  let total = 0, found = false
  for (const m of String(w).toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(oz|ounces?|kg|g|grams?|lbs?|pounds?)\b/g)) {
    total += Number(m[1]) * OZ_PER[m[2]]
    found = true
  }
  return found ? round2(total) : null
}

// Accept compact and expanded schema.org type IRIs.
const typeName = t => String(t ?? '').replace(/^https?:\/\/schema\.org\//i, '')
const isProduct = t => Array.isArray(t) ? t.some(x => typeName(x) === 'Product') : typeName(t) === 'Product'

// Hunt for Product nodes in a JSON-LD document: bare object, top-level
// array, @graph wrapper, or a WebPage's mainEntity. Deliberately NOT a full
// recursive walk — related-product embeds shouldn't outrank the page's own.
function collectProducts(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectProducts(n, out); return }
  if (!node || typeof node !== 'object') return
  if (isProduct(node['@type'])) { out.push(node); return }
  collectProducts(node['@graph'] ?? null, out)
  collectProducts(node.mainEntity ?? null, out)
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const scalar = n => n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '�'
const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => scalar(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => scalar(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)

// <meta property="og:title" content="..."> in either attribute order. The
// value runs to its own opening delimiter, so apostrophes inside
// double-quoted content survive.
function metaContent(html, property) {
  const p = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m =
    html.match(new RegExp(`<meta[^>]*\\bproperty\\s*=\\s*["']${p}["'][^>]*\\bcontent\\s*=\\s*(["'])((?:(?!\\1).)*)\\1`, 'i')) ??
    html.match(new RegExp(`<meta[^>]*\\bcontent\\s*=\\s*(["'])((?:(?!\\1).)*)\\1[^>]*\\bproperty\\s*=\\s*["']${p}["']`, 'i'))
  return m ? decode(m[2]).trim() || null : null
}

function fieldsOf(product) {
  const out = { name: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, weightOptions: [], perServing: false }
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
  return out
}

// ---------- labelled weight in the page's own words ----------
// Storefronts almost never put weight in JSON-LD — Shopify's Product schema
// has no weight field at all — so the number a packer wants lives in the spec
// text: "Weight: 18.9 oz" (Lawrence 2026-07-27: fetch pulled no weights).
//
// Shopify DOES publish a `weight` in its own product JSON, and it is
// deliberately ignored here: that is SHIPPING weight. The Exo K4 5000 reads
// 6804 g there against an 85 oz item — trusting it would quietly add ten
// pounds to a pack, which is worse than returning nothing.

// Strip markup so a label and its value read as one string even when they sit
// in <dt>/<dd> or separate spans. Script and style bodies go first: their
// contents are code, not copy.
function textOf(html) {
  return decode(html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
}

// Words that turn "weight" into something that is not this item's weight.
// "Weight Limit: 265lbs" is a chair's capacity; "Weight: Under 1.5lbs" is a
// bound, not a measurement — and rounding a bound into a pack total is the
// kind of quiet error this whole app exists to prevent.
const NOT_A_WEIGHT = /\b(?:limit|capacity|rating|rated|range|max|maximum|min\.?imum load|load|up to|under|over|less than|more than|starting|per)\b/i
const WEIGHT_LABEL = /\b(?:trail|packed|minimum|min|total|item|product|carry|dry|shipping|carton)?\s*weight\b/gi
// A number and unit, optionally a second pair for "1 lb 8 oz" — which spec
// tables also write as "5lb, 13oz", so the separator allows a comma. Missing
// it silently dropped the ounces and read 5lb 13oz as a flat 80.
const WEIGHT_VALUE = /(\d[\d.,]*)\s*(oz|ounces?|lbs?|pounds?|kg|g|grams?)\b(?:[\s,]*(\d[\d.,]*)\s*(oz|ounces?)\b)?/i
// A backcountry item under a twentieth of an ounce or over 125 lb is a parse
// error, not a product.
const SANE_MIN_OZ = 0.05
const SANE_MAX_OZ = 2000

// Every distinct weight the page states, in the order it states them. Plural
// on purpose: a tripod page lists its long and short columns, a pack page
// tables four models against three configurations, and NOTHING in the markup
// says which one is on your back. Picking the first would be confidently
// wrong — the same silent-error failure as trusting shipping weight — so the
// caller is handed the choice instead.
const MAX_WEIGHT_OPTIONS = 6

export function labelledWeights(text) {
  const found = []
  for (const label of text.matchAll(WEIGHT_LABEL)) {
    if (found.length >= MAX_WEIGHT_OPTIONS) break
    // Shipping weight is the retailer's box, not the packer's item.
    if (/shipping|carton/i.test(label[0])) continue
    const after = text.slice(label.index + label[0].length, label.index + label[0].length + 48)
    const m = after.match(WEIGHT_VALUE)
    if (!m) continue
    if (NOT_A_WEIGHT.test(after.slice(0, m.index))) continue
    const oz = weightOz(m[0])
    if (oz === null || oz < SANE_MIN_OZ || oz > SANE_MAX_OZ) continue
    if (!found.includes(oz)) found.push(oz)
  }
  return found
}

const richness = f => ['name', 'kcal', 'proteinG', 'carbsG', 'fatG', 'weightOz'].filter(k => f[k] !== null).length

export function extractProduct(html) {
  const src = String(html ?? '')

  // JSON-LD blocks, best source first. Pages often carry stub products
  // (related items, widgets) beside the real one — the richest candidate
  // wins, first one breaking ties.
  const candidates = []
  for (const m of src.matchAll(/<script[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectProducts(JSON.parse(m[1]), candidates) } catch { continue }
  }
  let best = null
  for (const c of candidates.map(fieldsOf)) {
    if (!best || richness(c) > richness(best)) best = c
  }
  const out = best ?? { name: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, perServing: false }

  if (!out.name) out.name = metaContent(src, 'og:title')
  if (!out.name) {
    const t = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    out.name = t ? decode(t[1]).trim() || null : null
  }
  // Structured weight is authoritative when a site publishes it; the spec text
  // is the fallback, which in practice is the only place it ever appears.
  // A page that states exactly one weight answers the question; a page that
  // states several only narrows it, and says so rather than guessing.
  out.weightOptions = []
  if (out.weightOz === null) {
    const found = labelledWeights(textOf(src))
    if (found.length === 1) out.weightOz = found[0]
    else if (found.length > 1) out.weightOptions = found
  }
  return out
}

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

// Tag names end where a name character stops. Shared by every scanner here.
const NAME_CHAR = /[a-z0-9-]/

// Every `<name …>` tag's attribute text, in document order, found by walking
// the string. Nothing here may put `[^>]*` in front of an attribute: on a page
// that opens tags and never closes them, that backtracks across the whole
// document once per tag. Measured 2026-07-29 (Codex flagged the shape in the
// markup stripper; the same bug was in three more places): 600 KB of "<meta "
// took 60 SECONDS, and extraction runs on the browser's main thread now.
function* tagsNamed(html, name, lower = html.toLowerCase()) {
  const needle = `<${name}`
  let i = 0
  for (;;) {
    const open = lower.indexOf(needle, i)
    if (open === -1) return
    const nameEnd = open + needle.length
    if (NAME_CHAR.test(lower[nameEnd] ?? '')) { i = nameEnd; continue }  // <metadata>
    const gt = tagEnd(html, nameEnd)
    if (gt === -1) return
    yield { attrs: html.slice(nameEnd, gt), end: gt }
    i = gt + 1
  }
}

// Where a tag closes — skipping any `>` inside a quoted value, which is legal
// and which the regex this replaced handled by scanning past the tag entirely.
// A product titled `Fits 65L > packs` would otherwise lose its og:title.
function tagEnd(html, from) {
  let quote = ''
  for (let j = from; j < html.length; j++) {
    const c = html[j]
    if (quote) { if (c === quote) quote = '' } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return j
  }
  return -1
}

// One attribute out of a single tag's text. Safe to do with a regex: the input
// is one tag, not a document.
function attr(attrs, key) {
  const m = attrs.match(new RegExp(`\\b${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'))
  return m ? m[2] ?? m[3] ?? m[4] ?? null : null
}

// <meta property="og:title" content="..."> in either attribute order. Reading
// the attributes out of the tag makes order a non-question, and apostrophes
// inside double-quoted content survive because each value runs to its own
// opening delimiter.
function metaContent(html, property) {
  const wanted = property.toLowerCase()
  for (const { attrs } of tagsNamed(html, 'meta')) {
    if (attr(attrs, 'property')?.toLowerCase() !== wanted) continue
    const content = attr(attrs, 'content')
    if (content !== null) return decode(content).trim() || null
  }
  return null
}

// The <title> element's text, same scan, same reason.
function titleText(html) {
  const lower = html.toLowerCase()
  for (const { end } of tagsNamed(html, 'title', lower)) {
    const close = lower.indexOf('</title', end + 1)
    return decode(html.slice(end + 1, close === -1 ? html.length : close)).trim() || null
  }
  return null
}

// ---------- brand ----------
// The maker, never the storefront. A product name without its brand is the
// wrong name for a pack list — "WOOBIE" and "R3 7000" mean nothing on a shelf
// next to "20-Degree Quilt" (Lawrence 2026-07-29: the brand is dropped most of
// the time). The brand must come from the ITEM, because the site is not it:
// REI sells Osprey packs and its own REI Co-op packs from identical URLs, and
// Garage Grown Gear sells forty makers' gear. So og:site_name is deliberately
// never consulted — on a multi-brand retailer it names the store, and stamping
// the store on someone else's gear is a fact this app would be inventing.

// A brand is a name, not a sentence. Storefronts fill the field with their
// own signage — Hoyt's says "Hoyt- Online Clothing and Gear Store", which
// would ride into the library on every item they sell. The maker is the part
// before the punctuation, so the tail is cut at a dash, pipe or comma that has
// whitespace on one side. Hyphens inside a word are untouched, which is what
// keeps Therm-a-Rest whole.
const BRAND_TAIL = /\s*[-–—|]\s+|,\s+/

// schema.org brand: { "@type": "Brand", name } — but Stone Glacier ships
// "@type": "Thing" and others a bare string, so the type is ignored and only
// the name is read. An array takes its first entry.
function brandName(b) {
  if (Array.isArray(b)) return brandName(b[0])
  const raw = b && typeof b === 'object' ? b.name : b
  const s = String(raw ?? '').trim().split(BRAND_TAIL)[0].trim()
  return s && s.length <= 60 ? s : null
}

// Brand-bearing JSON-LD nodes. Wider than collectProducts on purpose:
// ProductGroup is where a variant-heavy page states its brand (Kifaru's
// WOOBIE, REI's Osprey packs) and it is read HERE ONLY, for the brand. Letting
// groups into the fields pipeline would also hand over their weights, which
// are per-variant and stated as such ("S/M: 4 lbs. 10 oz.") — a number that
// belongs to one size masquerading as the item's.
const BRANDISH = /^(Product|ProductGroup|ProductModel|IndividualProduct)$/i
const isBrandish = t => Array.isArray(t) ? t.some(isBrandish) : BRANDISH.test(typeName(t))

function collectBrands(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectBrands(n, out); return }
  if (!node || typeof node !== 'object') return
  if (isBrandish(node['@type'])) {
    const b = brandName(node.brand ?? node.manufacturer)
    if (b) out.push(b)
    return
  }
  collectBrands(node['@graph'] ?? null, out)
  collectBrands(node.mainEntity ?? null, out)
}

// Tokens for comparing a brand or a name against page text — case,
// punctuation and spacing are noise ("20-Degree" vs "20 degree").
const tokens = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)

// Shopify's own product JSON carries `vendor`, which IS the maker — Exo and
// Peak Refuel publish no schema.org brand at all, and vendor is the only
// place their name appears as data rather than décor. A page that names
// several vendors is a page listing several makers' products (recommendation
// rails on multi-brand stores), and nothing in the markup says which one is
// the item — so that page gets no brand rather than a coin flip.
const VENDOR = /"vendor"\s*:\s*("(?:[^"\\]|\\.)*")/g

function shopifyVendor(html) {
  let only = null
  for (const m of html.matchAll(VENDOR)) {
    let v
    try { v = String(JSON.parse(m[1])).trim() } catch { continue }
    if (!v || v.length > 60) continue
    if (only === null) only = v
    else if (only.toLowerCase() !== v.toLowerCase()) return null
  }
  return only
}

// …unless the page says which vendor is the item. Shopify writes the product
// as {"title":"…","vendor":"…"}, so the vendor sitting right behind the name
// we already have is the maker of the thing on screen. That is what rescues
// the big multi-brand archery and outdoor retailers: Lancaster names STAN
// Outdoors, Easton Archery and its own house label on one release's page, and
// only the first of those is the release.
const NEAR = 200
const TITLE_KEY = /"(?:untranslatedTitle|title|name)"\s*:/

function vendorForName(html, name) {
  const wanted = tokens(name ?? '').join(' ')
  if (!wanted) return null
  for (const m of html.matchAll(VENDOR)) {
    // Both must be in the run of text behind the vendor: a title field, and
    // this page's name inside it. Nearness alone is not enough — a page's own
    // <title> can sit a few hundred characters from an unrelated inline
    // script, and that coincidence would name the wrong maker.
    const before = html.slice(Math.max(0, m.index - NEAR), m.index)
    if (!TITLE_KEY.test(before)) continue
    if (!tokens(before).join(' ').includes(wanted)) continue
    try { return String(JSON.parse(m[1])).trim() } catch { return null }
  }
  return null
}

// The name a packer wants leads with who made it. Prefix only when the name
// does not already say so: pages spell the brand out mid-title ("… by
// Alpenglow Gear"), tack the store on the end ("… | Peak Refuel"), or lead
// with a shorter form of it ("Kifaru Woobie" against a "Kifaru Intl" brand) —
// and "Kifaru Intl Kifaru Woobie" is worse than what we started with.
function withBrand(name, brand) {
  if (!name || !brand) return name
  const n = tokens(name), b = tokens(brand)
  if (!n.length || !b.length) return name
  if (` ${n.join(' ')} `.includes(` ${b.join(' ')} `)) return name
  if (n[0] === b[0]) return name
  return `${brand} ${name}`
}

function fieldsOf(product) {
  const out = { name: null, brand: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, weightOptions: [], perServing: false }
  out.brand = brandName(product.brand ?? product.manufacturer)
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
// in <dt>/<dd> or separate spans. Script and style bodies are skipped whole:
// their contents are code, not copy.
//
// Scanned by hand, because the two regexes this replaced were both quadratic
// on markup that never closes a tag. Measured 2026-07-29 after Codex flagged
// the shape: 600 KB of "<script<script…" took 70 SECONDS, and 200 KB of bare
// "<" took 20. Extraction runs on the main thread in the browser leg, so that
// is a frozen tab with the Fetch button stuck — reachable from any page a user
// pastes. This scan only ever moves forward.
const CODE_TAGS = ['script', 'style']

function textOf(html) {
  const lower = html.toLowerCase()
  const parts = []
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) { parts.push(html.slice(i)); break }
    parts.push(html.slice(i, lt), ' ')
    const gt = html.indexOf('>', lt + 1)
    // A tag that never closes: whatever follows is not copy either way.
    if (gt === -1) break
    const code = CODE_TAGS.find(t =>
      lower.startsWith(t, lt + 1) && !NAME_CHAR.test(lower[lt + 1 + t.length] ?? ''))
    if (!code) { i = gt + 1; continue }
    // Everything up to the matching close tag is code. An unclosed one takes
    // the rest of the document with it — losing text beats reading a script's
    // own "weight" as the item's.
    const close = lower.indexOf(`</${code}`, gt + 1)
    if (close === -1) break
    const closeEnd = html.indexOf('>', close + 2 + code.length)
    if (closeEnd === -1) break
    i = closeEnd + 1
  }
  return decode(parts.join('')).replace(/\s+/g, ' ')
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
export const SANE_MIN_OZ = 0.05
export const SANE_MAX_OZ = 2000

// Every distinct weight the page states, in the order it states them. Plural
// on purpose: a tripod page lists its long and short columns, a pack page
// tables four models against three configurations, and NOTHING in the markup
// says which one is on your back. Picking the first would be confidently
// wrong — the same silent-error failure as trusting shipping weight — so the
// caller is handed the choice instead.
export const MAX_WEIGHT_OPTIONS = 6

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

// ---------- pages that are not a product ----------
// A bot wall, a dead link and a parked domain all answer with a perfectly
// valid page carrying a title and nothing else, so the title becomes the gear:
// Lancaster's Cloudflare interstitial files as "Just a moment…", Mountain
// House's dead link as "404 Not Found" (both seen 2026-07-29). A name we know
// is not a product is worse than no name — and the two cases need different
// advice, because one will never work and the other is the wrong link.
const BLOCKED_MARKER = /challenges\.cloudflare\.com|_incapsula_|distil_r_captcha|perimeterx|px-captcha/i
const BLOCKED_NAME = /^(?:just a moment|attention required|access denied|forbidden|robot check|are you a human|pardon our interruption|checking your browser|security check)\b/i
const DEAD_MARKER = /domain (?:may be|is) for sale|buy this domain/i
const DEAD_NAME = /^(?:404\b|error 404|page not found|not found|this page (?:isn.t|is not) available)/i

const problemOf = (html, name) =>
  BLOCKED_MARKER.test(html) || BLOCKED_NAME.test(name ?? '') ? 'blocked'
    : DEAD_MARKER.test(html) || DEAD_NAME.test(name ?? '') ? 'dead'
      : null

const richness = f => ['name', 'kcal', 'proteinG', 'carbsG', 'fatG', 'weightOz'].filter(k => f[k] !== null).length

// Every <script> element as its attribute text and its body, found by scanning
// for the same reason textOf scans: the regex this replaced put `[^>]*` in
// front of the type attribute, so a page that never closes a tag made it
// backtrack across the whole document once per script — 31 seconds on 560 KB
// of "<script<script…" even after the markup stripper was fixed. Bodies end at
// the first `</script`, which is where a browser ends them too.
function* scriptElements(html) {
  const lower = html.toLowerCase()
  let i = 0
  for (;;) {
    const open = lower.indexOf('<script', i)
    if (open === -1) return
    const nameEnd = open + 7
    if (NAME_CHAR.test(lower[nameEnd] ?? '')) { i = nameEnd; continue }  // <scripted>
    const gt = html.indexOf('>', nameEnd)
    if (gt === -1) return
    const close = lower.indexOf('</script', gt + 1)
    if (close === -1) return
    yield { attrs: html.slice(nameEnd, gt), body: html.slice(gt + 1, close) }
    const closeEnd = html.indexOf('>', close + 8)
    if (closeEnd === -1) return
    i = closeEnd + 1
  }
}

const LD_TYPE = /\btype\s*=\s*["']?application\/ld\+json/i

export function extractProduct(html) {
  const src = String(html ?? '')

  // JSON-LD blocks, best source first. Pages often carry stub products
  // (related items, widgets) beside the real one — the richest candidate
  // wins, first one breaking ties.
  const candidates = []
  const brands = []
  for (const { attrs, body } of scriptElements(src)) {
    if (!LD_TYPE.test(attrs)) continue
    let doc
    try { doc = JSON.parse(body) } catch { continue }
    collectProducts(doc, candidates)
    collectBrands(doc, brands)
  }
  let best = null
  for (const c of candidates.map(fieldsOf)) {
    if (!best || richness(c) > richness(best)) best = c
  }
  const out = best ?? { name: null, brand: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, perServing: false }

  if (!out.name) out.name = metaContent(src, 'og:title')
  if (!out.name) out.name = titleText(src)
  // A bot wall or a dead link keeps its verdict and loses its name, so no
  // caller can file the interstitial as an item. Only a page that published
  // no product data at all is judged this way: a real listing for a "Security
  // Check Padlock", or a shop loading a Turnstile widget, says what it is in
  // JSON-LD and is taken at its word.
  out.problem = best === null ? problemOf(src, out.name) : null
  if (out.problem) out.name = null
  // The name is settled first because the vendor lookup is anchored to it.
  out.brand ??= brands[0] ?? brandName(vendorForName(src, out.name) ?? shopifyVendor(src))
  out.name = withBrand(out.name, out.brand)
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

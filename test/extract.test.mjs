import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractProduct } from '../functions/lib/extract.js'

const ldPage = obj => `<!doctype html><html><head>
  <title>Some Retailer</title>
  <script type="application/ld+json">${JSON.stringify(obj)}</script>
</head><body></body></html>`

test('extract: full JSON-LD product with nutrition and weight', () => {
  const p = extractProduct(ldPage({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Peak Refuel Chicken Teriyaki',
    weight: { '@type': 'QuantitativeValue', value: 5.6, unitText: 'oz' },
    nutrition: {
      '@type': 'NutritionInformation',
      calories: '250 calories',
      proteinContent: '25 g',
      carbohydrateContent: '30 g',
      fatContent: '5 g',
    },
  }))
  assert.equal(p.name, 'Peak Refuel Chicken Teriyaki')
  assert.equal(p.kcal, 250)
  assert.equal(p.proteinG, 25)
  assert.equal(p.carbsG, 30)
  assert.equal(p.fatG, 5)
  assert.equal(p.weightOz, 5.6)
  assert.equal(p.perServing, true)
})

test('extract: product inside an @graph wrapper', () => {
  const p = extractProduct(ldPage({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Shop' },
      { '@type': 'Product', name: 'Kifaru Woobie', weight: { value: 21, unitText: 'oz' } },
    ],
  }))
  assert.equal(p.name, 'Kifaru Woobie')
  assert.equal(p.weightOz, 21)
  assert.equal(p.perServing, false)
})

test('extract: array @type still counts as a product', () => {
  const p = extractProduct(ldPage({ '@type': ['Product', 'IndividualProduct'], name: 'Tarp' }))
  assert.equal(p.name, 'Tarp')
})

test('extract: weight unit conversions to oz', () => {
  const grams = extractProduct(ldPage({ '@type': 'Product', name: 'A', weight: { value: 160, unitText: 'g' } }))
  assert.equal(grams.weightOz, 5.64)
  const pounds = extractProduct(ldPage({ '@type': 'Product', name: 'B', weight: { value: 2, unitText: 'lbs' } }))
  assert.equal(pounds.weightOz, 32)
  const kilos = extractProduct(ldPage({ '@type': 'Product', name: 'C', weight: { value: 1, unitCode: 'KGM' } }))
  assert.equal(kilos.weightOz, 35.27)
  const str = extractProduct(ldPage({ '@type': 'Product', name: 'D', weight: '5.6 oz' }))
  assert.equal(str.weightOz, 5.6)
})

test('extract: numeric calories and bare-number macro strings parse', () => {
  const p = extractProduct(ldPage({
    '@type': 'Product',
    name: 'Bar',
    nutrition: { '@type': 'NutritionInformation', calories: 250, proteinContent: '25g' },
  }))
  assert.equal(p.kcal, 250)
  assert.equal(p.proteinG, 25)
  assert.equal(p.carbsG, null)
})

test('extract: og:title fallback when no JSON-LD product', () => {
  const p = extractProduct(`<!doctype html><head>
    <title>MegaShop</title>
    <meta property="og:title" content="Mountain House Chili Mac">
  </head>`)
  assert.equal(p.name, 'Mountain House Chili Mac')
  assert.equal(p.kcal, null)
  assert.equal(p.perServing, false)
})

test('extract: og:title with reversed attribute order', () => {
  const p = extractProduct(`<head><meta content="Reversed Name" property="og:title"></head>`)
  assert.equal(p.name, 'Reversed Name')
})

test('extract: title-tag fallback as last resort', () => {
  const p = extractProduct(`<html><head><title> Plain Title Page </title></head></html>`)
  assert.equal(p.name, 'Plain Title Page')
})

test('extract: garbage in, nulls out', () => {
  const p = extractProduct('not even html')
  assert.deepEqual(p, { name: null, brand: null, problem: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, weightOptions: [], perServing: false })
})

test('extract: malformed JSON-LD falls through to meta', () => {
  const p = extractProduct(`<head>
    <script type="application/ld+json">{ broken json,, }</script>
    <meta property="og:title" content="Still Works">
  </head>`)
  assert.equal(p.name, 'Still Works')
})

test('extract: html entities in og:title are decoded', () => {
  const p = extractProduct(`<head><meta property="og:title" content="Mac &amp; Cheese &#8212; 2 Pack"></head>`)
  assert.equal(p.name, 'Mac & Cheese — 2 Pack')
})

test('extract: grouped thousands parse whole, not truncated at the comma', () => {
  const p = extractProduct(ldPage({
    '@type': 'Product', name: 'Big Meal',
    nutrition: { '@type': 'NutritionInformation', calories: '1,200 calories' },
  }))
  assert.equal(p.kcal, 1200)
})

test('extract: compound weights sum their parts', () => {
  const p = extractProduct(ldPage({ '@type': 'Product', name: 'Tent', weight: '1 lb 8 oz' }))
  assert.equal(p.weightOz, 24)
})

test('extract: product reachable through WebPage mainEntity', () => {
  const p = extractProduct(ldPage({
    '@type': 'WebPage',
    mainEntity: { '@type': 'Product', name: 'Nested Bar', weight: { value: 2, unitText: 'oz' } },
  }))
  assert.equal(p.name, 'Nested Bar')
  assert.equal(p.weightOz, 2)
})

test('extract: expanded schema.org type IRIs count as products', () => {
  const p = extractProduct(ldPage({ '@type': 'https://schema.org/Product', name: 'IRI Product' }))
  assert.equal(p.name, 'IRI Product')
})

test('extract: the richest product wins over an earlier stub', () => {
  const html = `<head>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Stub' })}</script>
    <script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'Full Product', weight: { value: 4, unitText: 'oz' },
    nutrition: { '@type': 'NutritionInformation', calories: '400 calories' },
  })}</script>
  </head>`
  const p = extractProduct(html)
  assert.equal(p.name, 'Full Product')
  assert.equal(p.kcal, 400)
})

test('extract: whitespace and unquoted type attributes still match', () => {
  const spaced = extractProduct(`<script type = "application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Spaced' })}</script>`)
  assert.equal(spaced.name, 'Spaced')
  const unquoted = extractProduct(`<script type=application/ld+json>${JSON.stringify({ '@type': 'Product', name: 'Unquoted' })}</script>`)
  assert.equal(unquoted.name, 'Unquoted')
})

test('extract: apostrophes inside double-quoted content survive', () => {
  const p = extractProduct(`<head><meta property="og:title" content="Bob's Energy Bar"></head>`)
  assert.equal(p.name, "Bob's Energy Bar")
})

test('extract: out-of-range numeric entities degrade instead of throwing', () => {
  const p = extractProduct(`<head><meta property="og:title" content="Bad &#1114112; Entity"></head>`)
  assert.equal(typeof p.name, 'string')
  assert.ok(p.name.includes('Bad'))
})

// ---------- weight from the page's own words (2026-07-27) ----------
// Lawrence: "when I was doing fetch with URLs it wasn't pulling the weight on
// any of the items." Storefronts do not put weight in JSON-LD; it lives in the
// spec text. Every case below is taken from a page he actually saved gear from.

const page = body => `<html><head><title>T</title></head><body>${body}</body></html>`

test('a single stated weight answers the question', () => {
  assert.equal(extractProduct(page('<p>Weight: 18.9 oz</p>')).weightOz, 18.9)
  assert.equal(extractProduct(page('<dl><dt>Weight</dt><dd>2 lb 4 oz</dd></dl>')).weightOz, 36)
  assert.equal(extractProduct(page('<p>Total Weight 5lb, 13oz</p>')).weightOz, 93,
    'spec tables write compounds with a comma')
  assert.equal(extractProduct(page('<p>Trail weight 1.5 kg</p>')).weightOz, 52.91)
})

test('a capacity or a bound is never mistaken for a weight', () => {
  // Helinox states both; only one of them is the chair.
  const r = extractProduct(page('<p>Weight Limit: 265lbs</p><p>Weight: Under 1.5lbs</p>'))
  assert.equal(r.weightOz, null)
  assert.deepEqual(r.weightOptions, [])
  assert.equal(extractProduct(page('<p>Load rating: 150 lbs</p>')).weightOz, null)
  assert.equal(extractProduct(page('<p>Weight capacity 300 lb</p>')).weightOz, null)
})

test('shipping weight is the retailer’s box, not the packer’s item', () => {
  assert.equal(extractProduct(page('<p>Shipping weight: 15 lb</p>')).weightOz, null)
  assert.equal(extractProduct(page('<p>Carton weight 6804 g</p>')).weightOz, null)
})

test('a page stating several weights offers them instead of guessing', () => {
  // The Aziak tripod: two center-column configurations, and nothing in the
  // markup says which one is on your tripod.
  const r = extractProduct(page(
    '<p>Weight: 20.4 oz (Long Center Column)</p><p>Weight: 18.9 oz (Short Center Column)</p>'))
  assert.equal(r.weightOz, null, 'never pick one for the user')
  assert.deepEqual(r.weightOptions, [20.4, 18.9])
})

test('repeats of the same weight are one answer, not an ambiguity', () => {
  const r = extractProduct(page('<p>Weight: 18.9 oz</p><p>Item weight 18.9 oz</p>'))
  assert.equal(r.weightOz, 18.9)
  assert.deepEqual(r.weightOptions, [])
})

test('structured weight still wins when a site publishes one', () => {
  const ld = JSON.stringify({ '@type': 'Product', name: 'X', weight: { value: 12, unitText: 'oz' } })
  const r = extractProduct(page(`<script type="application/ld+json">${ld}</script><p>Weight: 99 oz</p>`))
  assert.equal(r.weightOz, 12)
})

test('nonsense numbers are refused', () => {
  assert.equal(extractProduct(page('<p>Weight: 0 oz</p>')).weightOz, null)
  assert.equal(extractProduct(page('<p>Weight: 900 lb</p>')).weightOz, null)
})

test('script and style bodies are code, not copy', () => {
  const r = extractProduct(page('<script>var meta={"weight":709};</script><p>Weight: 18.9 oz</p>'))
  assert.equal(r.weightOz, 18.9, 'Shopify’s shipping weight must not leak in through a script tag')
})

// ---------- the brand comes along (2026-07-29) ----------
// Lawrence: "when I import from an URL we are dropping the brand name most of
// the time." Every shape below is from a page checked live that day; the
// wanted names are the ones those pages should have produced.

test('a JSON-LD brand leads the name', () => {
  const p = extractProduct(ldPage({
    '@type': 'Product', name: '20-Degree Quilt',
    brand: { '@type': 'Brand', name: 'Hyperlite Mountain Gear' },
  }))
  assert.equal(p.brand, 'Hyperlite Mountain Gear')
  assert.equal(p.name, 'Hyperlite Mountain Gear 20-Degree Quilt')
})

test('brand shapes other than {"@type":"Brand"} still read', () => {
  // Stone Glacier ships @type Thing; plenty of sites ship a bare string.
  assert.equal(extractProduct(ldPage({ '@type': 'Product', name: 'R3 7000', brand: { '@type': 'Thing', name: 'Stone Glacier' } })).name,
    'Stone Glacier R3 7000')
  assert.equal(extractProduct(ldPage({ '@type': 'Product', name: 'R3 7000', brand: 'Stone Glacier' })).name,
    'Stone Glacier R3 7000')
  assert.equal(extractProduct(ldPage({ '@type': 'Product', name: 'R3 7000', manufacturer: { name: 'Stone Glacier' } })).name,
    'Stone Glacier R3 7000')
})

test('a variant page states its brand on the ProductGroup', () => {
  // Kifaru's WOOBIE: the only Product-ish node is the group, and the name
  // reaches us through og:title exactly as it does on the live page.
  const p = extractProduct(`<html><head>
    <meta property="og:title" content="WOOBIE">
    <script type="application/ld+json">${JSON.stringify({
    '@type': 'ProductGroup', name: 'WOOBIE', brand: { '@type': 'Brand', name: 'Kifaru Intl' },
  })}</script></head></html>`)
  assert.equal(p.brand, 'Kifaru Intl')
  assert.equal(p.name, 'Kifaru Intl WOOBIE', 'og:title supplies the name, the group supplies the maker')
})

test('a group weight never becomes the item weight', () => {
  // REI states "S/M: 4 lbs. 10 oz." on the group — one size's number, and
  // nothing says it is the one on your back.
  const p = extractProduct(ldPage({
    '@type': 'ProductGroup', name: "Atmos AG 65 Pack - Men's",
    brand: { '@type': 'Brand', name: 'Osprey' }, weight: 'S/M: 4 lbs. 10 oz.',
  }))
  assert.equal(p.brand, 'Osprey')
  assert.equal(p.weightOz, null)
})

test('Shopify vendor answers when a store publishes no brand', () => {
  // Exo and Peak Refuel: vendor is the only place the maker appears as data.
  const p = extractProduct(`<html><head>
    <meta property="og:title" content="K4 5000 Pack System">
    <meta property="og:site_name" content="Exo Mtn Gear">
    <script>var meta = {"product":{"title":"K4 5000 Pack System","vendor":"Exo Mtn Gear"}};</script>
  </head></html>`)
  assert.equal(p.brand, 'Exo Mtn Gear')
  assert.equal(p.name, 'Exo Mtn Gear K4 5000 Pack System')
})

test('a page naming several vendors names no brand', () => {
  // Garage Grown Gear's recommendation rail carries other makers. Which one
  // is the item is not in the markup, and the store is not the answer.
  const p = extractProduct(`<html><head>
    <meta property="og:title" content="Micro Inflator">
    <meta property="og:site_name" content="Garage Grown Gear">
    <script>var a={"vendor":"Alpenglow Gear"},b={"vendor":"NEMO Equipment"};</script>
  </head></html>`)
  assert.equal(p.brand, null)
  assert.equal(p.name, 'Micro Inflator')
})

test('the store is never the brand', () => {
  // A retailer page with nothing but its own name on it stays brandless
  // rather than stamping the store onto someone else's gear.
  const p = extractProduct(`<html><head>
    <title>REI Co-op</title>
    <meta property="og:site_name" content="REI Co-op">
    <meta property="og:title" content="Atmos AG 65 Pack">
  </head></html>`)
  assert.equal(p.brand, null)
  assert.equal(p.name, 'Atmos AG 65 Pack')
})

test('a name that already says the brand is left alone', () => {
  const spelled = extractProduct(ldPage({
    '@type': 'Product', name: 'Alpenblow Micro Inflator by Alpenglow Gear',
    brand: { name: 'Alpenglow Gear' },
  }))
  assert.equal(spelled.name, 'Alpenblow Micro Inflator by Alpenglow Gear')
  const trailing = extractProduct(ldPage({
    '@type': 'Product', name: 'Beef Stroganoff | 41G Protein | Peak Refuel', brand: { name: 'Peak Refuel' },
  }))
  assert.equal(trailing.name, 'Beef Stroganoff | 41G Protein | Peak Refuel')
  const shortForm = extractProduct(ldPage({
    '@type': 'Product', name: 'Kifaru Woobie', brand: { name: 'Kifaru Intl' },
  }))
  assert.equal(shortForm.name, 'Kifaru Woobie', 'a longer legal name must not double up the prefix')
})

test('brand junk is refused rather than prefixed', () => {
  const empty = extractProduct(ldPage({ '@type': 'Product', name: 'Tarp', brand: { name: '   ' } }))
  assert.equal(empty.brand, null)
  assert.equal(empty.name, 'Tarp')
  const essay = extractProduct(ldPage({ '@type': 'Product', name: 'Tarp', brand: { name: 'B'.repeat(80) } }))
  assert.equal(essay.brand, null)
  assert.equal(essay.name, 'Tarp')
})

test('a storefront’s signage is cut back to the maker', () => {
  // Hoyt fills both its JSON-LD brand and its Shopify vendor with
  // "Hoyt- Online Clothing and Gear Store" — that would ride into the library
  // on every item they sell.
  const ld = extractProduct(ldPage({
    '@type': 'Product', name: 'Concourse Backpack',
    brand: { '@type': 'Brand', name: 'Hoyt- Online Clothing and Gear Store' },
  }))
  assert.equal(ld.brand, 'Hoyt')
  assert.equal(ld.name, 'Hoyt Concourse Backpack')
  const vendor = extractProduct(`<html><head><meta property="og:title" content="Concourse Backpack">
    <script>var m = {"vendor":"Hoyt- Online Clothing and Gear Store"};</script></head></html>`)
  assert.equal(vendor.name, 'Hoyt Concourse Backpack')
})

test('a hyphen inside a name is not a tail', () => {
  const p = extractProduct(ldPage({ '@type': 'Product', name: 'Z Seat', brand: { name: 'Therm-a-Rest' } }))
  assert.equal(p.brand, 'Therm-a-Rest')
  assert.equal(p.name, 'Therm-a-Rest Z Seat')
})

test('a multi-brand retailer names the item’s vendor, not the loudest one', () => {
  // Lancaster Archery publishes no JSON-LD at all and names three vendors on
  // one release's page — the release, a cross-sell, and its own house label.
  // The item is the one whose title is the page's name.
  const p = extractProduct(`<html><head>
    <meta property="og:title" content="STAN OnneX Thumb Button Release">
    </head><body><script>var boot = {"productVariants":[
      {"product":{"title":"STAN OnneX Thumb Button Release","vendor":"STAN Outdoors","id":"1"}},
      {"product":{"title":"Easton Round Arrow Tote","vendor":"Easton Archery","id":"2"}},
      {"product":{"title":"Digital Gift Card","vendor":"Lancaster Archery Supply","id":"3"}}]};
    </script></body></html>`)
  assert.equal(p.brand, 'STAN Outdoors')
  assert.equal(p.name, 'STAN OnneX Thumb Button Release', 'the name already leads with the maker')
})

test('a vendor is only the item’s when a title says so', () => {
  // Same page shape without the title field: proximity alone must not decide.
  const p = extractProduct(`<html><head>
    <meta property="og:title" content="OnneX Release">
    </head><body><script>var a = {"vendor":"STAN Outdoors"},b = {"vendor":"Easton Archery"};</script></body></html>`)
  assert.equal(p.brand, null)
})

// ---------- pages that are not the product (2026-07-29) ----------
// Lawrence: "make sure we give good clear error messages when we hit a site
// that just doesn't work well for us." Step one is refusing to call these
// pages a product — each of the three below filed its title as gear.

test('a bot wall is not an item', () => {
  // Lancaster's Cloudflare interstitial, which arrived as "Just a moment...".
  const p = extractProduct(`<html><head><title>Just a moment...</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
    </head><body>Verifying you are human.</body></html>`)
  assert.equal(p.name, null)
  assert.equal(p.problem, 'blocked')
})

test('a challenge answering 200 is still a bot wall', () => {
  // The status code says nothing here — only the page does.
  const p = extractProduct(`<html><head><meta property="og:title" content="Attention Required! | Cloudflare">
    </head><body>Access denied</body></html>`)
  assert.equal(p.name, null)
  assert.equal(p.problem, 'blocked')
})

test('a dead link is not an item', () => {
  // mountainhouse.com answered a real page titled "404 Not Found".
  const p = extractProduct(`<head><meta property="og:title" content="404 Not Found"></head>`)
  assert.equal(p.name, null)
  assert.equal(p.problem, 'dead')
})

test('a parked domain is a dead link', () => {
  // spothogg.com (no hyphen) is for sale; the real store is spot-hogg.com.
  const p = extractProduct(`<html><head><title>spothogg.com</title></head>
    <body><p>This domain may be for sale.</p></body></html>`)
  assert.equal(p.name, null)
  assert.equal(p.problem, 'dead')
})

test('a real product is never mistaken for a wall', () => {
  // The words that mark an interstitial appear in ordinary copy too, so a
  // page that actually carries product data keeps it.
  const p = extractProduct(ldPage({
    '@type': 'Product', name: 'Security Check Padlock', brand: { name: 'Abus' },
    weight: { value: 4, unitText: 'oz' },
  }))
  assert.equal(p.problem, null)
  assert.equal(p.name, 'Abus Security Check Padlock')
})

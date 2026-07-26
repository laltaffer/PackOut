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
  assert.deepEqual(p, { name: null, kcal: null, proteinG: null, carbsG: null, fatG: null, weightOz: null, perServing: false })
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

// Formatting + shared label vocabulary. Pure string-building — no DOM, no state.

export const INTENSITIES = ['easy', 'medium', 'hard']
export const VERDICT_LABELS = { fueled: 'Fueled', short: 'Short', heavy: 'Heavy' }
export const SLOT_LABELS = { electrolytes: 'Electrolytes / Fluid', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' }
export const STYLE_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
export const TRIP_TYPE_LABELS = { backpacking: 'Backpacking', rifle: 'Rifle hunt', bow: 'Bow hunt', fishing: 'Fishing' }

export function fmt(n) {
  return Math.round(n).toLocaleString()
}

// Ounces stop meaning anything you can feel somewhere past a pound: 463.35 oz
// is a number, 28 lb 15.4 oz is a load (Lawrence, 2026-07-27). Below a pound
// stays in ounces, where the tenths are the whole point.
export function fmtOz(oz) {
  if (typeof oz !== 'number' || !Number.isFinite(oz)) return '—'
  const round1 = n => Math.round(n * 10) / 10
  if (oz < 16) return `${round1(oz)} oz`
  let lb = Math.floor(oz / 16)
  let rem = round1(oz - lb * 16)
  // Rounding the remainder can reach a whole pound — carry it.
  if (rem >= 16) { lb += 1; rem = 0 }
  return rem ? `${lb} lb ${rem} oz` : `${lb} lb`
}

export function macroLine(f) {
  const g = v => v === null ? '—' : `${v}g`
  const oz = f.weightOz === null ? '— oz' : fmtOz(f.weightOz)
  return `${f.kcal} kcal · C ${g(f.carbsG)} · F ${g(f.fatG)} · P ${g(f.proteinG)} · ${oz}`
}

export function dayDate(trip, i) {
  const [y, m, d] = trip.startDate.split('-').map(Number)
  const date = new Date(y, m - 1, d + i)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function tripDateRange(trip) {
  return `${dayDate(trip, 0)} → ${dayDate(trip, trip.days.length - 1)}`
}

// What the destination lookup found, as one line. `last-year` is labelled as
// history so nothing here reads as a promise about the week ahead.
export function conditionsLine(trip, { withLabel = true } = {}) {
  const p = trip.place
  if (!p) return ''
  // On a screen that already names the destination, repeating the matched
  // label is a second identical run of text under the first — the facts are
  // what the line is for.
  const bits = withLabel ? [p.label] : []
  if (p.elevationFt !== null) bits.push(`${p.elevationFt.toLocaleString()} ft`)
  const c = p.climate
  if (c) {
    if (c.tempLoF !== null && c.tempHiF !== null) bits.push(`${c.tempLoF}–${c.tempHiF}°F`)
    if (c.precipDays !== null) bits.push(`rain ${c.precipDays} of ${c.days} days`)
    bits.push(c.source === 'forecast' ? 'forecast' : 'last year, same week')
  }
  return bits.join(' · ')
}

export function gapSentence(v) {
  if (v.status === 'heavy') return `${v.kcalOver.toLocaleString()} kcal over the 115% line — extra weight, your call.`
  const parts = []
  parts.push(v.kcalShort > 0 ? `${v.kcalShort.toLocaleString()} kcal short` : 'calories fine')
  parts.push(v.proteinShortG > 0 ? `${v.proteinShortG} g protein short` : 'protein fine')
  return parts.join(' · ')
}

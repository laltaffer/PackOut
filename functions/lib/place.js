// Destination lookup (Lawrence 2026-07-27: "when setting a destination we
// should be doing some on-the-fly lookup so this can inform what we suggest
// someone take"). Typed text in, structured place + conditions out — stored on
// the trip so later suggestion work has something objective to reason about.
//
// Upstream is Open-Meteo: keyless, no attribution string required, and the
// three hosts are compile-time constants, so unlike /api/scrape there is no
// user-controlled URL here and no SSRF surface — only the query string is
// user text, and it is encoded.

const GEOCODE_HOST = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_HOST = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_HOST = 'https://archive-api.open-meteo.com/v1/archive'

const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum'
const UNITS = 'temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto'

// Open-Meteo publishes 16 days of forecast. A trip starting inside that window
// gets the real forecast; anything further out falls back to what the same
// calendar week actually did last year — labelled, so the UI never presents
// history as a prediction.
const FORECAST_HORIZON_DAYS = 16
// A day counts as wet at a tenth of an inch — below that is a passing shower,
// not a reason to carry a shell.
const WET_DAY_IN = 0.1
const METERS_TO_FEET = 3.28084
const MAX_QUERY = 120
const TIMEOUT_MS = 6000
// Trip setup caps days at 30; the guard is here too so a hand-made request
// can't ask the archive for a decade of daily rows.
const MAX_DAYS = 30

const iso = d => d.toISOString().slice(0, 10)

// Dates are plain YYYY-MM-DD with no timezone: parse them as UTC so a trip
// never slides a day depending on where the Worker runs.
function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''))
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : d
}

function shiftDays(date, n) {
  return new Date(date.getTime() + n * 86400000)
}

async function getJson(url, fetcher) {
  const res = await fetcher(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json', 'user-agent': 'PackOutBot/1.0 (+https://packout.pages.dev)' },
  })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return res.json()
}

// A place is only as good as its label: "Brooks Range" alone is ambiguous, so
// the region and country ride along in the text the user sees.
function labelOf(hit) {
  return [hit.name, hit.admin1, hit.country_code || hit.country].filter(Boolean).join(', ')
}

const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const round = (v, p = 0) => v === null ? null : Math.round(v * 10 ** p) / 10 ** p

// Collapse the daily series into the four numbers a packer acts on. Missing
// days (nulls in the upstream arrays) are dropped rather than counted as zero —
// a gap in the data must not read as a dry day.
function summarize(daily, source) {
  const his = (daily?.temperature_2m_max ?? []).filter(v => typeof v === 'number')
  const los = (daily?.temperature_2m_min ?? []).filter(v => typeof v === 'number')
  const wet = (daily?.precipitation_sum ?? []).filter(v => typeof v === 'number')
  if (!his.length && !los.length && !wet.length) return null
  return {
    tempHiF: round(avg(his)),
    tempLoF: round(avg(los)),
    precipIn: round(wet.reduce((a, b) => a + b, 0), 2),
    precipDays: wet.filter(v => v >= WET_DAY_IN).length,
    days: Math.max(his.length, los.length, wet.length),
    source,
  }
}

// Weather for the trip's actual dates. Never throws: conditions are a bonus on
// top of a successful geocode, and a dead weather host must not lose the
// coordinates the caller came for.
async function conditionsFor(hit, startDate, days, fetcher, now) {
  const start = parseDay(startDate)
  if (!start || !(days > 0)) return null
  const end = shiftDays(start, Math.min(days, MAX_DAYS) - 1)
  const today = parseDay(iso(new Date(now)))
  const daysOut = Math.round((start.getTime() - today.getTime()) / 86400000)
  const coords = `latitude=${hit.latitude}&longitude=${hit.longitude}`
  try {
    if (daysOut >= 0 && daysOut + days - 1 <= FORECAST_HORIZON_DAYS) {
      const url = `${FORECAST_HOST}?${coords}&daily=${DAILY}&${UNITS}` +
        `&start_date=${iso(start)}&end_date=${iso(end)}`
      return summarize((await getJson(url, fetcher)).daily, 'forecast')
    }
    // Same calendar window, last year. The archive lags a few days, so a trip
    // window that has not fully closed yet still resolves.
    const url = `${ARCHIVE_HOST}?${coords}&daily=${DAILY}&${UNITS}` +
      `&start_date=${iso(shiftDays(start, -365))}&end_date=${iso(shiftDays(end, -365))}`
    return summarize((await getJson(url, fetcher)).daily, 'last-year')
  } catch {
    return null
  }
}

// KV cache key: the question, not the answer. Forecasts move, so they expire
// in hours; a last-year lookup is settled history and can sit for a month.
const cacheKey = (q, startDate, days) =>
  `place:${q.toLowerCase()}|${startDate ?? ''}|${days ?? ''}`
const FORECAST_TTL_S = 6 * 3600
const HISTORY_TTL_S = 30 * 24 * 3600

export async function lookupPlace({ query, startDate, days, fetcher = fetch, kv = null, now = Date.now() }) {
  const q = String(query ?? '').trim()
  if (!q) return { ok: false, status: 400, body: { error: 'Type a destination first.' } }
  if (q.length > MAX_QUERY) return { ok: false, status: 400, body: { error: 'That destination is too long.' } }

  const key = cacheKey(q, startDate, days)
  if (kv) {
    try {
      const hit = await kv.get(key, 'json')
      if (hit) return { ok: true, status: 200, body: { ...hit, cached: true } }
    } catch { /* a cold cache is not an outage */ }
  }

  let geo
  try {
    geo = await getJson(`${GEOCODE_HOST}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`, fetcher)
  } catch {
    return { ok: false, status: 502, body: { error: 'Could not reach the place lookup.' } }
  }
  const hit = geo?.results?.[0]
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') {
    return { ok: false, status: 404, body: { error: 'No place by that name — the trip keeps what you typed.' } }
  }

  const place = {
    label: labelOf(hit),
    lat: round(hit.latitude, 4),
    lon: round(hit.longitude, 4),
    elevationFt: typeof hit.elevation === 'number' ? Math.round(hit.elevation * METERS_TO_FEET) : null,
    climate: await conditionsFor(hit, startDate, days, fetcher, now),
    at: now,
  }
  // A missing climate means the weather host was down, not that this window
  // has no weather — caching that for a month would suppress conditions (and
  // the gear suggestions built on them) long after the outage (Codex,
  // 2026-07-27). Only a real answer is worth storing, and only settled
  // history earns the long TTL.
  if (kv && place.climate) {
    try {
      await kv.put(key, JSON.stringify(place),
        { expirationTtl: place.climate.source === 'forecast' ? FORECAST_TTL_S : HISTORY_TTL_S })
    } catch { /* the caller still gets their answer */ }
  }
  return { ok: true, status: 200, body: place }
}

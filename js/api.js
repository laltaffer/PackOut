// Client callers for the Pages Functions endpoints, plus the one piece of
// shared form wiring built on them (Fetch-from-product-page). Never throws —
// a dead service is a message, not a broken screen.

export async function fetchProduct(url) {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.status === 401) return { ok: false, error: 'Sign in to fetch product pages.' }
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      return { ok: false, error: `${data?.error ?? `Couldn’t fetch that page (HTTP ${res.status}).`} Enter it by hand.` }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: 'Couldn’t reach the fetch service — enter it by hand.' }
  }
}

// Destination lookup (Lawrence 2026-07-27). Advisory: a miss leaves the typed
// destination exactly as typed and the trip saves anyway.
export async function lookupDestination(query, startDate, days) {
  try {
    const res = await fetch('/api/place', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, startDate, days }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return { ok: false, error: data?.error ?? 'Lookup unavailable.' }
    return { ok: true, place: data }
  } catch {
    return { ok: false, error: 'Lookup unavailable — the trip keeps what you typed.' }
  }
}

// Scrape-to-prefill (issue #23): fetch product data for the pasted URL and
// fill only the still-blank fields — never clobber typed values, never save.
// JSON-LD nutrition is per serving; PackOut kcal is whole-item-as-packed, so
// any filled nutrition number carries an explicit scale-it-yourself caution.
const SCRAPE_LABELS = { name: 'name', kcal: 'calories', carbsG: 'carbs', fatG: 'fat', proteinG: 'protein', weightOz: 'weight' }

export function wireScrape(form, fields) {
  const btn = form.querySelector('#scrape-btn')
  const status = form.querySelector('#scrape-status')
  const say = (msg, isError) => {
    status.textContent = msg
    status.classList.toggle('field-error', !!isError)
  }
  btn.addEventListener('click', async () => {
    const url = form.elements['url'].value.trim()
    if (!url) { say('Paste a product URL first.'); return }
    btn.disabled = true
    say('Fetching…')
    const data = await fetchProduct(url)
    btn.disabled = false
    if (!data.ok) { say(data.error); return }
    const filled = fields.filter(name => {
      const input = form.elements[name]
      if (!input || input.value !== '' || data[name] == null) return false
      input.value = data[name]
      return true
    })
    if (!filled.length) {
      if (weightsAmbiguous(form, data, say)) return
      say(data.found ? 'Nothing new to fill — the blank fields weren’t on that page.' : 'No product data on that page — enter it by hand.')
      return
    }
    const nutrition = filled.some(k => ['kcal', 'carbsG', 'fatG', 'proteinG'].includes(k))
    const filledMsg = `Filled ${filled.map(k => SCRAPE_LABELS[k]).join(', ')}.` +
      (nutrition && data.perServing ? ' Nutrition is per serving — scale to the whole item as you pack it.' : '')
    const options = data.weightOptions ?? []
    if (options.length > 1 && form.elements['weightOz']?.value === '') {
      say(`${filledMsg} Page lists multiple weights (${options.join(' / ')} oz) — enter the one for your setup.`, true)
    } else {
      say(filledMsg)
    }
  })
}

// A page that states several weights has narrowed the answer without giving
// it — a tripod lists its long and short columns, a pack tables four models.
// Say so and stop: nothing in the markup says which one is on your back, and
// guessing would put a wrong number in a pack total. Lawrence 2026-07-27:
// "this is pretty common for these types of products so the user will
// understand" — so it is a sentence, not a picker.
function weightsAmbiguous(form, data, say) {
  const options = data.weightOptions ?? []
  const input = form.elements['weightOz']
  if (options.length < 2 || !input || input.value !== '') return false
  say(`Page lists multiple weights (${options.join(' / ')} oz) — enter the one for your setup.`, true)
  return true
}

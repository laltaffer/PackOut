---
status: active
type: web app
stack: vanilla HTML/CSS/JS (no build step), localStorage, Cloudflare Pages
github: https://github.com/laltaffer/PackOut
prev_path: n/a — created in tree
---

# PackOut

## Overview
Backcountry hunt planner web app. Takes trip inputs (destination, number of days,
activity level, body weight), suggests gear with a fully editable packing checklist,
and plans food using the Valley to Peak nutrition model. Ends in a readiness
checklist: enough food per day, grocery list, per-day packing, gear, and trip notes.

## Scope
**In (v1):**
- Trip setup: destination, days, per-day intensity (Easy/Medium/Hard), body weight.
- Nutrition engine ported from the V2P sheet (`reference/v2p-nutrition-sheet-export.md`):
  daily kcal = f(body weight, intensity); macros carbs 40–60%, protein 10–15%
  (min 0.6 g/lb), fat remainder; meal targets (snacks ~300 kcal/40–60 g carbs,
  breakfast 200–400 kcal, dinner ~25% kcal / 30–40 g protein / 60–90 g carbs).
- Food library (JSON) seeded from the sheet's items with cals/macros/weight-oz;
  user can add custom foods. Cals-per-oz surfaced (pack weight matters).
- Per-day meal builder with running totals vs. targets.
- Gear checklist: suggested baseline by trip profile + user add/remove/check.
- Final checklist view: food sufficiency per day, grocery list, per-day pack plan,
  gear list, trip/location notes. Printable.
- localStorage persistence; no accounts, no backend.

**Out (v1):** accounts/sync, native app, offline-first service worker, live weather
or mapping integrations, multi-hunter parties.

## Key Decisions
- KISS stack: vanilla static HTML/CSS/JS, no build step — deadline is 13 days out;
  everything else in the portfolio proves this deploys trivially to Cloudflare Pages.
- Public repo + published demo (Lawrence: "we could probably find a demo and publish").
- Food logic is a port of the Valley to Peak (v2pnutrition.com) calculator sheet,
  kept as a pure data + calc module so the UI stays dumb.

## Product Brief (DEFINE, 2026-07-19)
**Problem:** Planning backcountry hunt food in a spreadsheet means re-entering the same
foods every day and every trip, squinting at totals to see if a day is under-fueled, and
no memory of what you actually like eating on the trail.
**Named user:** Lawrence — solo backcountry hunter; next trip Alaska 2026-08-01. The
consequence of failure is concrete: under-fueled or over-packed on a physically serious hunt.
**Wedge (Milestone 1 — food planner, usable by ~2026-07-25):** trip setup (days, body
weight, per-day intensity) → V2P daily kcal/macro targets → assemble each day from a
persistent personal food library (macros + weight, entered once, remembered forever) →
deterministic gap feedback ("day 3 is 400 kcal short; these library items close it") →
grocery list + per-day food pack plan.
**Milestone 2 (pre-trip if time allows):** gear checklist seeded from Lawrence's Montana
hunt gear sheet (link pending), adjusted for Alaska weather; combined readiness checklist.
**Non-goals:** accounts/backend, LLM calls (far-future nice-to-have — v1+v2 intelligence
is deterministic: Favorites, Staple detection, gap-closing suggestions), multi-hunter
parties, offline service worker, weather/mapping integrations.
**Open bets:** anyone beyond Lawrence wants this (demo publish tests it); deterministic
gap-closing is "intelligent enough"; localStorage survives real-trip usage patterns.

## Product Brief — Accounts milestone (DEFINE, 2026-07-21)
**Problem:** progress lives in one browser's localStorage — a new device or a buddy's
phone starts from zero, and clearing the browser loses everything.
**Named users:** Lawrence + his hunting buddies, each with their own private profile.
**Wedge:** optional Google sign-in (Google Identity Services) with whole-state sync:
a Cloudflare Pages Function verifies the ID token, state blob lives in Cloudflare KV
keyed by Google account, last-write-wins by updatedAt. Local-first — signed-out
PackOut is byte-identical to today; first sign-in adopts the existing local data.
Buddies get the seeded branded library on their first load.
**Next milestone (after sign-in ships):** lightweight onboarding — new users set
brand/food preferences (stars) instead of inheriting Lawrence's Guidefitter stars.
**Non-goals (this milestone):** shared/collaborative trips, read-only share links,
per-trip merge, offline queue beyond debounce, any non-Google identity.
**Open bets:** LWW is enough for one-person profiles; a single KV blob per user
carries years of trips; GIS button UX is acceptable on phones in the field.
**Account-required flip (2026-07-21, Lawrence):** the local-first model was
superseded the same day it shipped — seeing his trips under a sign-in button
read as "already signed in", and device-owned data could cross-adopt into the
next account to sign in on a shared browser. Now sign-in is required: signed
out shows only a gate, the Profile (KV) is the source of truth, localStorage
is a per-device cache tagged with its owner's sub (resolveSignIn: unowned
cache adopts, own cache reuses, another account's cache is discarded), and
sign-out flushes then clears the device. Offline boot with an owned cache
still renders (field mode) — a gate nobody can pass without signal would be
worse than a stale cache.
- Platform: Cloudflare Pages, project `packout` (account laltaffer@gmail.com)
- Production URL: https://packout.pages.dev
- Deploy: `./deploy.sh` — runs the engine tests first, aborts on red, uploads only app files
- Agent shells must wrap in a pty: `script -q /dev/null ./deploy.sh` (wrangler OAuth refuses non-TTY)
- Auto-deploy: manual per slice for now; GitHub Action (DesignLeaderJobs pattern) deferred
  until a CLOUDFLARE_API_TOKEN repo secret exists — see issue #3
- Verify: deploy.sh now waits for packout.pages.dev to serve the new commit
  stamp itself (up to 2 min) and exits non-zero if it never does. Production
  trails the preview alias by ~30s — checking sooner reads the OLD stamp and
  looks like a failed deploy (misdiagnosed as a preview-vs-production problem
  2026-07-27; it was only lag). Then phone smoke at 390px.
- Accounts API (spec #19): `functions/` deploys as the Pages Functions bundle via the
  same deploy.sh; bindings live in wrangler.toml (KV PACKOUT_KV id 87c61ede…, var
  GOOGLE_CLIENT_ID). SESSION_SECRET is a Pages secret (`wrangler pages secret put`,
  already set 2026-07-21 — rotate by re-running; rotation signs everyone out).
- Local dev with the API: `npx wrangler pages dev .` (static-only python server
  still works for everything signed-out)

## Key Decisions (Draft assistant, 2026-07-20)
- Usual Draft (habit-replay, nutrition-corrected) is P0; Optimized (nutrition-optimal)
  exposed as the alternate — Lawrence's call at SPEC.
- Drafting is always user-initiated (never automatic); full-day proposal with an
  overwrite warning on planned days; drafts write ordinary editable entries.
- Dinners rotate across drafted days; all other food repeats. Mains need ≥400 kcal
  (add-ons like cider never propose as the big meal).
- P1 (issue #17): swap-in-place, "never suggest" flag.
- **±50 kcal window (2026-07-20, "the plans are a suck" round):** a draft lands
  within ±50 kcal of the day target — overshoot to 115% was rebuilt out. Breakfast
  obeys 200–400 hard (that window + prep bias excludes every Peak Refuel pouch =
  his "bias breakfast against Peak Refuel toward bars/no-prep"). Snacks: one flat
  bucket per day (was ≤3 bundles until 2026-07-28; legacy data merges on load),
  repeats stack qty (Goldbears per-oz is the ±50 fine-tuner). Protein is maximized
  inside the window, never bought past it — a residual gap shows as Short (protein).
  Library gap (no protein-dense snack) closed 2026-07-21: FATTY Original 2 oz stick
  (his brand; USDA FDC 2510113: 200 kcal / 13 g P, seed v11 — v10's Jack Link's was
  superseded same-day and retires by sweep) — drafts now meet the raw floor.
- **Protein floor grace (2026-07-20, Lawrence):** a day inside its kcal window is
  fine a couple grams under the floor — Verdict allows 5 g of grace before Short;
  beyond it, the full gap to the true floor is reported.
- **Seed v9 = one-time full wipe (2026-07-20, his explicit ask):** library rebuilt
  from seed exactly (user foods dropped, past deletions resurrected, ToastChee
  retired), all planned meals + food packed marks cleared on every device. The six
  Guidefitter-order meals ship pre-starred so fresh states draft his core meals.
- **Stale-JS fix:** `_headers` serves HTML with Cache-Control: no-store (module
  chain stays cached via ?v=<sha> stamps); dashboard footer shows the build sha.
- **Meal Style (issue #18, 2026-07-21):** trip setup + edit ask Mobile vs
  Sit-down per meal slot. Mobile = cook foods excluded from drafts only (manual
  adds untouched — Lawrence's rule); sit-down breakfast widens its kcal cap to
  the dinner share (~25% of day kcal — the Skillet can land, snacks shrink to
  compensate); sit-down lunch draws the dehydrated catalog (favorites first,
  never the day's own dinner, one pouch max — one boil per meal, the rest of
  the window fills with ready sides); mobile dinner composes from ready foods toward
  its share. Defaults (breakfast/lunch Mobile, dinner Sit-down) reproduce prior
  drafts exactly, so existing trips are unaffected until the dropdowns move.

## Key Decisions (UI/UX round 1, 2026-07-20)
- **Desktop-first for PackOut** — Lawrence's directive, overrides the global
  mobile-first rule for this project; mobile must stay functional (Alaska = phone).
- Intensity is labeled "Effort" in the UI. Protein floor removed from all displays
  (Verdict still uses 0.6 g/lb internally — revisit if Lawrence kills the concept).
- Day cards: Planned | Target two-column macro table; verdict-colored left accents
  carry the hierarchy; container borders quieted to 1px.
- Meals are ≥300 kcal (breakfast 200 per V2P), single item or stacked — drafting
  composes from slot + snack pools ("ProBar plus gummy bears" is a lunch).

## Deploy Config

- Platform: static-host (Cloudflare Pages, project `packout`, account laltaffer@gmail.com)
- LOCAL-ONLY: no
- Base branch: main
- Test command: `node --test test/*.test.mjs`
- Typecheck/lint: none — vanilla JS, no toolchain by design
- Build command: none — no build step; deploy.sh assembles `.scratch/deploy` (copies app
  files, stamps every relative import + the entry with `?v=<sha>`)
- Deploy method: `script -q /dev/null ./deploy.sh` (pty wrapper — wrangler OAuth refuses
  non-TTY). deploy.sh gates on tests, uploads via wrangler with `--branch=$(current)`
  (production only from main), then waits up to 2 min for packout.pages.dev to serve the
  new stamp and fails loudly if it never does
- Production URL: https://packout.pages.dev
- Health check: built into deploy.sh (production must serve the new `?v=` stamp);
  manual: `curl -s https://packout.pages.dev | grep -o 'ui.js?v=[a-f0-9]*'`
- Smoke flows (390px first): signed-out gate renders with GIS button in both brands;
  `/api/me` answers; console clean. Signed-in flows can't be automated (Google) — the
  stub-session QA (.scratch/qa-server.mjs) covers them pre-deploy

## Production Readiness

- CI: none — decided; manual deploy per slice until a CLOUDFLARE_API_TOKEN repo secret
  exists (issue #3)
- Env/secrets: wrangler.toml bindings (KV PACKOUT_KV, var GOOGLE_CLIENT_ID);
  SESSION_SECRET is a Pages secret (`wrangler pages secret put`; rotation signs everyone out)
- Database: Cloudflare KV, one whole-state blob per Google sub, last-write-wins;
  no migrations — `validateImport` gates every write, `applySeedMigrations` runs client-side
- Backups: user-facing Export JSON; pre-edit copies of Lawrence's live blob in `.scratch/`
- Monitoring: none — decided (closed user base); a deploy never writes KV
- Dependency updates: on-audit-finding only — zero runtime dependencies

## Status

### Where things stand (2026-07-29)
2026-07-29 (shipped): **URL import carries the brand, and a failed fetch names its
failure** — LIVE at build c4a01e6. Lawrence: "we are dropping the brand name most of
the time." The brand is read from the ITEM, never the site — REI sells Osprey packs and
its own Co-op packs from identical URLs, so `og:site_name` is deliberately never
consulted. Order: JSON-LD `brand`/`manufacturer` on any Product-ish node (ProductGroup
included, and read there for the BRAND ONLY so per-variant weights like REI's "S/M: 4
lbs. 10 oz." never pass as the item's), then Shopify `vendor` — anchored to the vendor
sitting behind a title field matching the page's own name, which is what pulls STAN
Outdoors off a Lancaster page that also names Easton and its house label. Several
vendors with no such anchor → no brand, never a coin flip. Storefront signage is cut at
a whitespace-adjacent dash/pipe/comma ("Hoyt- Online Clothing and Gear Store" → Hoyt;
Therm-a-Rest survives). Prefix is skipped when the name already says the brand or leads
with a shorter form. Catalog entries without a `brand` key re-scrape rather than serve a
brandless name for a week. Second half: bot walls and dead links were *succeeding* —
Lancaster's Cloudflare interstitial filed as "Just a moment…", Mountain House's dead
link as "404 Not Found". Such a page loses its name and keeps a verdict, and only a page
with no product data at all can be judged that way. 403/429 → "That store blocks
automated lookups", 404/410 → "That page is gone", 5xx → "failing right now… try again
later", DNS → "Couldn't reach that site", non-HTML → "paste the product page's URL";
failures now render as errors, not the same grey as "Filled name, weight." 329 tests.

**Found during production verification — the fetch feature's real reach is much
narrower than a laptop suggests.** From Cloudflare Workers egress, Shopify-hosted stores
refuse us: Stone Glacier, Peak Refuel, Exo, HMG, Mathews, Hoyt, TRU-Ball, Lancaster,
Argali, Aziak, Garage Grown Gear all answered "blocked" from production while every one
of them answered a `wrangler pages dev` run on Lawrence's Mac minutes earlier. Kifaru
and Spot Hogg (BigCommerce) got through. This is pre-existing — the shipping commit
changed no fetch header, UA, or redirect behaviour — and it was invisible until the
first signed-in production test. The catalog softens it (captured facts still answer,
and a blocked re-scrape falls back to the stored copy), but new lookups mostly fail.
**Decided and measured (build 547cebf): the UA was not the cause.** The outbound UA is
now `Mozilla/5.0 (compatible; PackOutBot/1.0; +https://packout.pages.dev)` — the
Googlebot/bingbot shape, browser-prefixed so naive filters pass, still naming who calls
and where to complain; a full Chrome impersonation tested identically (both 200 on
Garage Grown Gear), so nothing is bought by lying and we don't. Both outbound fetches
share one constant, and the request now sends accept-language.

It changed nothing in production. The control settles it: Stone Glacier answers the OLD
bare `PackOutBot/1.0` with 200 from Lawrence's Mac, and blocks the NEW browser-shaped UA
from Workers egress. **The block is the network, not the string** — Shopify's protection
is refusing Cloudflare Workers egress IPs. Keep the new UA (honest, standard, and it
does clear UA-only filters like Garage Grown Gear's off a non-blocked network), but it
is not the fix.

**BUILT AND LIVE (build b70edd6).** `extractProduct` is pure and takes a string, so it runs
CLIENT-SIDE on the page the user's own browser fetches — and the assumption that a browser
cannot read another site's HTML was wrong for exactly the stores that block us: Shopify
serves storefront pages with permissive CORS. Verified with a negative control (example.com
and Wikipedia are refused in the same browser, same code). `js/extract.js` is now shared by
the Worker and the page; `lookupProduct` tries the server first (the shared catalog answers
free) and falls back to `fetchProductInBrowser` — credentials omitted so nothing is fetched
as the user, http(s) only, byte-capped stream, null on every failure, HTML only ever
string-matched. Live results: HMG's six weights, Kifaru 14/31/43, Exo 93/26/73/81, Argali,
Aziak, Hoyt, Lancaster/STAN, Mathews. REI and Backcountry stay walled both ways.

**Catalog growth changed (build 1ef54e0, Lawrence's call):** a browser read publishes to the
shared catalog via session-gated `POST /api/catalog`. It had to — a catalog only the Worker
can write is one that stopped growing the day the blocks started. The endpoint trusts nothing
a client sends: known fields only, inside the extractor's own SANE_MIN_OZ/SANE_MAX_OZ/
MAX_WEIGHT_OPTIONS bounds (those now have one home in js/extract.js and are imported), bot
walls and dead links refused, and a weightless read can never overwrite a captured weight. No
author is stored — shared record, objective facts. Knock-on: a catalog hit is no longer
automatically terminal (it may be someone's partial entry), so it ends a lookup only when it
carries a weight or an honest list of weights.

**Seeded GEAR_CATALOG brands (same build):** ten names branded from the maker's or seller's own
page. Two page-stated brands were rejected by curation because the PAGE is wrong — Helinox's
JSON-LD declares the Chair Zero's brand as "Outdoor", and reseller Mountain Partisan records
itself as the vendor of a Katadyn filter. There is no signal on either page that contradicts
it, so the extractor will keep reporting it; the mitigation is that prefill is reviewed in a
form before anything saves. Four entries stay unbranded (generic spork, stakes, pole, cover).

Codex review found three real defects (bot wall with a stray weight returning as a product;
any partial server answer suppressing the fallback; the cap counting UTF-16 units not
bytes) and one it ranked Low that was the worst of the lot: quadratic regex backtracking,
70 SECONDS on 600 KB of malformed markup, in FOUR places (markup stripper, JSON-LD block
matcher, metaContent, <title>). All four scan forward now. Production verification then
caught what no test could: a 600 KB read cap returned HMG named but weightless, because its
weights sit past 900 KB — the cap matches the server's 1.5 MB.

**Superseded — the old note, kept for the reasoning:** `extractProduct` is pure and takes a string, so it can run
CLIENT-SIDE on HTML the user's own browser already loaded — a bookmarklet or a
paste-the-page affordance would sidestep bot walls entirely, because the person really
is a person on a residential connection looking at the page. No evasion, no proxy fees,
no egress problem. The alternative — a residential-proxy scraping service — costs money
and IS the evade-detection business, a heavier footprint than anything here. Doing
nothing is also viable: the catalog answers for known gear and manual entry covers
the rest.

2026-07-28 (shipped): **Google Sheet import (issue #26)** — LIVE at build 95bd7df.
Paste a link-shared Google Sheet on the dashboard ("Bring your own list" → `#/import`):
`/api/sheet` (session-gated, fixed docs.google.com export host — no SSRF surface,
oversize CSVs refused at the 1.5M cap) fetches the CSV; the pure interpreter
(`js/sheet-import.js`, tested against Lawrence's real Montana packing sheet as a
fixture) reads three shapes — packing-list header groups (ALL-CAPS/colon cells;
category defaults from a header→category vocabulary, then item keywords), tabular
nutrition tables (word-bounded column match — "Caliber" is not calories), and day
plans **only** from an unmistakable Day 1…N + meal-label structure (gaps, missing
labels, >31 days, or zero foods refuse the plan with the reason; never guess).
Preview before commit: editable names, per-group category dropdown, inline kcal
(a food only imports with kcal > 0; unfilled rows reported, never dropped
silently), duplicates disabled ("already in your library"). Commit dedupes on the
EDITED names against the live library, caps at 500 items, and a resolvable plan
becomes a trip (qty-aggregated meals; body-weight fallback 180 with a set-it nudge).
Excel/OneDrive links out of scope (upload to Google Sheets or use Import JSON).
Review: eng-review two-axis + Codex cross-model (1 High — unbounded-import sync
lockout, 6 Medium: all fixed or already-fixed; deferred: /api/sheet rate limiting
per the standing closed-user-base decision, and all-caps acronym items (GPS)
reading as group headers — visible in preview, recoverable by hand). 306 tests
green; QA'd both brands at 390px/1400px against the stub session with the REAL
Google fetch of the real sheet; production verified (gate + GIS at 390, /api/me
200, /api/sheet 401 signed out, console clean).
LIVE at packout.pages.dev, build **66cf535** — the module refactor shipped
via /ship-it (tests → security quick-gate → deploy → verified live: all 18
stamped modules load once, gate + GIS + /api/me answer at 390px, console
clean). Repo clean and pushed; production carries every line of code.
268 tests green. `## Deploy Config` now exists (above) — ship-it's hard
requirement, filled from the facts this file already carried.

**Needs Lawrence, in rough priority order:**
1. **Reload PackOut before editing anything.** His KV blob was edited directly
   twice (Pack bag/frame deleted; 5 items marked `carry: harness`). The device
   pulls on load, but editing first would push a copy predating both. Pre-edit
   copies: `.scratch/live-state-before-packrow-delete.json`,
   `.scratch/live-state-before-carry.json`.
2. **The curated gear catalog.** His to supply: "I can help build a healthy
   catalog of the top products most everyone is using." Adding entries to
   `GEAR_CATALOG` in seed.js is a data edit plus a deploy, no engineering.
3. **Duplicate optics rows** — blank `Binoculars` / `Range finder` slots sit
   beside the real Swarovski NL Pure and Sig Kilo5k. Offered to delete, not
   done. Naming the generics is now the intended path ("name yours").
4. **Three specific products still unweighed**: Swarovski NL Pure, Sig Kilo5k,
   Enclosed Binocular Chest Pack. Two have URLs, so Specify → Fetch lands them.

**First outside user, 2026-07-27:** Lawrence shared the root URL with one
friend. Sign-in gave a blank page — GIS had fallen back to redirect mode and
POSTed to a static host answering 405 with an empty body. Fixed and
**confirmed working by the friend the same night**. The bug lived in the one
sign-in path no desktop dev browser ever takes.

**Unverified / deferred, stated plainly:**
- **Google consent screen: CONFIRMED In production** (Lawrence read it off the
  Console Audience page, 2026-07-28: project packout-503121, User type
  External, 0/100 user cap — cap irrelevant since only basic scopes are
  requested). Any Google account can sign in; this item is closed.
- **No rate limiting anywhere in `functions/`** — deferred on a "closed user
  base" premise that sharing the root URL retires. Any signed-in stranger can
  spend the Open-Meteo quota and the scrape proxy. Fine for a few buddies;
  revisit before anything public.
- **KV write ceiling**: free tier ~1,000 writes/day, and PackOut writes the
  whole blob on every change. A handful of active planners could approach it;
  the failure mode is sync errors mid-planning.

2026-07-27 (late, NOT deployed): **The ui.js monolith is gone** (1df5057..
9a521d6, four commits). 2,493 lines decomposed into foundation modules —
`state.js` (live-binding app state + persist/commit + a rerender hook, so
screens never import the router), `dom.js`, `format.js`, `api.js`, `brand.js` —
and eight `js/screens/*` modules (dashboard, trip-form, trip, gear,
gear-editor, outputs, library, profile), each owning its screen-local state.
ui.js is a 200-line entry: imports, hash router, gate, account chip, sync
wiring. `gear-editor.js` is the shared editor seam both the trip gear screen
and the Library shelf render. Discipline: every moved function mechanically
body-diffed against HEAD (only intended edits), tests + live browser pass +
code-review agent per step, Codex over the whole range at the end. Codex's one
finding was real: deploy.sh's generic import stamp missed bare side-effect
imports (`import './brand.js'`), which would have loaded brand.js under two
URLs — fixed, both forms stamp now. seed.js split was evaluated and DECLINED:
its kit/profile functions are thin projections over the tables they sit beside,
and the split renames the tested seam across 13 import sites while shrinking no
interface. QA: both brands, 390px + 1400px, console clean; engine untouched.
2026-07-27 (shipped): **The round is LIVE** at packout.pages.dev (build e545f28,
a8d3e16→f17c8f7). Pre-flight read Lawrence's live KV blob and ran it through the
new import gate before deploying — the round added gear validation and
`handleStatePut` runs that same gate on every sync push, so an incompatible
shape would have locked him out of syncing five days before Alaska. It passed;
his 1 trip / 84 foods / 60 gear items are untouched (a deploy never writes KV,
confirmed by re-reading after).
2026-07-27 (shipped): **Shared gear catalog** (`GEAR_CATALOG` in seed.js).
Lawrence's 24 named products — the ones he has actually weighed and linked
(K4 5000, Rincon 2P Dyneema, Swarovski NL Pure, Katadyn BeFree…) — are now
available to every user, **as a catalog, not a closet**. His ask was "add them
to the shared library for any user"; the reading chosen (his call, from three
options) offers them in the gear picker under "Known gear" and copies one into
your library only when you pick it. That satisfies the ask while keeping the
2026-07-27 morning rule intact: nobody's closet is pre-filled, and a stranger
never inherits someone else's Kifaru. Entries are objective product facts
(name, category, weight, product page) — the same standard the scrape catalog
already holds. Ids are `gc-` slugs and become the gear id on adoption, so they
must stay stable: rename the `name`, never the `id`. A test proves an adopted
entry survives the import gate, since adoption feeds the synced library.
  - **Curated, never crowd-sourced (Lawrence, 2026-07-27):** "I don't think we
    need to bring in other's gear, I can help build a healthy catalog of the
    top products most everyone is using." So the catalog stays a hand-picked
    list in `seed.js` — no KV growth, no other users' gear ever joining it.
    Growing it is a content job (add entries to `GEAR_CATALOG`), not a feature.
2026-07-27 (shipped): **Weights read in pounds past a pound** (`fmtOz`, one
helper behind every weight the app displays — carry split, gear rows, picker,
catalog, Library shelf, kit chips and tally, the day's food weight). Under
16 oz stays in ounces, where the tenths matter. Lawrence: "463.35 oz" is a
number; "28 lb 15.4 oz" is a load.
2026-07-27 (shipped): **A generic slot asks to be named.** Lawrence: "when we
start with generic items listed we should let that be editable so someone can
make them specific. I've been removing the generic and adding my specific."
The edit had existed since the morning — it just did not READ as one, sitting
in the same small mono caps as Edit and ×. A slot still wearing its catalog
name is a question, not an item, and ticking "packed" on a tent you have not
chosen means nothing — so the NAME became the control ("Tent · name yours"),
with the generic name kept as the field's placeholder so the box starts empty
and Fetch can fill it. Lesson: a capability nobody finds is not shipped.
2026-07-27 (shipped): **Seed v13 — Chomps Smoky BBQ Beef Stick** (100 kcal,
0 C / 7 F / 10 P, 1.15 oz), plus `chomps` in the brand table so it can be
starred. Label read off the product page, not recalled: serving size is one
stick (33 g), so the panel is the whole item as packed. Additive migration —
never resurrects a deletion.
2026-07-27 (shipped): **Three places a thing can ride.** Lawrence: "let's not
count bino harness items (range finder, pistol, binoculars) in the pack
weight — we could consider it part of overall carry weight." So gear carries a
`carry` mode: `pack` | `harness` | `worn`.
  - **Carry mode is a property of the ITEM, not its category** — the key point.
    A pistol files under safety and binoculars under optics, but both hang on
    the chest; a spotting scope shares the optics category and goes in the
    pack. A category-based rule could not express that without re-filing gear
    across categories. `carryModeOf` defaults from the category (Clothing worn
    → worn, else pack) so every existing item behaves exactly as before, and
    the item overrides it.
  - `gearStats` returns `weightOz` (still the pack number — every caller that
    shows pack weight reads it), plus `harnessOz`, `wornOz` and `carriedOz`
    (all three summed). The gear screen shows the split and the total.
  - Question rows that are near-universally harness-carried ship that way:
    binoculars, range finder, bino harness, pistol. Everything else defaults
    to the pack.
  - Editing "Where it rides" lives in `gearEditorFields`, one editor body now
    shared by the trip gear row and the Library gear shelf — the duplication
    was paid off by this change rather than doubled.
  - Lawrence's live state: 5 items marked harness at his word (Binoculars,
    Range finder, Enclosed Binocular Chest Pack, Sig Kilo5k, Swarovski NL
    Pure). The spotter, tripod and ball head stay in the pack. Pre-edit copy
    in `.scratch/live-state-before-carry.json`.
2026-07-27 (shipped): **The Library holds gear, not just food.** Lawrence:
"it's odd that when I add a new piece of gear it says it's in the library but
when I look at the library tab it just lists food." Two libraries have always
existed in state (`library` = food, `gearLibrary` = gear) but only food had a
screen, so the copy ("Add to library + trip", "Delete from your gear library")
promised something the tab did not show. `#/library` now has two shelves —
Food and Gear, each with its count — and the Gear shelf lists everything you
own with its category, weight and whether it is linked, editable in place
(name, product URL + Fetch, weight, category) and deletable. Deleting names
the trips it will come off first: `deleteGearFromLibrary` is now one shared
act, used by both the Library and the trip picker.
2026-07-27 (shipped): **Fetch pulls weights now — and refuses to guess.**
Lawrence: "when I was doing fetch with URLs it wasn't pulling the weight on
any of the items." Diagnosed against his own saved pages, all Shopify:
  - **Storefronts do not put weight in JSON-LD** (Shopify's Product schema has
    no weight field), so the extractor found nothing. It now reads the spec
    text — "Weight: 18.9 oz" — after stripping markup so `<dt>/<dd>` pairs read
    as one string.
  - **Shopify's own `weight` field is SHIPPING weight and is deliberately
    ignored.** The Exo K4 5000 reads 6804 g there against an 85 oz item —
    trusting it would have quietly added ten pounds to a pack. Aziak: 709 g
    (25 oz) vs a real 18.9 oz. Only Helinox happened to match.
  - **A page stating several weights says so and stops.** The Aziak tripod
    lists long (20.4) and short (18.9) center columns; the Exo page tables four
    models against three configurations. Nothing in the markup says which is on
    your back, so filling one silently would be the same class of error as the
    shipping weight. `weightOptions` comes back and the status line reads "Page
    lists multiple weights (20.4 / 18.9 oz) — enter the one for your setup" in
    the error treatment. **Built as a chip picker first, cut to a sentence at
    Lawrence's word (2026-07-27): "this is pretty common for these types of
    products so I think the user will understand."** The values stay in the
    message so nobody has to reopen the page to read them.
  - Rejected by rule: "Weight Limit: 265 lbs" (capacity), "Weight: Under
    1.5 lbs" (a bound, not a measurement), shipping/carton weight, and anything
    outside 0.05–2000 oz. Compound weights parse including the comma form
    spec tables use ("5lb, 13oz" was reading as a flat 80 oz).
2026-07-27: **Pack bag / Pack frame deleted from Lawrence's live gear library**
at his word (leftovers from before the pack question collapsed to one item).
Done by editing the KV blob directly, validated through `validateImport` first
and read back after; 60 → 58 items, nothing else touched. Pre-edit copy in
`.scratch/live-state-before-packrow-delete.json`.
2026-07-27 (evening): **Seventeen-note dogfood round** (a8d3e16 → d4da21b, six
commits — SHIPPED later the same night along with everything after it; the
"not deployed" note this line used to carry is void). 242 tests green (54 new). QA'd at 390px and
1400px in both brands against a stubbed session (`.scratch/qa-server.mjs`,
disposable); console clean. **Three Codex review rounds** — round 1 found 10
(one HIGH), round 2 confirmed 7 and found 4 more, round 3 confirmed 4 and
found 2. Convergence, not exhaustion: round 3's substantive finding was one I
had already fixed independently, and its other was a test-coverage gap.
  - **The HIGH was real and mine**: `validateImport` never covered
    `gearLibrary`, and a gear weight is interpolated into `innerHTML` — a
    crafted backup or a hostile KV blob could have executed markup and read
    the synced state. Gear is now gated like food (ids, names, categories,
    weights, urls) and every weight reaching `innerHTML` is escaped too.
  - **Two would have bitten in the field**: drafting judged "is this day
    empty?" against the decline-filtered library, so a day planned entirely
    with a declined food read as empty and was silently overwritten; and
    reopening the kit questions cleared `trip.flying`, disabling every airline
    warning.
  - **Lesson worth keeping**: the browser pass caught two crashes the 242-test
    suite did not (a kitReset/kitTripId coupling I introduced while fixing the
    flying flag, and the pre-gear-backup `.map`). Engine tests do not exercise
    render paths — QA the screens, every round.
Seven groups:
  - **Destination lookup** (`POST /api/place`, `functions/lib/place.js`):
    Open-Meteo geocode + the trip window's own forecast, falling back to the
    same calendar week last year and *labelled as history*. Keyless, and the
    three upstream hosts are compile-time constants, so unlike `/api/scrape`
    there is no user-controlled URL and no SSRF surface. Result lands on
    `trip.place`; KV-cached by question (6 h forecast / 30 d history). It
    **suggests, never selects**: a wet week flags the rain options in the gear
    questions, a cold one flags insulation. This is the hook Lawrence asked
    for — future suggestion work reads `trip.place`.
  - **One day surface**: the separate day editor is deleted into the forecast
    board — every meal lists its food inline with qty/remove, so seeing or
    changing what you eat costs no navigation. `/day/N/edit` redirects.
    **Protein floor leaves the UI entirely** (the Verdict still uses 0.6 g/lb
    internally), and the duplicate target beside the effort selector goes.
  - **Drafts respect removals** (the pico de gallo loop): taking a food off a
    day records a per-trip `trip.declined`; drafting never hands it back, and
    the day says "N foods excluded · allow them again". Per-trip on purpose —
    a food with no place in Alaska may still belong in Montana.
  - **Favorites are a preference, not a sort key**: every pick tries the
    starred subset first and only widens when nothing starred fits. Tried
    favorites-*only* for meal slots first; it broke four tuned behaviors
    (breakfast bias, ±50, meal-sized lunch) and was reverted — **exhaust-then-
    widen is the rule**, and the test asserts the ordering, not exclusivity.
  - **Both questionnaires are boards** (profile + trip kit): `.q-grid` cards
    with chip answers and a live tally, so a 13-question set is two screens
    instead of six. Columns, not tighter type — the four dense redesigns of
    2026-07-24 stand as the warning. The kit screen asks the **trip type
    itself** and reveals dependent blocks live, asks **whether you're flying**,
    and lets a checked answer **name its real product by URL** (reuses
    `/api/scrape`).
  - **Gear says what you're bringing**: every row edits in place (name, product
    URL + Fetch, weight) and blank slots read as blank. A blank slot's name box
    starts empty so Fetch can fill it — the generic name is the placeholder.
    **Optics is its own question** (spotter, tripod, binos, range finder, shared
    by both hunt types); **a pack is one object** (no bag + frame to add up);
    rain gear can be **worn** as well as packed (different rows — worn weight
    isn't pack weight); safety covers **bear spray and a sidearm** (filed under
    First aid & Safety so a backpacking trip, which asks no weapon question,
    can still declare them).
  - **Flying** (`flyIssues`): names what can't fly at all (fuel, bear spray),
    what flies checked (firearms, blades, poles) and what flies in the cabin
    (lithium), on the gear screen and in Readiness. Rules match the item's
    **name**, not its id, so a renamed "MSR IsoPro" is still caught; a
    heuristic by nature, so it warns and never blocks.
  - **Design system** (DESIGN.md "Component contract"): one `.back` control —
    bordered, 44px, top-left, naming its destination — replaces the grey
    `.crumb` everywhere. **Focus is not the action color**: pink at 3px read as
    a form error, so focus owns `--focus`/`--focus-halo` (cool) and errors own
    `--err` + ⚠ + a sentence. Check rows read **count-first, box-last** on
    every screen.
2026-07-27 (later): **Onboarding IS the profile; gear questions moved to the
trip** (commit f8fe2aa, live). Decided in a grilling session with Lawrence.
Key judgment, his: *almost nothing about gear is universal* — what shelter,
water treatment or cook kit goes out depends on the trip. What is universal is
the person: body weight, the brands they reach for (**snack brands too**, not
just dehydrated meals), the kinds of trips they take. So:
  - **First sign-in lands on `#/profile`** with a welcome line and "Skip for
    now"; it is the same screen they return to under their name. One screen,
    one home for preferences, nothing to keep in sync. The three-screen wizard
    (one day old) is deleted; its records migrate to `state.profile`.
  - **Profile holds** weight, meal + snack brands, trip types, default meal
    style. New trips inherit them; **trips already planned keep the weight and
    style they were planned with** — a January weigh-in must not silently
    re-target a planned trip.
  - **The trip's Gear screen asks** instead of showing an empty list. Blocks are
    scoped by the trip's types; each lists the gear you already own in its
    categories (by trip two the questions read "Kifaru SuperTarp", not "Tent")
    and offers generic options only for gear never logged. Once a question
    lists gear you own, nothing rides along uninvited — an unchecked bag stays
    home. One tap takes the **same kit as the last trip, items only, never
    packed marks** (a new trip starts unpacked).
  - **Worn clothing is not pack weight** (Lawrence): `gearStats` splits carried
    from worn; the gear screen reads "x oz on your back · y oz worn".
  - **A trip can be several types at once** (`trip.type` → `trip.types`,
    migrated) — an Alaska hunt that also fishes.
  - **New accounts start with an empty gear library.** GEAR_SEED stays
    Lawrence's Montana list; nobody inherits a stranger's Kifaru.
  - Brands are an explicit table (meal/snack kinds), not id-prefix matching —
    `pro-bolt-chews` and `probar-peanut-butter` are one company.
  188 tests green. QA'd end-to-end at 390px and 1280px against a stubbed
  session (see .scratch/, harness is disposable).
2026-07-27: **Onboarding gear step reworked; sign-out moved to the masthead**
(commits 2db0edc + 57b3e53 + 52c9ff1, live). Lawrence rejected the v1 gear
screen on sight: a pre-checked list of every template row, each labelled
"Item — Category", asks nothing and leaks category vocabulary into item names,
and it offered overlapping slots (water treatment AND water container for one
filter bottle). It now asks plain questions — what you carry it in, how you
sleep out, how you handle water, whether you cook, one block per activity
picked, safety — and builds only the slots the answers imply. **Every question
takes multiple answers (Lawrence, same day): onboarding maps a gear closet, not
a trip** — a tent AND a tarp, a day pack AND a hauler, hot on some trips and
cold on others; per-trip single answers are a different, later question.
Options share a row id only when they name the same object (stakes, optics,
kill kit, utensil), so answering twice never duplicates a slot. Gear category
**'Food kit' → 'Cooking'** (gear seed v3, migrates custom items too): in an app
whose other half plans food, a gear category named for food read as meals.
Sign out was dashboard-only, so every other screen was a dead end — it rides in
the masthead nav now, rendered on every route. 181 tests green. Still awaiting
Lawrence's fresh-account smoke (his server state is wiped, backup in
.scratch/state-backup-lawrence-2026-07-27.json — restore on his word).
2026-07-26 (later): **Onboarding + canonical catalog LIVE** (specs #24/#25,
commits 82ba27e + 119e65d, build 119e65d verified on the alias). First-sign-in
flow (trip types → brands → starter gear blanks) runs only when the server
explicitly answers "no stored state" — Codex P1: a sync error must never look
like a new account. Gear picker gained library edit/delete (fills blank slots
in place). Scrape now consults a shared catalog: URL-normalized key, fresh
hits answer instantly, stale hits revalidate live and fall back to captured
facts on dead pages, only finite positive weights publish, entries never
expire. Codex review: 5 findings, all fixed. 168 tests green. AWAITING
Lawrence's fresh-account onboarding smoke (needs a Google account with no
PackOut state — his own account will never see the flow).
2026-07-26: **Seed v12 — Stowaway Gourmet + Packit Gourmet catalogs** (51
single meals: 19 Stowaway, 32 Packit; bundles skipped per Lawrence). Per-pouch
label values read from nutrition-panel images; sources + exceptions in
reference/stowaway-gourmet-catalog.md and reference/packit-gourmet-catalog.md.
Additive migration (prefix-matched, never resurrects deletions). 140 tests
green; deployed to packout.pages.dev.
2026-07-25 (shipped): **Product URL + scrape-to-prefill live** (issue #23,
commits 974c890→3950260 on main; deploy verified — build stamp 3950260, both
brands, /api/scrape answering). Optional product-URL field on the food form
and gear picker's new-item form; Fetch calls session-gated `POST /api/scrape`
(SSRF-guarded: per-hop redirect validation, host/port blocklist, streamed
1.5MB cap, 8s timeout) which extracts JSON-LD Product/NutritionInformation
with og:title/<title> fallbacks. Prefill fills blank fields only and flags
per-serving nutrition (PackOut kcal is whole-item-as-packed). Structured
data only by design — Amazon and unmarked pages fall back to manual entry.
Reviewed three ways: eng-review (2 fixed), Codex cross-model (10 more fixed:
parser correctness + endpoint hardening), QA at 390/desktop in both brands.
Deferred by decision: DNS-alias SSRF (Workers runtime's job — string checks
can't beat rebinding), per-user rate limits (closed user base), README's
stale "data lives in localStorage" line (predates accounts ship).
2026-07-25 (design): **Field Command background is real topography** (commit
e9610ee, live). Replaced the six parallel waves with a marching-squares
contour field over summed-Gaussian terrain — nesting loops around implied
summits, saddle through the content zone, intermediate/index line weights
(`--topoline` / `--topoline-ix`). Calibrated to the onX branding texture
(subtle, tone-on-tone), not the dense product map. Flag brand untouched.
2026-07-25 (later): **Redesign LIVE on packout.pages.dev** at Lawrence's ask
(commit 9109667 on `redesign/fuel-forecast`, pushed to origin; promoted to the
production deployment via `wrangler pages deploy --branch=main` — deploy.sh
alone produces a preview when run off-main; remember the flag or merge first).
Lower-left brand dock added (One Flag / Field Cmd, persisted; `?brand=` works
for share links). Verified live: build stamp 9109667, gate renders in both
brands, GIS button loads, /api/me 200. Sharing caveat: sign-in required — if
the Google OAuth consent screen is still in Testing mode, friends must be
added as test users or the app published to Production.
2026-07-25: **Fuel Forecast redesign built on branch `redesign/fuel-forecast`**
(now committed and live; main still holds the old design). Both brands live over
one codebase (data-brand tokens; `?brand=command` / dashboard toggle): One Flag
on Snow (default) + Field Command (onX-family, the share-with-onX skin). Unified
A→C surface in the real app: `#/trip/:id` = outlook strip, `/day/:n` = in-place
point-forecast board (morph, focus management, Escape, live region), editor
moved to `/day/:n/edit`. DESIGN.md + PRODUCT.md at root. Independent finish
review ran: 1 gate + 4 P1 + 6 P2 + 4 P3 findings — all P1/P2 and the gate fixed
and re-verified live (focus restore, engine-driven rollup refresh, crumb on
reload, motion grammar, collapsed-band glyphs, dynamic day-count tracks, print
inks, draft-all demotion, copy fixes); remaining P3s: strip-scroll hint at
390px, long-trip-name lockup hardening. Ceiling notes for later: outputs
screens (grocery/pack/ready) still outside the forecast world. 106 engine tests
green throughout. QA'd both brands, desktop + 390. Typeface registry updated
(Familjen Grotesk / Manrope / Chivo Mono). NEXT: Lawrence clicks through both
brands on the branch → design tweaks → /ship-it decision post-Alaska (or behind
a flag).
2026-07-21 (night): Account-required flip shipped — sign-in gate, owner-tagged
device cache (engine resolveSignIn), sign-out flush-then-clear. 106 tests green.
AWAITING Lawrence's real sign-in smoke (his laptop data adopts on first sign-in).
2026-07-21 (evening): Accounts milestone (spec #19, tickets #20+#21) shipped at
844fc6d — Google sign-in (GIS + verified session cookie) with whole-state LWW sync
to KV; local-first, signed-out unchanged. 105 tests green. Live-verified: API
auth walls, GIS button renders, clean console. AWAITING Lawrence's real sign-in
smoke (two devices) — the one path automation can't drive.
2026-07-21 (later): seed v11 — protein snack is the FATTY Original 2 oz stick
(fattysmokedmeats.com, Lawrence's brand; USDA FDC label), replacing v10's same-day
Jack Link's pick (retired by sweep). Additive migration, user libraries untouched;
real-seed weeks meet the raw protein floor. 86 tests green.
2026-07-21: Meal Style (issue #18) shipped at b95dd71 — Mobile/Sit-down dropdowns
per slot at trip setup + edit; 82 tests green; verified live end-to-end (sit-down
lunch drafted starred pouches distinct from dinner, days landed ±50).
2026-07-20 (later): ±50 kcal draft engine + seed v9 wipe + no-store HTML shipped at
943db15 — 75 tests green; verified live: migration wipes a stale pre-v9 state, week
drafts within ±48 of target, dinners rotate the 5 ordered mains. Known gap: no
protein-dense snack in the library, so a day can read Short by a few grams.
2026-07-20: Draft assistant shipped (spec #14) — 63 engine tests green. 2026-07-19: Milestone 1 (food planner) shipped via full /cto pipeline — LIVE at
https://packout.pages.dev. 7 spec tickets + dogfood tickets #9 (branded seed v2 w/
migration) + #10 (cross-trip day import); eng-review + Codex + security findings all
fixed. Milestone 2 (gear + pre-trip Actions + full readiness rollup, #13) shipped same
day — gear library seeded from the Montana sheet (77 items), per-trip kits, import kit
from past trip. 53 engine tests green. Lawrence dogfooding for Alaska 2026-08-01;
Alaska gear adjustments are his content edits in-app.

## Open
- **UI/UX pass (issue #11):** real issues he wants solved — his list, to be captured.
  - Design critique run 2026-07-24 (dual-agent /impeccable): 29/40, 0 P0 / 3 P1 —
    snapshot in `.impeccable/critique/`, PRODUCT.md written at repo root. Top P1s:
    desktop is a stretched phone layout (roster-table fix), day-builder verdict
    scrolls out of view (sticky instrument bar), draft suggestions ignore gap size
    (engine.js:589 `suggestions()` — /cto fix, not design).
  - Redesign exploration same day: four mockups (load-sheet, cartographic,
    expedition dark, field notebook) — **all rejected and erased same day.**
    Lawrence's ruling: too dense/compact; "the current design on dev gives me a
    much cleaner view of all the information." Desktop-first ≠ density — the wide
    canvas buys breathing room for the same information. The shipped card layout
    is the reference; the critique's roster-table P1 is overruled (pinned in
    `.impeccable/critique/ignore.md`; PRODUCT.md corrected). Clarified same day:
    he still wants *completely different* design directions — the ban is density,
    not novelty; usability/navigation-first, and flows must be judged navigable,
    not as stacked static comps.
  - **Redesign round 3 (2026-07-25, converging):** world = "Fuel Forecast"
    (weather-briefing vernacular: PackOut issues your outlook; verdict = the
    outlook language). Structure DECIDED: unified A→C — the 7-day outlook strip
    IS the day nav; clicking a day morphs the columns into a scrubber and
    unfolds the point-forecast board (working prototype:
    `.scratch/comps/unified.html`, brand-switchable; regenerate via scratchpad
    generators if lost). Briefing-board structure (B) killed. Brand narrowed to
    two candidates, decision pending: **5 · One Flag on Snow** (pure white/ink,
    hi-vis pink the only color, verdicts as ✓-stamps; Familjen Grotesk + Chivo
    Mono) vs **7 · Field Command** (onX-Hunt-family: charcoal + tone-on-tone
    contours, orange data numerals, green verdict chips; Manrope + Chivo Mono).
    Killed en route: green-chrome + Bevan briefing (v2/v3), 6-treatment fan
    lanes 1–4 & 6. Design tweaks round next, then committed build.
  - **Two-brand strategy locked (2026-07-25, Lawrence):** BOTH brands ship
    intentionally, kept functionally + design-wise in sync forever — one
    markup/behavior layer, token-only divergence (the unified prototype's CSS
    custom-property architecture is the model). Reason: he wants to share the
    Field Command version with people at onX — so that skin is portfolio-grade
    and must read as a companion to onX Hunt, never a clone (no onX marks or
    naming in UI). Brand commitment recorded in PRODUCT.md.
- **Mobile bottom-of-screen rework (2026-07-27, from Lawrence's screen
  recording):** three fixed layers stacked at the bottom of a phone — the
  sticky question foot, the brand dock, and the browser chrome. The foot
  carried `padding-bottom: 3.8rem` purely to clear the dock, which lifted its
  visible edge up the screen and let the page scroll through the gap beneath
  it: it read as a slab dropped on the content. **The dock was the root cause
  of the hack**, so it is hidden below 700px and the brand choice moved to the
  profile, where a preference belongs (`?brand=` still works for share links,
  and the desktop dock stays for design review). With the dock gone the foot
  docks flush — measured 0px from the viewport edge while scrolling — and the
  page's 4rem tail moved into the form so the bar lands at the bottom instead
  of floating 80px above it.
- **Redirect-mode sign-in (2026-07-27):** GIS runs a popup and calls our JS
  callback — until it can't. In an in-app browser (a link opened from Messages)
  or where third-party storage is restricted it falls back to REDIRECT mode and
  POSTs the credential to the PAGE URL. Nothing was listening, so Pages
  answered 405 with a zero-byte body: a blank page after signing in, and
  "confirm form resubmission" on refresh (Lawrence's first shared user).
  `functions/index.js` claims only `onRequestPost` on `/`, verifies Google's
  double-submit `g_csrf_token` (cookie must equal body), reuses the same token
  verification as the JS path, and answers 303 so the browser reissues a GET.
  Failures land on `/?signin=failed`, where the gate explains and points at
  opening the link in a real browser. **Lesson: the popup path was the only one
  ever tested, because it is the only one a desktop dev browser takes.**
- Google sign-on: shipped (spec #19) + account-required flip; awaiting Lawrence's
  two-device sign-in smoke. Consent screen PUBLISHED to Production 2026-07-25
  (project packout-503121, basic scopes only — no verification needed): any
  Google account can now sign in.
- Onboarding milestone (after sign-in): lightweight brand/food preference setup for
  new users (Lawrence 2026-07-21) — replaces inheriting his pre-starred meals.
  - **pm-lead Stage 0 finding (2026-07-23, escape hatch fired):** the onboarding
    bet has no demand evidence from any non-builder — the only user is Lawrence, who
    is also the builder, and that usage is out of scope per the per-bet rule (a buddy
    is a different population doing a different job than the person who wrote the app).
    There is also no first-run instrumentation, so there is no way to get such
    evidence today. The honest gap is "no evidence it works for someone who isn't
    you," not "onboarding UI is missing." Cheapest next move before building
    onboarding: instrument first-run (which steps a new user completes vs. abandons)
    and get one real buddy through the *current* flow. A nine-stage pipeline run was
    overkill for a solo pre-user bet — the pack's escape hatch is the right call here.
- Library findability: Lawrence "will think on it" (2026-07-19).
- GitHub Action auto-deploy: needs a CLOUDFLARE_API_TOKEN repo secret (issue #3).

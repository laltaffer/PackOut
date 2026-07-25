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
- Verify: `curl` 200 + `<title>` on production URL, then phone smoke at 390px
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
  his "bias breakfast against Peak Refuel toward bars/no-prep"). Snacks: ≤3 bundles,
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

## Status
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

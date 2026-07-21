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

## Deploy Config
- Platform: Cloudflare Pages, project `packout` (account laltaffer@gmail.com)
- Production URL: https://packout.pages.dev
- Deploy: `./deploy.sh` — runs the engine tests first, aborts on red, uploads only app files
- Agent shells must wrap in a pty: `script -q /dev/null ./deploy.sh` (wrangler OAuth refuses non-TTY)
- Auto-deploy: manual per slice for now; GitHub Action (DesignLeaderJobs pattern) deferred
  until a CLOUDFLARE_API_TOKEN repo secret exists — see issue #3
- Verify: `curl` 200 + `<title>` on production URL, then phone smoke at 390px

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
  Library gap: no protein-dense snack (jerky) seeded, so some days run a few g short.
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
- Google sign-on / sharing with friends: Lawrence floated 2026-07-19; recommended as
  post-Alaska milestone (see conversation) — needs his decision.
- Library findability: Lawrence "will think on it" (2026-07-19).
- GitHub Action auto-deploy: needs a CLOUDFLARE_API_TOKEN repo secret (issue #3).

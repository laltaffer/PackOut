---
status: planning
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

## Status
2026-07-19: Milestone 1 (food planner) BUILT, REVIEWED, QA'd, and LIVE at
https://packout.pages.dev. All 7 spec tickets + 2 dogfood tickets (#9 branded seed v2
w/ migration, #10 cross-trip day import) shipped. eng-review + Codex findings all
addressed (47 engine tests green). QA: all flows pass at 390px + desktop, zero console
errors. Pending: Lawrence's SHIP sign-off; Milestone 2 (gear checklist from Montana
sheet, Alaska-adjusted) before 2026-08-01.

## Open
- Google sign-on / sharing with friends: Lawrence floated 2026-07-19; recommended as
  post-Alaska milestone (see conversation) — needs his decision.
- Library findability: Lawrence "will think on it" (2026-07-19).
- Milestone 2: gear checklist + pre-trip Actions, seeded from Montana sheet.
- GitHub Action auto-deploy: needs a CLOUDFLARE_API_TOKEN repo secret (issue #3).

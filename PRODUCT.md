# Product

## Register

product

## Users

Lawrence — solo backcountry hunter (next trip: Alaska, 2026-08-01) — and his hunting
buddies, each with a private Google-backed profile. Two contexts, one tool:

- **Planning (primary):** desktop, at home, weeks before a trip. Building the food
  plan against V2P nutrition targets, drafting days, assembling gear kits. Desktop-first
  is an explicit directive for this project (overrides the global mobile-first rule).
  Desktop-first means the wide canvas buys *clarity and breathing room* for the same
  information — never information density (Lawrence, 2026-07-24: rejected four
  compact/roster redesigns; the shipped card layout is the reference for how
  PackOut information should read).
- **Field (secondary):** a phone at 390px, possibly offline, in daylight glare, cold
  hands. Checking off food and gear, reading the day's plan. Must stay functional and
  legible, never the design driver.

The job: leave for a physically serious hunt neither under-fueled nor over-packed.

## Product Purpose

Replaces spreadsheet food planning. A persistent personal food library (macros +
weight entered once), per-day meal drafting that lands within ±50 kcal of the V2P
target, deterministic gap feedback ("day 3 is short; these items close it"),
grocery list, per-day pack plan, gear kits, and a final readiness verdict.
Success = a trip planned in minutes with numbers Lawrence trusts.

## Brand Personality

Precise, field-confident, utilitarian. An expert's instrument, not a lifestyle
brand — the tone of a topo map or a load sheet: calm, exact, uncluttered. Emotional
goals: trust in the numbers, calm readiness before a serious undertaking.

(The v1 visual identity — "surveyor's flagging tape on a topo map": ink on paper,
Big Shoulders display, hi-vis pink — was declared up for grabs 2026-07-24; the
personality above outlives any particular visual treatment.)

## Anti-references

- **Generic SaaS dashboard:** cream/linear-clone app shell, hero metrics,
  identical card grids.
- **Outdoorsy cliché:** olive drab, camo textures, distressed "rugged" type,
  mountain silhouettes.
- **Consumer fitness tracker:** MyFitnessPal/Strava-style rings, streaks,
  gamified macros.
- **Sparse minimalism:** airy whitespace-heavy layouts that waste the desktop
  canvas this tool needs.
- **Compact density:** roster/spreadsheet layouts that cram all information into
  tight tables. The opposite failure from sparse minimalism, and equally wrong —
  a clean view of all the information beats a compact one (Lawrence, 2026-07-24).

Nuance (Lawrence, 2026-07-24): map/topography textures are welcome when they
genuinely serve the design — this product is about getting outside. The line is
earned cartography (contour data, survey precision, field-document structure)
versus outdoorsy set dressing.

## Brand Commitment (2026-07-25)

PackOut ships with **two first-class brand systems over one codebase**, kept in
functional and design sync permanently — a deliberate two-horse race:

- **One Flag on Snow** — pure white, pure ink, hi-vis surveyor pink as the only
  color (interaction/selection); verdicts as ✓-stamps. Familjen Grotesk + Chivo Mono.
- **Field Command** — the onX-Hunt-family register: charcoal ground with
  tone-on-tone contour linework, orange data numerals and CTAs, verdict green
  held to semantic chips. Manrope + Chivo Mono.

Why: Lawrence intends to share the Field Command version with people at onX.
Consequences: (1) one markup/behavior layer, brands diverge in design tokens
only — a structural change that can't express in both skins is wrong; (2) the
Field Command skin must read as *designed to sit alongside onX Hunt*, never as
an onX product — no onX marks, logos, or naming anywhere in the UI; (3) its
polish bar is portfolio-grade, judged by design peers.

Structure (decided 2026-07-25): the unified A→C surface — the 7-day outlook
strip is the day navigation; opening a day morphs the strip into a scrubber
and unfolds the point-forecast board in place.

## Design Principles

1. **The numbers are the product.** Macro math and verdicts get the visual
   hierarchy; decoration never competes with data.
2. **Desktop plans, phone executes.** The desktop canvas gives every piece of
   information room to breathe — clean, not compact; at 390px the same
   information stays legible one-handed in daylight.
3. **Verdict at a glance.** Fueled / Short / Heavy must read instantly — color
   carries state, never decoration, and never color alone.
4. **Expert instrument, earned familiarity.** Standard affordances, dense tables
   welcome; strangeness only where it buys clarity.
5. **Cartography over cliché.** Outdoor identity through precision — topo,
   survey, field-document structure — not lifestyle imagery.

## Accessibility & Inclusion

WCAG AA baseline: ≥4.5:1 body text contrast, keyboard operability with visible
focus (3px outlines in v1), ≥44px touch targets, verdicts always paired with
text badges (never color-only), `prefers-reduced-motion` alternatives for any
motion, and outdoor high-glare legibility as a project-specific requirement.

# PackOut — Design System (Fuel Forecast, dual-brand)

> Written 2026-07-25 at direction commit, before the first build edit.
> One markup/behavior layer; two first-class brands diverging in tokens only.
> A structural change that cannot express in both brands is wrong by definition.

## World

PackOut speaks the **forecast-briefing vernacular**: it doesn't list your food,
it issues your outlook. Verdicts (Fueled / Short / Heavy) ARE the outlook
language. The trip screen is a 7-day outlook strip; opening a day morphs the
strip into a scrubber and unfolds the point-forecast board in place — one
continuous surface (the "unified A→C" structure, decided 2026-07-25).

## Brands

Brand is set by `data-brand` on `<html>`: `flag` (default) or `command`.
Boot order: `?brand=` query param → `localStorage packout/brand` → `flag`.

### `flag` — One Flag on Snow
Pure white, pure ink, one hi-vis flag. Color logic: **pink is the hunter's
hand** (interaction, selection, CTA — the only brand color); verdicts render as
ink stamps (✓ + text) with color reserved for small semantic marks. Hard 2px
ink borders, zero radius, uppercase display.

### `command` — Field Command
The onX-Hunt-family register, as a companion never a clone (no onX marks or
naming, ever). Charcoal ground with tone-on-tone contour linework, **data
numerals and CTAs burn orange**, verdict green/red/amber held to chips and
marks. 1px hairline panels, 6px radius, sentence-case display.

## Token contract (custom properties on :root[data-brand])

Surfaces: `--bg` `--panel` `--panel-b` (border shorthand) `--panel-line`
`--mast` `--mast-ink` `--mast-rule`. Ink: `--ink` `--head` `--soft` `--line`.
Action: `--act` `--act-deep` `--act-ink` (interactive only — never decoration).
Data: `--data` `--data-face` `--data-w`. Verdict system (each state, never
color-alone): `--v-ok/-short/-heavy` + `--band-ok-bg/-fg`, `--band-short-bg/-fg`,
`--band-heavy-bg/-fg`, `--band-none-bg/-fg`, wash variants `--wash-*`, stamp
glyphs `--stamp-ok` (brand-owned content). Shape: `--r` `--r-btn`. Type: `--ui`
`--wm-track` `--h-case`. Brand texture: `--topoline` (transparent in flag).
Floors: `--text-min: 12px` — no rendered text below it, ever (audit 2026-07-25
finding; the incumbent's signature defect).

## Typography

- `flag`: Familjen Grotesk (UI/headings, uppercase display) + Chivo Mono (all
  data, tabular by nature).
- `command`: Manrope 800/700/500 (UI/headings/large data numerals) + Chivo
  Mono (small data labels).
- Tabular numerals everywhere data columns exist. Body line-height ≥1.45.
  `text-wrap: balance` on h1–h3. Mono microlabels obey `--text-min`.

## Motion grammar

The one orchestrated move is the surface morph: strip→scrubber compresses via
`grid-template-rows 0fr↔1fr` collapses and transform scales (never max-height/
padding/margin transitions — audit finding), 380–460ms `cubic-bezier(0.22,1,0.36,1)`;
the board unfolds the same way with a 180ms stagger. Everything else is
120–250ms state feedback. `prefers-reduced-motion`: instant swaps, same states.

## Interaction & a11y invariants

- Verdict UI is **always computed from the engine** (`dayVerdict`), including
  band text, tick marks, and slot-window labels. No happy-path constants.
- Back from day mode: a real button (crumb) + Escape. Focus moves to the day
  heading on open (tabindex="-1"), returns to the day's tick on close; a
  polite live region announces "Day N — outlook X".
- Selected day carries `aria-current="true"`. Strip is a labeled group.
- Touch targets ≥44px; visible `:focus-visible` (3px `--act` outline) on every
  interactive element; verdicts never color-only (text or ✓/symbol always).

## Print

Outputs (grocery/pack) print ink-on-white regardless of brand; chrome, toggle,
and texture are suppressed in `@media print`.

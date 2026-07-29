## [2026-07-27] shipped | PackOut 17-note feedback round (a8d3e16..e545f28) — live at packout.pages.dev, build e545f28; 243 tests green, 4 Codex review rounds clean; production verified (200, API auth-walled, gate renders both brands at 390px, console clean)
## [2026-07-27] shipped | PackOut shared gear catalog (ed6d58a) — 24 weighed products offered in the gear picker to every user; adoption copies, never pre-fills. Live, build ed6d58a; 248 tests green
## [2026-07-27] shipped | PackOut fetch-weight fix (0728078) — reads spec text, ignores Shopify shipping weight, offers a choice when a page lists several; Pack bag/frame removed from live state; 256 tests green
## [2026-07-27] shipped | PackOut: multiple-weight pages report a message instead of a chip picker (10bf387); 256 tests green
## [2026-07-27] shipped | PackOut Library gains a Gear shelf (5ca1bbd) — gear is browsable, editable and deletable outside a trip; 256 tests green
## [2026-07-27] shipped | PackOut carry modes (22a7635) — gear rides in the pack, on the harness or worn; pack weight excludes harness, total carried includes it. 261 tests green
## [2026-07-27] shipped | PackOut: pounds over 16 oz, generic slots ask to be named, seed v13 adds Chomps (99712f2..ecf0b5b). 264 tests green
## [2026-07-27] shipped | PackOut alignment: masthead lockup on one baseline, macro labels sit on their values (92bffa4). 264 tests green
## [2026-07-27] shipped | PackOut: pre-lookup trips resolve their destination on open, submit waits for it; trip subtitle unified (7f5ab77). 264 tests green
## [2026-07-27] shipped | PackOut: .btn/.btn-quiet centre their labels so anchors match buttons (3f89bab). 264 tests green
## [2026-07-27] shipped | PackOut: button labels centre for anchors as well as buttons; deploy.sh waits for production to serve the new stamp (ca6d40e). 264 tests green
## [2026-07-27] shipped | PackOut: redirect-mode Google sign-in handled at the site root — fixes blank page after sign-in in in-app browsers (2051bcb). 268 tests green
## [2026-07-27] shipped | PackOut mobile: sticky foot docks flush, brand dock hidden below 700px with the choice moved into the profile (a27b074). 268 tests green
## [2026-07-27] refactored | ui.js monolith (2,493 lines) decomposed: foundation modules (state/dom/format/api/brand) + eight js/screens/* modules; ui.js is a 200-line entry (1df5057..9a521d6). deploy.sh stamps every relative import generically — Codex caught bare side-effect imports slipping through unstamped. 268 tests green; live-tested per step against the stub session, both brands, 390 + 1400. NOT deployed — production still a27b074
## [2026-07-28] shipped | Module refactor LIVE at packout.pages.dev (build 66cf535, via ship-it). All 18 modules load once, each stamped; gate + GIS + /api/me verified at 390px, console clean. Deploy Config added to _brain.md

## [2026-07-28] ship | Snacks flattened to one bucket per day
Bundle structure removed; legacy data merges on load; 270 tests green; deployed 323800f, production verified at 390px (both brands, /api/me, console clean).
## [2026-07-28] ship | Google Sheet import (issue #26) — link → libraries + strict day plans, LIVE at build 95bd7df; 306 tests, eng-review + Codex rounds folded in, verified at 390px
## [2026-07-29] ship | URL import carries the brand; failed fetches say which failure — LIVE at build c4a01e6
Brand read from the item (JSON-LD brand/manufacturer incl. ProductGroup, then Shopify vendor anchored to the page's own title), never from og:site_name — REI sells Osprey and REI Co-op from identical URLs. Storefront signage trimmed ("Hoyt- Online Clothing and Gear Store" → Hoyt). Bot walls and dead links no longer file their title as gear; 403/404/5xx/DNS/non-HTML each get their own sentence and next step. 329 tests green; production gate verified at 390px, console clean. FOUND IN PROD VERIFICATION: Shopify-hosted stores block Cloudflare Workers egress — the fetch feature reaches far less of the web from production than from a laptop. Pre-existing (this commit changed no fetch header); needs a decision on the PackOutBot user-agent.

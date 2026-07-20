# PackOut

Backcountry trip planner: trip inputs → nutrition-based food plan (V2P model) →
grocery list, per-day pack plan, and a readiness checklist. Gear planning next.

**Live:** https://packout.pages.dev

- No build step. Run locally: `python3 -m http.server 8321` → http://localhost:8321/
- Tests: `npm test` (engine seam only, `node --test`)
- Data lives in your browser (localStorage); Export/Import JSON from the Trips screen.

# PackOut

Backcountry trip planner: trip inputs → nutrition-based food plan (V2P model) →
grocery list, per-day pack plan, gear kits, and a readiness checklist.

**Live:** https://packout.pages.dev

- No build step. Run locally: `python3 -m http.server 8321` → http://localhost:8321/
  (sign-in and the account API need `npx wrangler pages dev .` instead)
- Tests: `npm test` (engine seam only, `node --test`)
- Sign in with Google — trips live in your profile and follow you across devices;
  localStorage is the per-device cache. Export/Import JSON from the Trips screen
  for file backups.

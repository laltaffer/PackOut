# PackOut — project context
Memory: see _brain.md. Status/decisions live there.
Food-planning source data: reference/v2p-nutrition-sheet-export.md.

## Build / Run / Test
- No build step. Open index.html or `python3 -m http.server` from the repo root (once app code exists).

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (gh CLI); external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five labels, default strings (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: CONTEXT.md + docs/adr/ at repo root. See `docs/agents/domain.md`.

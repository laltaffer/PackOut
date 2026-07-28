#!/usr/bin/env bash
# Deploy PackOut to Cloudflare Pages (https://packout.pages.dev).
# Tests gate the deploy; only the app files are uploaded.
set -euo pipefail
cd "$(dirname "$0")"

node --test test/*.test.mjs

DEPLOY_DIR=.scratch/deploy
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cp index.html _headers "$DEPLOY_DIR/"
cp -R css js "$DEPLOY_DIR/"

# Cache-bust the whole module chain: browsers hold ES modules in memory/disk
# cache hard enough that users see stale code after deploys. Stamping every
# import URL with the commit hash makes each deploy fetch fresh, no build step
# in the repo itself.
V=$(git rev-parse --short HEAD)
sed -i '' \
  -e "s|src=\"js/ui.js\"|src=\"js/ui.js?v=$V\"|" \
  -e "s|href=\"css/app.css\"|href=\"css/app.css?v=$V\"|" \
  "$DEPLOY_DIR/index.html"
sed -i '' \
  -e "s|from './engine.js'|from './engine.js?v=$V'|g" \
  -e "s|from './store.js'|from './store.js?v=$V'|g" \
  -e "s|from './seed.js'|from './seed.js?v=$V'|g" \
  -e "s|from './sync.js'|from './sync.js?v=$V'|g" \
  "$DEPLOY_DIR"/js/*.js

# Name the branch explicitly. Left to infer it, wrangler has silently produced
# a PREVIEW deployment while reporting success — the alias carried the new
# build and packout.pages.dev kept serving the old one (2026-07-27). Cloudflare
# Pages promotes to production only for the project's production branch, so
# saying "main" out loud is the difference between shipped and not.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
npx --yes wrangler@4.112.0 pages deploy "$DEPLOY_DIR" \
  --project-name=packout --branch="$BRANCH" --commit-dirty=true

# Verify what production actually serves, so a preview can never again be
# mistaken for a ship.
echo "--- verifying production serves $V"
for attempt in 1 2 3 4 5; do
  SERVED=$(curl -s "https://packout.pages.dev/?cb=$RANDOM" | grep -oE 'js/ui\.js\?v=[a-f0-9]+' | head -1 | sed 's/.*v=//')
  [ "$SERVED" = "$V" ] && { echo "production serves $SERVED"; exit 0; }
  echo "attempt $attempt: production serves ${SERVED:-nothing}, waiting…"
  sleep 5
done
echo "DEPLOY DID NOT REACH PRODUCTION (still ${SERVED:-unknown}, wanted $V)" >&2
exit 1

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
# Every relative import, whatever the module is called — a new file must not
# need a new sed line here to get cache-busted. Both forms: `from './x.js'`
# and the bare side-effect `import './x.js'` (a module stamped in one place
# and not another would load twice under two URLs).
find "$DEPLOY_DIR/js" -name '*.js' -exec sed -i '' -E \
  -e "s|from '(\.\.?/[^']+\.js)'|from '\1?v=$V'|g" \
  -e "s|^import '(\.\.?/[^']+\.js)'|import '\1?v=$V'|g" {} +

# Say which branch out loud rather than letting wrangler infer it: Pages
# promotes to production only for the project's production branch, and an
# inferred answer is one more thing that can be wrong without saying so.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
npx --yes wrangler@4.112.0 pages deploy "$DEPLOY_DIR" \
  --project-name=packout --branch="$BRANCH" --commit-dirty=true

# "Deployment complete" describes the upload, not the site. The preview alias
# answers immediately; packout.pages.dev trails it by roughly half a minute
# (measured 2026-07-27), which is long enough to check too early, read the old
# build stamp and conclude the deploy failed. So wait for production to say the
# new hash itself — up to two minutes — and fail loudly if it never does.
echo "--- waiting for production to serve $V"
for attempt in $(seq 1 24); do
  SERVED=$(curl -s "https://packout.pages.dev/?cb=$RANDOM" | grep -oE 'js/ui\.js\?v=[a-f0-9]+' | head -1 | sed 's/.*v=//')
  [ "$SERVED" = "$V" ] && { echo "production serves $V after ~$((attempt * 5))s"; exit 0; }
  sleep 5
done
echo "DEPLOY DID NOT REACH PRODUCTION IN 2 MINUTES (serving ${SERVED:-unknown}, wanted $V)" >&2
exit 1

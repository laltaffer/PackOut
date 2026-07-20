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
  "$DEPLOY_DIR"/js/*.js

npx --yes wrangler@4.112.0 pages deploy "$DEPLOY_DIR" --project-name=packout --commit-dirty=true

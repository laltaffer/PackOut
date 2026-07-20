#!/usr/bin/env bash
# Deploy PackOut to Cloudflare Pages (https://packout.pages.dev).
# Tests gate the deploy; only the app files are uploaded.
set -euo pipefail
cd "$(dirname "$0")"

node --test test/*.test.mjs

DEPLOY_DIR=.scratch/deploy
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cp index.html "$DEPLOY_DIR/"
cp -R css js "$DEPLOY_DIR/"

npx --yes wrangler pages deploy "$DEPLOY_DIR" --project-name=packout --commit-dirty=true

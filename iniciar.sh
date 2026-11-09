#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
node scripts/check-node.cjs
if [ ! -d node_modules/express ]; then npm install --omit=dev; fi
npm start

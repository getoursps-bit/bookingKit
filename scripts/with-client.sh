#!/bin/bash
# Runs a command with another client file in place of client.json, then puts
# the committed client back. The brand is fixed when the site is built, so
# this is how the tests are run for a second client.
#   scripts/with-client.sh tests/fixtures/client.sample.json pnpm test
#   scripts/with-client.sh tests/fixtures/client.sample.json pnpm test:e2e
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/with-client.sh <client file> <command...>" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
file="$1"
shift

if ! git diff --quiet -- client.json src/app/brand.css; then
  echo "client.json or src/app/brand.css has changes that are not committed; commit or undo them first." >&2
  exit 1
fi

restore() {
  git checkout -q -- client.json src/app/brand.css
  echo "Put back the committed client.json and brand.css."
}
trap restore EXIT

cp "$file" client.json
./node_modules/.bin/tsx scripts/brand-css.ts
"$@"

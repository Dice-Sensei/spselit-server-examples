#!/usr/bin/env bash
# Smoke test for example 03. Run on the server, from the repo root:  bash tests/03-fallback.sh
set -u
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../examples/03-fallback" || exit 1
SITE=http://localhost:8003

podman compose up -d --build
wait_for "$SITE/front-health" 60
curl -s --max-time 3 "$SITE/" | grep -q 'fb-main' || { echo "FAIL: main site should answer while up"; exit 1; }
echo "ok: main site answers"

podman stop fb-main >/dev/null
for i in $(seq 1 5); do
  body=$(curl -s --max-time 3 "$SITE/")
  echo "$body" | grep -q 'Maintenance' && break
  [ "$i" = 5 ] && { echo "FAIL: spare page should appear within 5 s"; exit 1; }
  sleep 1
done
echo "ok: spare page shown"

podman start fb-main >/dev/null
for i in $(seq 1 15); do
  curl -s --max-time 3 "$SITE/" | grep -q 'fb-main' && { echo "ok: main site is back"; break; }
  [ "$i" = 15 ] && { echo "FAIL: main site did not return within 15 s"; exit 1; }
  sleep 1
done
echo "03-fallback: all checks passed"

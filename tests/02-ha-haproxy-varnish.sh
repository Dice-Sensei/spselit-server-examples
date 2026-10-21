#!/usr/bin/env bash
# Smoke test for example 02. Run on the server, from the repo root:  bash tests/02-ha-haproxy-varnish.sh
set -u
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../examples/02-ha-haproxy-varnish" || exit 1
SITE=http://localhost:8002

podman compose up -d --build
wait_for "$SITE/front-health" 60

# Distinct query strings avoid the cache, so every request really reaches a back server.
servers_seen() { for i in $(seq 1 20); do curl -s --max-time 3 "$SITE/?n=$RANDOM$i"; done | grep -o 'ha2-back-[ab]' | sort -u | tr '\n' ' '; }

[ "$(servers_seen)" = "ha2-back-a ha2-back-b " ] || { echo "FAIL: both servers should answer"; exit 1; }
echo "ok: load is shared"

curl -s -o /dev/null "$SITE/cached"
curl -sI "$SITE/cached" | grep -qi 'X-Cache: HIT' || { echo "FAIL: second request should be a cache HIT (Varnish)"; exit 1; }
echo "ok: cache hit"

podman stop ha2-back-a >/dev/null
sleep 3
[ "$(servers_seen)" = "ha2-back-b " ] || { echo "FAIL: only back-b should answer while a is down"; exit 1; }
echo "ok: failover"

podman start ha2-back-a >/dev/null
for i in $(seq 1 15); do
  [ "$(servers_seen)" = "ha2-back-a ha2-back-b " ] && { echo "ok: restored server rejoined"; break; }
  [ "$i" = 15 ] && { echo "FAIL: back-a did not rejoin within 15 s"; exit 1; }
  sleep 1
done

podman stop ha2-back-a ha2-back-b >/dev/null
sleep 3
code=$(curl -s -o /tmp/ha2-down.html -w '%{http_code}' --max-time 5 "$SITE/?down=$RANDOM")
{ [ "$code" = 502 ] || [ "$code" = 503 ]; } && grep -q 'unavailable' /tmp/ha2-down.html || { echo "FAIL: expected friendly 502/503 page, got $code"; exit 1; }
echo "ok: friendly error when both are down"

podman start ha2-back-a ha2-back-b >/dev/null
echo "02-ha-haproxy-varnish: all checks passed"

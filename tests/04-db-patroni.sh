#!/usr/bin/env bash
# Smoke test for example 04. Run on the server, from the repo root:  bash tests/04-db-patroni.sh
# The first start needs about a minute; the test waits for it.
set -u
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../examples/04-db-patroni" || exit 1
LIVE=http://localhost:9004

podman compose up -d --build
wait_for "$LIVE/api/status" 60

status() { curl -s --max-time 3 "$LIVE/api/status"; }
# Names of nodes whose role is primary (should be exactly one).
leaders() { status | grep -oP '"name":"pat-pg\d"[^}]*"role":"(primary|master)"' | grep -oP 'pat-pg\d'; }
# Run SQL through HAProxy (port 5432 inside the network), from inside any running DB container.
sql() { podman exec -e PGPASSWORD=postgres "$1" psql -h pat-haproxy -U postgres -tAc "$2"; }
wait_leader() { for i in $(seq 1 "$1"); do [ "$(leaders | wc -l)" = 1 ] && return 0; sleep 1; done; echo "FAIL: expected exactly one leader within $1 s"; exit 1; }

wait_leader 120
OLD=$(leaders)
echo "ok: leader is $OLD"
OTHER=$(for n in pat-pg1 pat-pg2 pat-pg3; do [ "$n" != "$OLD" ] && echo $n; done | head -1)

for i in $(seq 1 30); do sql "$OTHER" "create table if not exists t(x int); insert into t values (1);" >/dev/null 2>&1 && break; sleep 2; done
[ "$(sql "$OTHER" "select count(*) from t")" = 1 ] || { echo "FAIL: write through HAProxy should work"; exit 1; }
echo "ok: write through the single address"

podman stop "$OLD" >/dev/null
wait_leader 60
NEW=$(leaders)
[ "$NEW" != "$OLD" ] || { echo "FAIL: leader should change"; exit 1; }
for i in $(seq 1 30); do sql "$NEW" "insert into t values (2)" >/dev/null 2>&1 && break; sleep 2; done
[ "$(sql "$NEW" "select count(*) from t")" = 2 ] || { echo "FAIL: old row must survive and new writes must work"; exit 1; }
echo "ok: failover to $NEW, data intact, writes work"

podman start "$OLD" >/dev/null
for i in $(seq 1 60); do status | grep -q "\"name\":\"$OLD\"[^}]*\"role\":\"replica\"" && break; [ "$i" = 60 ] && { echo "FAIL: old leader should rejoin as replica"; exit 1; }; sleep 1; done
echo "ok: old leader rejoined as replica"

# Losing the referee (etcd): the leader must step down, because nobody can prove it is still the leader.
podman stop pat-etcd >/dev/null
for i in $(seq 1 60); do status | grep -q 'No leader' && break; [ "$i" = 60 ] && { echo "FAIL: live page should say No leader when etcd is gone"; exit 1; }; sleep 1; done
echo "ok: no leader without etcd"
podman start pat-etcd >/dev/null
wait_leader 90
echo "ok: leader elected again after etcd returned"
echo "04-db-patroni: all checks passed"

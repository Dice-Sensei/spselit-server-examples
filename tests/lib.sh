#!/usr/bin/env bash
# Helpers shared by all smoke tests. Source this file: `source tests/lib.sh`.

# assert_http <url> <expected_status> [user:pass]
# Fails the test (exit 1) if the HTTP status is not the expected one.
assert_http() {
  local url="$1" expected="$2" auth="${3:-}" got
  if [ -n "$auth" ]; then
    got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -u "$auth" "$url")
  else
    got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url")
  fi
  if [ "$got" != "$expected" ]; then
    echo "FAIL: $url expected HTTP $expected, got $got" >&2
    exit 1
  fi
  echo "ok: $url -> $got"
}

# wait_for <url> <seconds>: poll until the URL answers 200, or fail.
wait_for() {
  local url="$1" secs="$2" i
  for ((i = 0; i < secs; i++)); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url")" = "200" ] && return 0
    sleep 1
  done
  echo "FAIL: $url not ready after ${secs}s" >&2
  exit 1
}

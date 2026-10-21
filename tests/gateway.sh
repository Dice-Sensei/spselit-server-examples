#!/usr/bin/env bash
# Checks the teacher gateway of a running example.
# Usage: TEACHER_USER=name TEACHER_PASS=secret bash tests/gateway.sh [live-page-base-url]
# Default base URL is the live page of example 01.
source "$(dirname "$0")/lib.sh"
base="${1:-http://localhost:9001}"
: "${TEACHER_USER:?set TEACHER_USER}" "${TEACHER_PASS:?set TEACHER_PASS}"

assert_http "$base/api/status" 200
assert_http "$base/teacher/" 401
assert_http "$base/teacher/" 401 "$TEACHER_USER:wrong-password"
assert_http "$base/teacher/" 200 "$TEACHER_USER:$TEACHER_PASS"

post() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$@" -d '{"name":"not-a-container","action":"stop"}' "$base/api/control"; }
[ "$(post)" = "401" ] || { echo "FAIL: control without login should be 401" >&2; exit 1; }
[ "$(post -u "$TEACHER_USER:wrong")" = "401" ] || { echo "FAIL: control with wrong login should be 401" >&2; exit 1; }
[ "$(post -u "$TEACHER_USER:$TEACHER_PASS")" = "403" ] || { echo "FAIL: unknown container should be 403" >&2; exit 1; }
echo "gateway: all checks passed"

#!/usr/bin/env bash
# Creates (or replaces) the teacher login used by the live pages.
# Usage: bash scripts/make-teacher-password.sh <username>
# The password is typed silently and stored only as a hash in shared/gateway/htpasswd,
# which git ignores.
set -eu
user="${1:?usage: make-teacher-password.sh <username>}"
read -r -s -p "Password for $user: " pass; echo
read -r -s -p "Repeat password: " pass2; echo
[ "$pass" = "$pass2" ] || { echo "Passwords differ." >&2; exit 1; }
[ -n "$pass" ] || { echo "Empty password." >&2; exit 1; }
out="$(dirname "$0")/../shared/gateway/htpasswd"
printf '%s:%s\n' "$user" "$(printf '%s' "$pass" | openssl passwd -apr1 -stdin)" > "$out"
echo "Wrote $out"

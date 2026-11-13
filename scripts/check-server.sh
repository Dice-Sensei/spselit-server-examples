#!/usr/bin/env bash
# Checks that this machine can run the examples. Run it first on the server.
# Exits non-zero and says what is missing if anything is not ready.
set -u
fail=0

need() { # need <description> <command...>
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "ok:      $what"; else echo "MISSING: $what"; fail=1; fi
}

need "podman installed"                    command -v podman
need "podman compose available"            podman compose version
need "podman user socket active"           systemctl --user is-active podman.socket

need "podman socket file exists (live pages need it)" test -S "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock"
need "openssl installed (teacher password script)" command -v openssl
need "teacher login created (scripts/make-teacher-password.sh)" test -s "$(dirname "$0")/../shared/gateway/htpasswd"

command -v podman >/dev/null 2>&1 && echo "podman version: $(podman --version)"
podman compose version 2>/dev/null | head -1

if [ "$fail" -ne 0 ]; then
  echo
  echo "Fix the MISSING items. The socket can be enabled with:"
  echo "  systemctl --user enable --now podman.socket"
  exit 1
fi
echo "Server is ready."

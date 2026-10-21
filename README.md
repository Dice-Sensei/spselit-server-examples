# Server examples

Real-world IT solutions, running on the school server, explained for students of every level.

Each example answers two questions: **why is this needed** (what breaks without it) and **how is it done** (a working setup you can read, line by line).

## How to read an example

Every example has three layers. Stop at the layer that suits you.

1. **Story:** the problem in plain words, and the caption on the live demo page.
2. **Explanation:** the example's `README.md`, with a diagram of how the parts fit together.
3. **Code:** the real config files and `compose.yaml`, commented line by line.

## Examples (round one)

| Example | What it shows | Site / entry port | Live page port |
|---|---|---|---|
| `examples/01-ha-nginx` | A website that survives a server dying (nginx only) | 8001 | 9001 |
| `examples/02-ha-haproxy-varnish` | The same idea, built the way big sites do it (HAProxy + Varnish) | 8002 | 9002 |
| `examples/03-fallback` | A "we're down" page that appears automatically | 8003 | 9003 |
| `examples/04-db-patroni` | A database that elects a new leader when one dies (Patroni) | 5001 | 9004 |

The servers are reachable on the school network only. Students watch the live page; teachers log in to break and restore parts.

## Running an example (teachers)

```bash
bash scripts/check-server.sh            # is podman ready?
cd examples/01-ha-nginx
podman compose up -d
```

Updates reach the server by hand: `git pull` in the folder where this repo is cloned.

## Round two (ideas, not built yet)

Reverse proxy with HTTPS, monitoring and alerting, backups and restore, centralized logging, single sign-on, rate limiting and basic protection, load testing, CI/CD deploy.

## Teacher guide

1. **One-time:** `bash scripts/make-teacher-password.sh <name>` creates the login (stored as a hash in `shared/gateway/htpasswd`, never in git).
2. **Enable the podman socket** (needed for the Stop/Start buttons): `systemctl --user enable --now podman.socket`. `scripts/check-server.sh` tells you if anything is missing.
3. **Demo:** open the example's live page on the projector and `/teacher/` on your own screen, then press **Stop** on a server. Students watch the picture change; the site keeps working.
4. **Reset:** press **Start** on everything that is red. If a start does not help: `podman compose down && podman compose up -d` in the example folder.
5. **Checks after updating:** `bash tests/01-ha-nginx.sh` (and the same for 02, 03, 04). Each prints `all checks passed`.

Students see only the public page, which cannot stop or start anything.

# Server Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the round-one teaching examples (HA website in two versions, website fallback, Patroni database) as `podman compose` setups with live demo pages and teacher break/restore controls.

**Architecture:** One folder per example under `examples/`, each started with `podman compose up -d`. A shared Node status service (no npm dependencies) probes the example's containers, serves a public read-only live page, and offers stop/start of allow-listed containers through the rootless podman socket. A shared nginx gateway puts basic auth in front of the teacher paths only.

**Tech Stack:** podman + `podman compose`, nginx, HAProxy, Varnish, Patroni, etcd, PostgreSQL, Node (built-ins only: `node:http`, `node:test`), bash smoke tests, Mermaid diagrams in Markdown.

**Spec:** `docs/superpowers/specs/2026-10-20-server-examples-design.md`

## Global Constraints

- Runtime is podman, started with `podman compose` (not quadlets, not loose `podman run` scripts).
- Server is Ubuntu 26.04, 30 GB RAM, 8 cores, school network only; verify installed podman and `podman compose` versions on the server before relying on version-specific features.
- Live page and status service are Node; teacher login is basic auth at the proxy.
- The public live view is read-only; break and restore controls exist only behind teacher login.
- READMEs and live page captions are in English.
- Every example has three layers: story (plain words, live page caption), explanation (README with Mermaid diagram), code (configs commented line by line).
- Updates reach the server by manual `git pull`. No automatic deployment.
- Examples are independent; each documents its ports.
- Round-two ideas are out of scope.

## Review Focus

- Both back servers stopped: the front door answers with a friendly error page quickly, not a hang or a raw stack trace (examples 1, 2).
- A restored back server rejoins rotation without restarting the proxy (examples 1, 2).
- A control request naming a container outside the allowlist is rejected, including names with path characters (`../`, `%2f`, spaces) (Task 2).
- A public visitor sending a control request, or reaching teacher paths without credentials, is refused (Task 3).
- Two of three database nodes stopped (quorum lost): the live page shows "no leader" instead of a stale leader (Task 7).
- Podman socket missing or unreadable: the live page still works read-only and controls are reported as unavailable, not as a crash (Task 2).

---

## File Structure

```
README.md                          top-level guide, ports table, deploy-by-git-pull, round-two list
scripts/check-server.sh            verifies podman, podman compose, user socket
scripts/make-teacher-password.sh   writes gateway/htpasswd (git-ignored)
tests/lib.sh                       shared bash helpers (assert_http, wait_for)
shared/backend/                    tiny Node app: reports which back server answered
shared/status-service/             Node: probes, public page, control API
shared/gateway/                    nginx basic-auth gateway config
examples/01-ha-nginx/
examples/02-ha-haproxy-varnish/
examples/03-fallback/
examples/04-db-patroni/
tests/01-ha-nginx.sh ... tests/04-db-patroni.sh
```

Smoke tests (`tests/*.sh`) run on the server; they need podman. Node unit tests run anywhere with Node 22+.

## Port plan (builder may change, must document)

| Example | Site / entry | Live page |
|---|---|---|
| 01-ha-nginx | 8001 | 9001 |
| 02-ha-haproxy-varnish | 8002 | 9002 |
| 03-fallback | 8003 | 9003 |
| 04-db-patroni (HAProxy to leader) | 5001 | 9004 |

---

### Task 1: Repo skeleton, server check, test helpers

**Files:**
- Create: `README.md`, `.gitignore`, `scripts/check-server.sh`, `tests/lib.sh`

**Interfaces:**
- Produces: `tests/lib.sh` exporting `assert_http <url> <expected_status> [user:pass]` (exit non-zero with message on mismatch) and `wait_for <url> <seconds>` (poll until 200 or fail). Every smoke test sources it.

- [ ] **Step 1: Write `scripts/check-server.sh`** that exits non-zero with a clear message unless `podman`, `podman compose` and an active `podman.socket` user unit exist; prints versions found. `.gitignore` lists `shared/gateway/htpasswd`.
- [ ] **Step 2: Run** `bash scripts/check-server.sh` on a machine without podman. Expected: non-zero exit, message names the missing tool.
- [ ] **Step 3: Write `tests/lib.sh`** with the two helpers above; `bash -n tests/lib.sh` passes.
- [ ] **Step 4: Write top-level `README.md`** (story layer): what this repo is, the three layers, ports table, "update with `git pull`", round-two list from the spec.
- [ ] **Step 5: Commit** `chore: repo skeleton, server check, test helpers`

### Task 2: Status service

**Files:**
- Create: `shared/status-service/{package.json,server.js,probe.js,podman.js,public/index.html}`, `shared/status-service/test/{probe.test.js,control.test.js}`, `shared/status-service/Containerfile`

**Interfaces:**
- Config (env): `TARGETS` JSON array `[{"name":"back-a","url":"http://back-a:3000/health"}]`; `CONTROLLABLE` comma list of container names allowed to be stopped/started; `PODMAN_SOCKET` path (default `/run/podman/podman.sock`); `CAPTION` text shown on the page.
- `probe.js`: `probeAll(targets: Target[], timeoutMs: number): Promise<{name:string, up:boolean, ms:number|null}[]>`
- `podman.js`: `controlContainer(name: string, action: 'stop'|'start', allowed: string[], socketPath: string): Promise<{ok:boolean, error?:string}>`; rejects unless `name` is exactly in `allowed`; maps a missing socket to `{ok:false, error:'podman-unavailable'}`.
- HTTP: `GET /api/status` → `{caption, targets:[{name,up,ms}], controlsAvailable:boolean}`; `POST /api/control` body `{name,action}` → 200/400/403/503; `GET /` serves `public/index.html`, which polls `/api/status` every 2 s and shows each target green/red.

- [ ] **Step 1: Write failing tests**
  - `probe.test.js`: a local http server up → `up:true`; a closed port → `up:false, ms:null`; a hanging server → `up:false` within `timeoutMs + 200`.
  - `control.test.js`: `controlContainer('db; rm','stop',['db'],sock)`, `'../x'`, `'db%2f'`, `'db '`, `''` each → `{ok:false}` and no socket connection attempted; allowed name with nonexistent socket → `{ok:false,error:'podman-unavailable'}`; allowed name against a fake unix-socket server → request path is exactly `/v4.0.0/libpod/containers/db/stop` (or `/start`).
- [ ] **Step 2: Run** `node --test shared/status-service/test` → FAIL (modules missing).
- [ ] **Step 3: Implement** `probe.js` (fetch with `AbortSignal.timeout`) and `podman.js` (`node:http` with `socketPath`; strict allowlist equality before any I/O).
- [ ] **Step 4: Implement `server.js`** and `public/index.html` per the HTTP interface; `/api/status.controlsAvailable` is false when the socket is unreachable. Page is plain HTML/JS with comments explaining each part (code layer).
- [ ] **Step 5: Run** `node --test shared/status-service/test` → PASS.
- [ ] **Step 6: Write `Containerfile`** (small Node base image, copy files, `CMD node server.js`).
- [ ] **Step 7: Commit** `feat: shared status service`

### Task 3: Teacher gateway

**Files:**
- Create: `shared/gateway/nginx.conf.template`, `scripts/make-teacher-password.sh`, `tests/gateway.sh`

**Interfaces:**
- Consumes: status service at `status:3000` on the example's compose network.
- Produces: an nginx service (image `nginx:stable`, mounts `shared/gateway/htpasswd`) that proxies `/` and `/api/status` publicly, and requires basic auth for `/api/control` and `/teacher/`. Examples reuse it by referencing this config from their compose file.

- [ ] **Step 1: Write `tests/gateway.sh`** (uses `tests/lib.sh`) against a running example: `GET /api/status` → 200 with no credentials; `POST /api/control` with no credentials → 401; with wrong credentials → 401; with valid credentials and an unknown container name → 403 (from the status service); `GET /teacher/` without credentials → 401.
- [ ] **Step 2: Write the nginx config** with `auth_basic` on the two protected locations, commented line by line; `scripts/make-teacher-password.sh <user>` prompts for a password and writes the htpasswd file (never echoes it, never commits it).
- [ ] **Step 3: Verify** after Task 4 is up: run `bash tests/gateway.sh` → all PASS. (This task is completed together with Task 4's compose file; commit after both pass.)
- [ ] **Step 4: Commit** `feat: teacher basic-auth gateway`

### Task 4: Example 1, HA website with nginx only

**Files:**
- Create: `examples/01-ha-nginx/{compose.yaml,nginx.conf,README.md}`, `shared/backend/{server.js,Containerfile}`, `tests/01-ha-nginx.sh`

**Interfaces:**
- `shared/backend/server.js`: `GET /` returns HTML showing `NAME` env and a request counter; `GET /health` → 200 `ok`. Env: `NAME`, `PORT` (default 3000).
- Compose services: `front` (nginx, caching + `upstream` of `back-a`,`back-b`, published 8001), `back-a`, `back-b`, `status` (TARGETS = both backs, CONTROLLABLE = `back-a,back-b`), `gateway` (live page on 9001).
- Consumes: Task 2 status service, Task 3 gateway.

- [ ] **Step 1: Write `tests/01-ha-nginx.sh`**: bring stack up, `wait_for :8001`; 20 requests show both `back-a` and `back-b` in responses; a repeated request to a cacheable path returns `X-Cache-Status: HIT`; stop `back-a` (via `podman stop`) → 10 requests all 200 and all from `back-b`; start `back-a` → within 15 s responses again include `back-a` with no proxy restart; stop both → response within 5 s with a friendly page and status 502 or 503 (not a timeout).
- [ ] **Step 2: Run** the script → FAIL (stack missing).
- [ ] **Step 3: Implement** compose, `nginx.conf` (passive health via `max_fails`/`fail_timeout`, `proxy_cache`, short `proxy_connect_timeout`, custom error page), backend app, and the README (story → how it works with Mermaid diagram → "try it": exact teacher steps, what students see).
- [ ] **Step 4: Run** `bash tests/01-ha-nginx.sh` and `bash tests/gateway.sh` → PASS.
- [ ] **Step 5: Commit** `feat: example 01 HA website with nginx`

### Task 5: Example 2, HA website with HAProxy and Varnish

**Files:**
- Create: `examples/02-ha-haproxy-varnish/{compose.yaml,haproxy.cfg,default.vcl,README.md}`, `tests/02-ha-haproxy-varnish.sh`

**Interfaces:**
- Consumes: `shared/backend`, Task 2, Task 3. Same service names `back-a`, `back-b`, `status`, `gateway`; entry chain is Varnish (published 8002) → HAProxy → backs. HAProxy active health checks on `/health`.

- [ ] **Step 1: Write `tests/02-ha-haproxy-varnish.sh`** with the same behaviours as Task 4's script (balancing, cache `HIT` via Varnish `X-Cache` header, failover, rejoin, both-down friendly error within 5 s).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** compose, `haproxy.cfg` (health checks, stats page exposed on the live-page network), `default.vcl`, and README. The README ends with a comparison section against example 01 (what each tool does, when you'd pick which), as the spec wants the two versions side by side.
- [ ] **Step 4: Run** the script → PASS.
- [ ] **Step 5: Commit** `feat: example 02 HA website with HAProxy and Varnish`

### Task 6: Example 3, website fallback

**Files:**
- Create: `examples/03-fallback/{compose.yaml,nginx.conf,fallback/index.html,README.md}`, `tests/03-fallback.sh`

**Interfaces:**
- Services: `front` (nginx, published 8003), `main` (the Task 4 backend, `NAME=main`), `fallback` (nginx serving a static "we're down" page), `status` (TARGETS = main, fallback; CONTROLLABLE = `main`), `gateway` (9003).

- [ ] **Step 1: Write `tests/03-fallback.sh`**: with `main` up, `GET :8003` shows main content; stop `main` → within 5 s `GET :8003` returns the fallback page (status 200 or 503, body contains the fallback marker text); start `main` → within 15 s main content returns.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** compose, `nginx.conf` (`proxy_next_upstream` to the fallback upstream marked `backup`), the static page, and README.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: example 03 website fallback`

### Task 7: Example 4, PostgreSQL with Patroni

**Files:**
- Create: `examples/04-db-patroni/{compose.yaml,Containerfile,patroni.yml.template,haproxy.cfg,README.md}`, `tests/04-db-patroni.sh`
- Modify: `shared/status-service/probe.js` is not changed; this example adds a second status source (see Interfaces).

**Interfaces:**
- Services: `etcd` (single node, explained as a simplification in the README), `pg1`,`pg2`,`pg3` (own Containerfile: PostgreSQL + Patroni installed so students can read how), `haproxy` (publishes 5001, routes to whichever node answers Patroni's leader health check on its REST port), `status` (TARGETS = Patroni REST `/` of each node, which returns role and state; CONTROLLABLE = `pg1,pg2,pg3`), `gateway` (9004).
- Status service addition: if a target response is JSON containing `role`, the page shows it (leader/replica) next to the node and replication lag when present. Add a unit test in `probe.test.js` for this before implementing.

- [ ] **Step 1: Write the probe unit test** for role/lag passthrough and run it → FAIL.
- [ ] **Step 2: Write `tests/04-db-patroni.sh`**: stack up, `wait_for` exactly one leader; write a row via `:5001`; stop the leader → within 60 s a new leader exists, the earlier row is still readable via `:5001`, new writes succeed; restart the old leader → it rejoins as replica; stop two of three nodes → within 30 s the status API reports no leader and `:5001` refuses connections.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** the probe change (test passes), compose, Containerfile, Patroni config template, HAProxy config, README with a Mermaid diagram and a plain-words explanation of "split brain" and why a quorum store exists.
- [ ] **Step 5: Run** `node --test shared/status-service/test` and `bash tests/04-db-patroni.sh` → PASS.
- [ ] **Step 6: Commit** `feat: example 04 PostgreSQL with Patroni`

### Task 8: Finish documentation and full run

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`** with the final ports table, a short "how to run any example" block (`cd examples/NN-name && podman compose up -d`), a "teacher guide" section (create password, which buttons break what, how to reset), and links to each example README.
- [ ] **Step 2: Run on the server**, in order: `bash scripts/check-server.sh`, then each `tests/*.sh`. Expected: all PASS. Start all four examples at once and confirm no port clashes.
- [ ] **Step 3: Commit** `docs: top-level guide and teacher guide`

---

## Self-review notes

- Spec coverage: HA nginx (T4), HAProxy+Varnish (T5), comparison (T5 README), fallback (T6), Patroni+etcd+HAProxy over 3 nodes (T7), shared Node status service (T2), basic auth teacher login (T3), read-only public view (T2, T3), README layering and Mermaid (every example task), English and manual `git pull` (T1, T8), round-two list (T1). Safe podman control is the allowlist in T2.
- Names used across tasks: `back-a`, `back-b`, `status`, `gateway`, `controlContainer`, `probeAll`, `TARGETS`, `CONTROLLABLE` are consistent.
- Decisions left to the builder per the spec: exact image versions (check the server first), ports (table above is a default), diagram details.

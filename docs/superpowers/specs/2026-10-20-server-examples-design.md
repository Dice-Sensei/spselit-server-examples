# Server examples for students: design

## Intent and why

A school Linux server (Ubuntu 26.04, 30 GB RAM, 8 cores, reachable on the school network only) is used to show high-school students of all years real-world IT solutions. Each example answers two questions: **why is this needed** (what breaks without it) and **how is it done** (a working setup).

The repo is the teaching material. Any student can open it, see the whole setup, and understand it at their own level. Students cannot access the server directly. They see a live web page. Teachers get extra controls to break things on purpose.

## Audience and layering

Students have mixed experience. Every example is written in three layers:

1. **Story layer (beginners):** the problem in plain words, the idea, and a caption on the live page. No jargon, or jargon explained on first use.
2. **Explanation layer (curious):** a README per example that walks through how it works, step by step, with diagrams.
3. **Code layer (advanced):** the real config files and podman compose files, commented line by line.

## Goals

- Complete, open, explained setup for every example, all in this repo.
- Each example runs with `podman compose` on the school server.
- Each example has a live demo page: what is running, what each part is doing.
- Teachers (logged in) can break and restore parts of the system during a lesson.
- Examples are independent; one can be started without the others.

## Non-goals

- Direct student access to the server.
- Internet-facing deployment (school network only).
- Production hardening beyond what an example teaches.
- Round-two examples (listed below).

## Anti-goals (failure even if it technically works)

- A setup only an expert can follow.
- Hidden magic: any step students cannot find explained in the repo.
- Students able to break the demo from the public page.

## Decisions made together

- Container runtime: **podman**, run with **`podman compose`** (not quadlets, not loose `podman run` scripts).
- Live page and status service: **Node**, one small shared service pattern reused across examples.
- Teacher login: **basic auth** at the reverse proxy.
- Public live view is read-only. Break and restore controls exist only behind teacher login.
- One folder per example; each has its own README, compose file, configs, and live page.

### Round-one examples

1. **Website with high availability (two versions, shown side by side for comparison)**
   - Version A: **nginx only**. It acts as forwarding server, cache, and load balancer in front of two back servers.
   - Version B: **HAProxy + Varnish**. HAProxy balances load, Varnish provides the CDN-style cache, in front of two back servers.
   - Back servers are two identical app containers.
   - Teacher controls: stop and start each back server. Live page shows cache hit rate, requests handled per back server, and server state.
2. **Website fallback**
   - nginx serves a static "we're down" page when the main site is unavailable.
   - Teacher controls: take the main site down and bring it back.
3. **Database with mirroring and failover**
   - **Patroni + etcd** for leader election, **HAProxy** routing to the current leader, **3 PostgreSQL containers**.
   - Teacher controls: stop the leader and watch another node take over.
   - Live page shows which node is leader, replication state, and lag.

### Round two (not designed yet, selected later)

Reverse proxy with HTTPS, monitoring and alerting, backups and restore, centralized logging, single sign-on, rate limiting and basic protection, load testing, CI/CD deploy.

## Constraints

- Server: Ubuntu 26.04, 30 GB RAM, 8 cores, school network only.
- Several examples may run at once; ports must not collide. Each example documents its ports.
- Everything must be reproducible from the repo with documented commands.

## Left to the builder

- Repo layout, naming, and the top-level README that links to all examples.
- Exact image versions, ports, and network layout.
- Whether the Node status service is one shared codebase or copied per example (guess: shared, to keep examples small).
- How teacher controls talk to podman safely (for example a restricted control endpoint) without exposing podman to the public view.
- Diagram format (guess: Mermaid in READMEs so it renders on the git host).
- Podman and `podman compose` versions available on Ubuntu 26.04 must be verified on the server before relying on specific features.

## More decisions

- READMEs and live page captions are in **English**.
- Updates reach the server **manually via `git pull`**; no automatic deployment in round one.
- Where the repo is cloned on the server is left to the builder (document it in the top-level README).

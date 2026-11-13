# Container development environment

Status: configuration prepared; Docker runtime verification is currently blocked
by host socket access. See the verification record below. No application code is
included in this bootstrap.

## Topology and reproducibility

`compose.yaml` defines one non-root `workspace`, used by both VS Code Dev Containers
and the `./dev` shell wrapper. No backend services start. No Docker socket, host
credentials directory, privileged mode or sudo capability is mounted into the
workspace. Host Docker lifecycle commands are deliberately separate from commands
run inside the workspace; container terminals cannot start sibling services.

The tooling image combines these immutable multi-platform image references:

| Component | Pinned source |
| --- | --- |
| Node.js 24 LTS and bundled npm | `node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496` |
| CPython 3.14 and uv | `ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1` |
| OS utilities | Debian Bookworm repositories frozen at `20261112T000000Z` |

Tags describe the sources; digests, not moving tags, select their bytes. Registry
manifests were resolved on 13 November 2026. Exact installed patch versions are
reported by `./dev check` after a successful build. Both base images offer amd64
and arm64; runtime verification here targets the actual amd64 Docker host, not
an untested cross-platform claim. Bookworm sources match the Python and Node bases.
Only image builds install OS tools; nothing is installed on the host.

Use the bundled npm for frontend work and commit its project lockfile with F1;
there is no `package.json` or frontend lock before the application scaffold.
The root `pyproject.toml` is a non-packaged, dependency-free uv workspace, without
placeholder application members. Generate its single `uv.lock` **in the container**
and commit it before the frozen-lock check can pass. Future Python members declare
their own dependencies under that same workspace; no second lock is introduced.
Ruff/MyPy defaults are configured, but their tooling dependencies and real checks
are introduced in B1. Empty application test suites are not represented as passed.

Python 3.14 is within the documented supported ranges for Airflow and PySpark;
this is only a runtime baseline, not proof that future dependency sets resolve.
Python 3.15 was considered at the maintainer's request. Airflow 3.4.0 documents
testing only through 3.14 and provides `constraints-3.14.txt`, while the equivalent
3.15 constraint URL returns 404 (checked 13 November 2026). Use 3.14 rather than
an unsupported Airflow combination. Revisit 3.15 when Airflow supplies support and
the full workspace dependency set passes resolution and integration checks.
This version selection stays within specification §3.3's supported-runtime rule;
it does not change the PRD/specification contract or require a deviation ADR.
At B1/B3 select exact FastAPI/Airflow/PySpark/provider versions, honor Airflow's
tested constraints, and resolve them in the single uv workspace. Add a compatible
Java runtime to the ETL image then (current PySpark requires Java 17 or later).
If dependency sets conflict, document the conflict and propose an ADR before
splitting projects/locks. Neither Java nor Airflow/Spark is required for Phase 1.

Playwright is introduced with F1's pinned frontend dependency/lockfile. Install its
matching browsers and OS dependencies in the development/test image, never on the
host; use matching versions in CI. Until then no browser smoke suite is claimed.
Do not install packages dynamically through `npx latest` or unpinned image features.

## Host access and editor setup

Docker Engine and Compose must already be installed and usable by the SSH user.
On this host they are present, but user `david` currently cannot access the
root-owned, docker-group-writable socket and is not in that group. Noninteractive
sudo also requires authentication. An administrator must arrange approved Docker
access (or an existing approved rootless Docker context); this setup does not
change host groups, socket modes, services or packages. Group/context changes may
require a new SSH login and a restarted editor/agent session. Do not make the
socket world-writable or pass passwords/tokens into repository commands.

The maintainer prefers a solution without adding `david` to the Docker group.
Read-only inspection found the rootless setup tools and subordinate UID/GID ranges
already present, but `newuidmap`/`newgidmap` absent. Docker's documented rootless
route requires the host `uidmap` package, then user-owned daemon setup and selection
of the `rootless` context. No package or host configuration change is authorized
by this note or was performed by the agent. Keep the existing daemon intact;
the setup tool's `--force` option permits coexistence when explicitly requested.
Rootless user namespaces map bind-mount ownership differently: verify/adapt the
current non-root `vscode` user strategy before claiming the workspace is usable
with that daemon. Simply selecting a context does not prove write access.

VS Code Remote SSH and Dev Containers are prerequisites for the graphical flow;
the agent cannot verify clicking **Reopen in Container**. Do not auto-install host
extensions. The CLI flow below exercises the same Dockerfile, Compose service and
verification script without requiring an additional host Dev Containers CLI.

For a host UID/GID other than 1000, `./dev` exports the invoking IDs as build args.
For VS Code startup, set matching `LOCAL_UID` and `LOCAL_GID` in optional `.env`
using `.env.example` as a guide, then rebuild. Dev Containers also updates the
remote user's UID. Keep both aligned to avoid root-owned bind-mount artifacts.
Do not run the wrapper as root. The repo is mounted at `/workspaces/lca-diff`.

## Commands

Run on the Docker host, from any directory using the wrapper's actual path:

```sh
./dev config   # Compose syntax/interpolation validation; does not use daemon
./dev build    # Build toolchain; requires registry/snapshot network access
./dev up       # Build/start workspace, no application server
./dev shell    # Enter non-root development shell
./dev check    # Run checks inside the running container
./dev logs
./dev down     # Remove workspace; retain checkout and image cache
```

Optional host Make aliases: `dev-build`, `dev-up`, `dev-shell`, `dev-check`,
`dev-logs`, `dev-down`. The wrapper invokes only Docker/Compose and basic shell
utilities. It does not resolve/install application dependencies on the host.
All Node, Python, uv, lint, build and browser commands run inside the container.

During initial bootstrap only, create the missing lock from the container shell:

```sh
uv lock
uv sync --frozen
make dev-check
```

Once the lock is committed, both fresh clones and VS Code's post-create command
use `uv lock --check` and `uv sync --frozen`, not an implicit lock update.
When deliberately changing dependencies later, resolve in the container and
review/commit the changed lock. Frozen sync may create `.venv` in the bind-mounted
checkout; it is a container-created ignored artifact, not a host installation.
Keep project installs and commands in containers even if files live in the mount.

The current smoke check verifies non-root identity, Node major/Python minor,
tool versions, JSON/TOML parsing, workspace write/ownership, and frozen lock/sync.
It prints that application tests do not yet exist. Planned `format`, `lint`,
`typecheck`, `test`, `test-unit`, `test-integration`, `test-e2e` and `import` Make
flows will arrive with runnable components, rather than no-op success targets.

For future Vite, bind to `0.0.0.0:5173` inside the container. Compose publishes
only `127.0.0.1:5173` by default; forward it over SSH. `FRONTEND_PORT` may override
the host port. No port is claimed to serve application content during bootstrap.

## Data, credentials and cleanup

`.gitignore` excludes local env/secrets, container dependency/build outputs,
root private data/report/artifact directories and common workbook/archive formats.
`.env.example` contains placeholders only. Keep proprietary inputs outside the
checkout where possible; ignore rules are not a security or licensing guarantee.
The tooling build context is deny-by-default in `.dockerignore` and contains only
its Dockerfile, so history/source/raw data/secrets are not sent to the builder.
Only the workspace mount exposes the checkout to the running container.

Historical folders remain tracked but excluded from routine agent/editor searches.
Do not treat their inclusion in the bind mount as permission to read them.

`./dev down` removes the workspace but not project files. Recreating the container
loses its home caches; committed image/dependency pins rebuild the environment.
No Postgres volumes or application resources are created at this step. Do not run
broad Docker prune/volume-removal commands as part of ordinary cleanup.

## Verification record — 13 November 2026

- Host inspection: Docker client 29.9.3 and Compose v5.7.0 available, linux/amd64.
- `./dev config`: passed (Compose schema/interpolation, no daemon required).
- Registry inspection: both pinned image digests exist and advertise amd64/arm64.
- Docker server/build/start/stop: **BLOCKED**, permission denied on
  `/var/run/docker.sock`; `sudo -n docker version` requires interactive auth.
- Non-root runtime, bind ownership, patch versions, uv lock generation/frozen sync,
  clean-checkout rebuild and restart: **NOT RUN**, depend on Docker access.
- VS Code Remote SSH/Reopen in Container: **NOT RUN**, requires editor interaction.
- Application tests: not applicable; application implementation has not started.

After access is available: build/up, generate/commit the bootstrap lock in the
container, run `./dev check`, down/up/check to verify restart, and repeat against
a clean source checkout to check reproducibility. Replace this blocked record
with exact results. M1 remains blocked until runtime evidence is recorded.

## Primary references

- [uv Docker integration and digest pinning](https://docs.astral.sh/uv/guides/integration/docker/)
- [Node.js release support](https://nodejs.org/en/about/previous-releases)
- [Airflow prerequisites](https://airflow.apache.org/docs/apache-airflow/stable/installation/prerequisites.html)
- [PySpark installation/runtime requirements](https://spark.apache.org/docs/latest/api/python/getting_started/install.html)
- [Dev Container configuration reference](https://containers.dev/implementors/json_reference/)

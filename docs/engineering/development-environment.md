# Container development environment

Status: rootless CLI/runtime verification passed independently for
[M1 issue #2](https://github.com/DavidVFitzGerald/LCA-diff/issues/2). No application
code or host package installation is part of this change. Actual editor attachment
is a separate gate; Compose checks alone cannot prove VS Code reopened successfully.

## Topology and identity

`compose.yaml` defines one workspace shared by the `./dev` wrapper and VS Code Dev
Containers. It requires a **rootless** Docker daemon. The maintainer has configured
that daemon without adding `david` to the host Docker group. Supported launch paths
check the effective daemon's security options, not merely the context name.

The development shell uses namespace UID/GID 0. Under rootless Docker this maps
to the unprivileged daemon owner, enabling normal bind-mount writes with host-user
ownership. The former container `vscode` UID1000 would map to a subordinate host
identity and cannot normally write this checkout. Do not compensate with broad
host permission changes, ACLs, chown to subordinate IDs, or a rootful Docker socket.

All capabilities are dropped and no-new-privileges is enabled. No Docker socket,
privileged mode, sudo service, or host credential directory is mounted. Production
application images must still use unprivileged runtime users; the namespace-root
workspace setting is development-only. See [ADR 0003](../adr/0003-rootless-development-workspace.md)
and current PRD §5/specification §3.1 for the same boundary.

`./dev` checks the rootless daemon before runtime commands; Dev Containers runs the
same host guard through `initializeCommand`. An unavailable or rootful daemon is
rejected before supported launch paths execute bind-mounted development code.
Direct ad hoc Compose/Docker commands bypass project guards and are unsupported.
The in-container smoke check also verifies user mappings, effective capabilities,
no-new-privileges and writable sources. Mapping files may describe an intermediate
namespace; verify them together with daemon status and host ownership of a created
file rather than treating a UID-map line alone as complete host-identity proof.

Supported Bash terminals and noninteractive Bash commands set `umask 022` through
the image's shell configuration; the smoke check also sets it explicitly. The
rootless daemon was observed starting processes with umask 000, so this prevents
world-writable checkout artifacts without changing host daemon settings. Use the
documented Bash workspace terminal rather than raw `docker exec` package commands.

## Reproducible toolchain

| Component | Pinned source |
| --- | --- |
| Node.js 24 LTS and bundled npm | `node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496` |
| CPython 3.14 and uv | `ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1` |
| OS utilities | Debian Bookworm repositories frozen at `20261112T000000Z` |

Tags describe sources; digests select immutable bytes. Both image manifests offer
amd64 and arm64, but verification here targets the actual amd64 host. Image builds
install packages only into image layers. Build logs record exact package versions;
`./dev check` reports actual runtime versions. Updating the pins/snapshot is a
reviewed change, not an implicit moving-tag update.

The root project is a dependency-free, non-packaged uv workspace with no fake app
members. Generate `uv.lock` **inside the container**, commit it, and use
`uv lock --check` / `uv sync --frozen` for subsequent checks. Future Python packages
share that one lock; their dependencies are declared in their member projects.
Ruff/MyPy defaults exist, but real tooling dependencies/checks arrive with B1.
No empty application suite is represented as passed. Use bundled npm and commit
its frontend lock when F1 creates the actual frontend package.

Python 3.14 is the supported runtime baseline. Airflow 3.4.0 documents support
through 3.14 and publishes its constraints; the 3.15 constraints URL returned 404
when checked on 13 November 2026. Revisit 3.15 once Airflow support and full-workspace
resolution/integration checks succeed. At B1/B3 select exact backend/ETL/provider
versions, honoring Airflow constraints, and add the compatible Spark/Java runtime
in its ETL image. A common Python range alone does not prove dependency resolution;
propose an ADR before introducing separate projects/locks if conflicts arise.

F1 introduces pinned Playwright tooling, matching container browsers/OS dependencies
and the frontend package lock. Neither browsers, Java, application packages nor
backend services are needed for this bootstrap. Do not install them on the host.

## Open and use the workspace

On the Docker host, ensure `docker info` reports rootless, then:

```sh
./dev config
./dev build
./dev up
./dev check
./dev shell
```

`config` validates Compose without requiring a daemon. Runtime operations perform
the rootless preflight. `./dev logs` shows workspace logs; `./dev down` removes
this project's container without deleting source files. Do not prune unrelated
containers/images/volumes. `COMPOSE_PROJECT_NAME` and `FRONTEND_PORT` allow isolated
parallel checkouts (see `.env.example`); no host UID/GID build overrides are needed.

If host Make already exists, `make dev-build`, `dev-up`, `dev-shell`, `dev-check`,
`dev-logs` and `dev-down` wrap the same commands. Do not install host Make for these
aliases. Inside the container, `make dev-check` runs the environment smoke check.
All dependency resolution, format/lint/type/build/test commands belong inside the
workspace. No Docker socket is exposed there; lifecycle commands stay on the host.

For VS Code: connect using Remote SSH, open this repository on the Docker host,
and choose **Dev Containers: Reopen in Container**. Required editor extensions are
maintainer-managed; do not auto-install host extensions. The initialization guard
runs on the Docker host, and the post-create command runs the same smoke check in
the container. The `root` prompt is expected for the remapped namespace identity.
Successful attach requires seeing `/workspaces/lca-diff` and running `make dev-check`
in the editor's container terminal, not merely running CLI Compose checks.

The smoke check includes eight retained preflight regression scenarios covering
CLI/editor initialization against rootful, unreachable and rootless responses,
plus refusal of host-root invocations. Mocks run only inside the container; they
do not switch the maintainer's Docker contexts. Run them separately with
`bash .devcontainer/test-preflight.sh` inside the workspace if diagnosing a guard.

The smoke check validates rootless identity evidence, runtime restrictions, pinned
major/minor runtimes, JSON/TOML configuration, file write/ownership, the single
lockfile and frozen sync. It reports no application tests exist. Future `format`,
`lint`, `typecheck`, `test`, `test-unit`, `test-integration`, `test-e2e` and `import`
Make targets arrive with real runnable components, not no-op success placeholders.

Port 5173 is reserved on host loopback, with no application server yet. F1's Vite
server must bind `0.0.0.0:5173` inside the container; use SSH/VS Code forwarding to
reach the host loopback publication. Later Compose profiles introduce backend
services without making them prerequisites for the mock frontend.

## Sources, credentials and cleanup

The checkout is mounted at `/workspaces/lca-diff`. Container-created `.venv` and
future dependency outputs in that bind mount are ignored artifacts, not host
installations. Tools must still run inside containers. Home caches are disposable
when the workspace is recreated.

`.gitignore` excludes local secrets, dependency/build outputs, private data/report
folders and common provider workbook/archive formats. Keep licensed data outside
the checkout where possible. `.env.example` has no secrets. `.dockerignore` denies
the tooling build context except the Dockerfile, excluding source, history, data
and credentials from the builder. Historical documents remain tracked but excluded
from agent context even though the checkout mount makes them accessible.

No application database, volumes, API, Firebase project, Airflow/Spark services,
cloud resources or licensed inputs are created during M1.

## Verification record

Rootless daemon access is confirmed; the prior system-socket denial is resolved
through the maintainer's rootless setup. Engineering verification on the prepared
checkout passed: build/up, interactive shell, container-generated lock/frozen sync,
eight preflight regression scenarios, recreated workspace, and `make dev-check`.
The runtime reports UID/GID 0 mapping to parent 1000, all capabilities dropped and
no-new-privileges; host `uv.lock` is 1000:1000 mode 0644 and `.venv` mode 0755.
Both interactive and noninteractive supported Bash shells report umask 0022.

| Tool | Observed version |
| --- | --- |
| Docker server / Compose | 29.9.3 / v5.7.0 |
| Node.js / npm | v24.22.3 / 11.19.1 |
| CPython / uv | 3.14.2 / 0.9.30 |
| Git / GNU Make / ripgrep | 2.39.5 / 4.3 / 13.0.0 |

Independent QA repeated the checks against candidate
`a9399aab06a21b9c1acd9d99dcaf64c9514741a3` from a clean local clone at
`/tmp/lca-m1-qa-checkout.3vVGMF`, using Compose project `lca-diff-m1-qa` and port
5174. The build reused pinned cached layers; this was not a second uncached
dependency download. No host runtime or secrets were used.

| Check | Independent result |
| --- | --- |
| `./dev config`, `./dev build`, `./dev up` | PASS in isolated clean checkout |
| `./dev shell`, `uv lock --check`, `uv sync --frozen`, `make dev-check` | PASS; eight guard regressions passed |
| Effective namespace/capability settings | UID/GID 0 maps to parent 1000; CapEff 0, NoNewPrivs 1, CapDrop ALL, Privileged false |
| Bind mount and probe | Only checkout mounted; no socket/credential mounts. Container 0:0/mode0644 maps to host 1000:1000/mode0644; host append succeeds |
| Down/up/check | PASS after isolated recreation; frozen sync and all eight regressions pass again |
| Cleanup/source integrity | Only isolated project removed; main workspace left running; reviewed source unchanged |

Engineering logs are in `/tmp/lca-m1/`; independent QA logs are in
`/tmp/lca-m1-qa/`. These are local execution artifacts, not new runtime dependencies.
The committed scripts reproduce the checks. No application tests exist.
Actual VS Code Remote SSH/Reopen remains **BLOCKED** until editor interaction is
verified. Do not declare full M1 completion or close issue #2 based on CLI-only
results. Main approval/merge and F1 readiness remain separate gates.

## Primary references

- [Docker rootless mode](https://docs.docker.com/engine/security/rootless/)
- [uv Docker integration and digest pinning](https://docs.astral.sh/uv/guides/integration/docker/)
- [Airflow prerequisites](https://airflow.apache.org/docs/apache-airflow/stable/installation/prerequisites.html)
- [PySpark runtime requirements](https://spark.apache.org/docs/latest/api/python/getting_started/install.html)
- [Dev Container configuration](https://containers.dev/implementors/json_reference/)

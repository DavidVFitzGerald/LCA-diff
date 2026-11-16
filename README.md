# LCA diff

Read-only comparison of harmonized unit-process inventories and provider-supplied
LCIA scores. The MVP is local-only (accepted ADR 0006). `./dev app-up` (L1, #96)
starts the whole local application with one command. The frontend uses the real
HTTP API, PostgreSQL data and Firebase Auth Emulator (L2, #97).

- [Current product requirements](docs/product/LCA_diff_PRD.md)
- [Current implementation specification](docs/engineering/LCA_diff_Implementation_Specification.md)
- [Roadmap and milestone gates](docs/engineering/roadmap.md)
- [Published frontend issues and dependencies](docs/engineering/frontend-backlog.md)
- [Agent working instructions](AGENTS.md)
- [Architecture decision records](docs/adr/README.md)
- [Development environment details and verification](docs/engineering/development-environment.md)

## Run the local application

Host prerequisites are the same as for the workspace below: a rootless Docker
Engine with Docker Compose, and no `.env` file, private data or host runtimes.
On the Docker host, in the repository checkout:

```sh
./dev app-up      # or: make up
./dev app-smoke   # optional live check, run in a container
./dev app-e2e     # real-stack Chromium acceptance in a pinned browser container
./dev app-down    # or: make down; keeps the data
```

`app-up` builds the images, then starts the stack in order, using healthchecks
and one-shot tasks:

1. PostgreSQL starts.
2. Alembic migrations run as `lca_migrator`.
3. The committed synthetic release is seeded and published through the B4
   `promote`/`publish` commands, as `lca_import`/`lca_publisher`.
4. The Firebase Auth Emulator starts, and the verified demo account is created.
5. The API starts as the read-only `lca_api` role.
6. The frontend starts.

The command returns once every service is healthy and every one-shot task has
exited 0. It then prints the URLs. Airflow and Spark are not started. The first
run builds the ETL tooling image and takes a few minutes; later starts reuse the
image cache.

| Service | URL on the host loopback | Override |
| --- | --- | --- |
| Frontend | http://127.0.0.1:5180 | `LCA_APP_FRONTEND_PORT` |
| API | http://127.0.0.1:8010/api/v1/health and `/api/v1/ready` | `LCA_APP_API_PORT` |
| Auth Emulator | `127.0.0.1:9110` (project `demo-lca`) | `LCA_APP_AUTH_PORT` |

PostgreSQL has no host port. Every port binds to `127.0.0.1` only. Use SSH or VS
Code forwarding to reach them from another machine. The defaults do not overlap
the workspace (5173) or `./dev api-up` (8000, 9099), so both can run at the same
time.

**Demo login (local-only, emulator only):** `demo@example.com` /
`local-demo-password-not-secret`. The account is recreated and verified on every
start, because the emulator keeps no state. These values, and every other password
in `compose.app.yaml`, are development-only. Never reuse them in a production
configuration. The API still refuses emulator settings in production.

The stack builds `VITE_SERVICE_MODE=real`. The browser uses the page origin for
both `/api/` and emulator REST requests, proxied to the private API and emulator.
The canonical URL is `http://127.0.0.1:5180`; `http://localhost:5180` also works.
Firebase sessions are stored per origin, so switching between these spellings
requires a fresh login. Standalone mock mode remains available below.

**Register and verify locally.** Create an account in the login dialog, then
choose **Resend verification email**. The emulator sends no real email. Run
`./dev app-logs auth` on the host and open the printed verification link,
replacing its origin with the frontend URL if needed. Alternatively open
`http://127.0.0.1:5180/emulator/v1/projects/demo-lca/oobCodes`, locate your email,
and use its `oobLink` with the frontend origin. Return to the app and choose
**I've verified my email**. The SDK reloads the account and refreshes its token.
Emulator accounts other than the recreated demo account are lost on restart;
published PostgreSQL data persists.

**Data and reset.** The stack is Compose project `lca-diff-app`, with named
volumes `lca-diff-app_app-db` (database) and `lca-diff-app_app-archive` (B4
promoted archive). `./dev app-down` and `./dev app-up` keep both volumes and the
published release. The seed then reuses its fixed B4 operations and writes nothing
new. `./dev app-reset` refuses to run. `./dev app-reset --yes` deletes only this
stack's two volumes, and the next `./dev app-up` seeds a clean release again. The
test suites' disposable `postgres`/`postgres-target` databases belong to other
Compose projects and cannot reach this stack's data.

`./dev app-status` lists services and exit codes, and `./dev app-logs [service]`
shows recent logs. `LCA_APP_PROJECT` selects a different project name, for an
isolated second copy such as QA. Every `app-*` command refuses a project name
equal to the workspace project (`COMPOSE_PROJECT_NAME` from the environment or
repository `.env`, default `lca-diff-dev`) before invoking Compose.

**Smoke check.** `./dev app-smoke` runs `ops/local/local_stack.py smoke` in the
stack's tools container on its private network. It checks health and readiness.
It checks `GET /api/v1/releases` three ways:

- with no token, it gets 401 `AUTH_REQUIRED`;
- with an unverified emulator user, it gets 403 `EMAIL_NOT_VERIFIED`;
- with the demo user's emulator ID token, it gets the seeded release and active
  revision.

It also checks one exact high-precision flow amount, and that a preflight from a
non-allowlisted origin gets no CORS allow header, while both loopback spellings
are allowed. It prints no tokens.

**Troubleshooting**

- **Port in use:** `app-up` stops before starting anything and names the variable
  to change. For example: `LCA_APP_FRONTEND_PORT=5181 ./dev app-up`. Use the same
  variables for later commands.
- **After changing code or locks:** `app-up` always rebuilds with `--build`. To
  start from a clean data state, run `./dev app-reset --yes` and then
  `./dev app-up`.
- **A one-shot task failed:** `app-up` exits non-zero. Inspect it with
  `./dev app-status` and `./dev app-logs seed` (or `migrate`, `auth-seed`). If the
  database holds a revision or publication pointer that the seed did not create,
  the seed refuses to run (`SEED_UNEXPECTED_REVISION` or
  `SEED_UNEXPECTED_ACTIVE_REVISION`) rather than republishing.

### Synthetic seed

Everything in `data_pipeline/seed/` is invented and BAFU-shaped:

- 25 EcoSpold-like XML processes, of which one multi-output process is excluded;
- a 47-indicator workbook;
- empty rule files;
- a pre-built ready B3 artifact.

The stack therefore needs neither Spark nor provider data. The release
`synthetic-local-2026.1` publishes 24 processes under the `Energy`, `Materials`
and `Transport` categories. It covers several reference units and amounts, a
CO2 flow that is positive, negative, exactly zero and absent across processes,
valid, missing and unresolved-basis IPCC 2021 GWP 100 scores, and
high-precision decimals.

To regenerate the artifact from the committed sources after an intended change,
run the Spark B3 pipeline in an isolated ETL project, whose `postgres` serves as
a disposable import database:

```sh
mkdir -p private/no-input   # the ETL overlay requires an existing read-only input mount
export COMPOSE_PROJECT_NAME=lca-diff-seed FRONTEND_PORT=5195 LCA_PRIVATE_INPUT_DIR="$PWD/private/no-input"
./dev etl-up
./dev etl-run uv sync --frozen --all-packages
./dev etl-run env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres/lca uv run --frozen alembic upgrade head
./dev etl-run uv run --frozen --package lca-etl python -m lca_etl.seed build --root data_pipeline/seed
```

Use a fresh import database for this. A changed source, rule or pipeline
implementation yields a new revision ID. Run `./dev app-reset --yes` before
loading a regenerated seed into an existing stack, because the seed never adds a
second revision. `make backend-test-seed`, inside `./dev publication-run`,
checks these things:

- the sources regenerate byte for byte;
- the artifact is bound to them;
- the load is idempotent;
- the variety above holds;
- exact decimals survive through the API cell endpoints.

### Opt-in private BAFU import

This is optional and never part of `app-up`. It loads the maintainer's private
inputs into the same stack database, with the same B4 semantics:

1. **Import with B3.** Use the existing commands
   ([B3 ingestion](docs/engineering/b3-ingestion.md)) in this checkout. Choose
   their own disposable Compose project as the import database, for example
   `COMPOSE_PROJECT_NAME=lca-diff-bafu`, so test resets cannot touch it. Then
   review the reports. A ready run writes
   `private/imports/<frozen-hash>/artifact/manifest.json`.
2. **Promote and publish into the stack.** Use `./dev app-import`, which runs
   `lca-import` in the stack's ETL tools container. It runs on the stack's own
   network and mounts the stack's archive volume. Your `private/` directory is
   mounted read-only at `/private`; set `LCA_APP_PRIVATE_DIR` to use another
   checkout's directory. This host directory must already exist
   (`create_host_path: false`); otherwise Docker reports
   `invalid mount config for type "bind": bind source path does not exist`.
   Create it before invoking `app-import`. Use the committed target
   [`ops/local/target.json`](ops/local/target.json):
   `{"name": "local-app", "environment": "local", "archive_uri": "file:///var/lib/lca-archive"}`.
   Its credentials come only from the container variables
   `LCA_TARGET_IMPORT_DATABASE_URL` (`lca_import`) and
   `LCA_TARGET_PUBLISH_DATABASE_URL` (`lca_publisher`) for the `db` service. Pick
   one new UUID per action and keep it for retries:

   ```sh
   ./dev app-import promote --target /app/ops/target.json --artifact /private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid> --dry-run
   ./dev app-import promote --target /app/ops/target.json --artifact /private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid>
   ./dev app-import publish --target /app/ops/target.json --release <release-uuid> --revision <revision-uuid> --expected-active none --operation-id <publication-uuid>
   ```

The BAFU release is separate from the synthetic one, so both stay listed. A
`sample_process_limit` manifest yields a representative artifact, which must not
be presented as a full release. Full-corpus validation, LCIA audit sign-off and
licensing remain post-MVP gates (ADR 0006). For later publication, rollback and
failure recovery, see [B4 publication](docs/engineering/b4-publication.md).
Executing this path end to end is L3 (#30) verification.

## Open the development workspace

Host prerequisites: an accessible rootless Docker Engine with Docker Compose, and an
existing VS Code Remote SSH/Dev Containers setup if using the editor workflow.
Install no host runtimes or package managers. Ask before installing a missing
host prerequisite. Docker commands below run on the remote Docker host, inside
the repository checkout.

First confirm `docker context show` selects your intended rootless daemon and
`docker info` reports rootless security. Supported launch paths refuse a rootful
daemon. Do not change socket permissions or add yourself to the Docker group.

```sh
./dev config
./dev up
./dev check
./dev shell
```

`./dev config` checks the workspace Compose configuration without a daemon.
`./dev app-config` checks the separate application configuration, including all
three `LCA_APP_*_PORT` values. These accept decimal integers 1–65535 (leading
zeros are accepted and removed); invalid app ports affect only `app-*` commands.
Process environment values take precedence over literal `.env` values (unquoted,
single-quoted or double-quoted, with optional trailing comments). Port expressions
such as `${PORT}` are rejected; set a literal integer or an explicit process
environment value instead. Configuration is never sourced as shell code.

Or connect through VS Code Remote SSH, open this repository on the Docker host,
and choose **Dev Containers: Reopen in Container**. The post-create check runs
inside the workspace. The development shell uses namespace UID 0, mapped to your
unprivileged host account; all capabilities are dropped. No host UID/GID build
overrides are needed. See ADR 0003 for the rootless-only development boundary.

Inside the container, run all development tools, package installs and checks.
The following commands run inside `./dev shell` (or the editor's container terminal):

For Python/backend work, first install every workspace member from the single
committed lock (also required after Dev Containers' post-create smoke check):

```sh
uv sync --frozen --all-packages
make backend-format-check backend-lint backend-typecheck backend-test-unit
```

`./dev up` starts the workspace without installing project packages. `./dev check`
and the editor post-create check verify the tooling, but their default sync does
not select every Python workspace member. Run the explicit frozen sync above
before backend checks; it needs no database, emulator or private inputs.

For standalone frontend work:

```sh
npm --prefix apps/frontend ci
VITE_SERVICE_MODE=mock npm --prefix apps/frontend run dev
```

Vite listens on `0.0.0.0:5173` inside the container, published on host loopback.
Use VS Code/SSH forwarding to reach http://localhost:5173. The page is a technical
mount target identifying local demo mode and the placeholder authentication state.
The placeholder resolves to unauthenticated and makes no protected dataset reads.
Product login/account journeys follow in F2. Missing, invalid or unsupported
service modes (including `real` until L2, formerly I1) show a safe startup error; there is no
implicit mock fallback. A mock bundle also requires explicitly setting
`VITE_SERVICE_MODE=mock` when running the build command below.

For reproducible, noninteractive checks inside the container:

```sh
npm --prefix apps/frontend run format:check
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run typecheck
npm --prefix apps/frontend run test:unit
npm --prefix apps/frontend run build
npm --prefix apps/frontend run test:e2e
```

`make format` rewrites formatting; `make lint`, `make typecheck`, `make test-unit`
(`make test`) and `make frontend-build` wrap the corresponding frontend commands.
These targets refuse host execution. Dependencies and `dist/` are ignored
container-created artifacts; the committed lockfile pins installation. Frontend
CI runs the same locked install and checks in the digest-pinned Node container.
The smoke command starts a temporary production preview, builds with explicit
mock mode, and runs named Chromium and Firefox projects without an API. The
development image installs matching browsers/OS dependencies from the frozen
frontend lock; rebuild with `./dev build` then `./dev up` when this lock changes.
Browser binaries remain inside the image at `/ms-playwright`. Do not install
browsers or their OS dependencies on the host. To run one project inside the
container, append `-- --project=chromium` or `-- --project=firefox` to `test:e2e`.
`make test-e2e` is the equivalent guarded container target.

PRs and the manual Frontend workflow run the available full frontend suite,
currently the unit/contract checks plus this foundation smoke. Product auth,
selection/grid/score journeys arrive in F2–F5; real integration remains Phase 2.
See [F1 verification](docs/engineering/f1-verification.md) for exact versions,
coverage, commands and remaining gates.

To stop and remove the workspace container, run `./dev down` on the Docker host.
The source checkout is retained. Container-home caches are disposable. If Make
already exists on the host, `make dev-up`, `make dev-shell`, `make dev-check` and
`make dev-down` provide equivalent commands. Do not install host Make just for
these aliases. `make dev-check` verifies the environment; frontend checks above
verify the application scaffold. Lifecycle commands belong on the Docker host.

## Delivery boundaries

The workspace (`./dev up`) and the mock-only frontend flow above need no API,
database, Firebase, Airflow, Spark, cloud resources or licensed files. The local
application stack (`./dev app-up`) is separate. It uses its own Compose project
and volumes, and it starts PostgreSQL, the Auth Emulator and the API, but not
Airflow or Spark. Backend, ETL and publication checks run in their own containers
(see the development environment guide). `dev-check` verifies the environment;
it is not an application test suite. No cloud deployment is part of the MVP
(ADR 0006).

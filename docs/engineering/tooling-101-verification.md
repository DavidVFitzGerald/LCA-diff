# Workspace tooling hardening (#101)

Engineering evidence, 16 November 2026. Independent QA and hosted CI results,
with the final delivered SHA, belong in the issue/PR handoff. No product,
scientific or API contract changes; no ADR or new CI job is needed.

## Scope

- Document the explicit frozen `--all-packages` sync before backend work.
- Use the active uv interpreter for real Spark workers, retaining the existing
  image and default environment. The existing golden Spark integration test now
  supplies a nonexistent inherited worker path as a regression control.
- State the existing API/schema, publication and seed test host allowlists,
  including their required database name `lca`; do not change the guards.
- Check all three app ports only for `app-*`, including decimal bounds,
  leading zeros, literal dotenv values and environment precedence. Preserve L2's
  project collision guard. `config` checks the workspace; explicit `app-config`
  checks the application. Both configuration commands remain daemon-free.
- Correct only the stale L2 merge-status lines in the roadmap/environment guide;
  L3 remains unstarted.

## Environment and isolation

Rootless Docker 29.9.3 / Compose v5.7.0; pinned workspace Node 24.22.3, Python
3.14.2, uv 0.9.30. All dependency installation, formatting, linting, type checks
and tests ran inside containers. No host runtime or dependency was installed.

Implementation checkout:
`/home/david/projects/LCA-diff-AI-dev-project/.task-worktrees/tooling-101`.
Workspace/publication project `lca-diff-101-eng`, frontend workspace port 5271;
app project `lca-diff-101-eng-app`, ports 5272/8011/9272. The input mount was the
existing empty `private/empty-input` created inside the workspace container.
The tests used only synthetic fixtures and these projects' disposable databases.
The existing `lca-diff-l2-app` and main workspace were left running and untouched.

## Fresh-clone backend checks (AC1)

A real local clone at
`/home/david/projects/LCA-diff-AI-dev-project/.task-worktrees/tooling-101-fresh` started at
implementation commit `f1ee715`, with neither `.venv` nor `.env`. It used project
`lca-diff-101-fresh` and workspace port 5273. Following the documented steps:

```sh
# Host, in the fresh clone:
export COMPOSE_PROJECT_NAME=lca-diff-101-fresh FRONTEND_PORT=5273
./dev config
./dev up
./dev shell
# In the resulting interactive container shell:
uv sync --frozen --all-packages
make backend-format-check backend-lint backend-typecheck backend-test-unit
```

All exited 0: format/lint passed; MyPy reported no issues in 47 source files;
15 unit tests passed. The default `.venv` was created only inside the container
bind mount. The same four checks passed again in the implementation workspace
with the final regression changes. No database or private input was needed for
these four checks.

## Actual ETL and seed matrix (AC2)

Host setup in the implementation checkout:

```sh
export COMPOSE_PROJECT_NAME=lca-diff-101-eng FRONTEND_PORT=5271
export LCA_PRIVATE_INPUT_DIR="$PWD/private/empty-input"
./dev publication-up
./dev publication-run bash -c 'uv sync --frozen --all-packages && env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres/lca uv run --frozen alembic upgrade head'
./dev publication-run env UV_PROJECT_ENVIRONMENT=/var/tmp/lca-venv bash -c 'uv sync --frozen --all-packages'
./dev publication-run bash -c 'make backend-test-etl backend-test-seed && env UV_PROJECT_ENVIRONMENT=/var/tmp/lca-venv make backend-test-etl backend-test-seed'
```

Both environments passed the real golden Spark/PostgreSQL ETL test (1 test) and
all 6 seed tests. The retained golden test's nonexistent `PYSPARK_PYTHON` ensures
that an installed default `.venv` cannot mask incorrect override behavior.

A separate real-worker probe wrapped `SparkSession.Builder.getOrCreate`, read
`sys.executable` from a Spark `parallelize(...).map(...).collect()` worker and
then executed extraction of committed synthetic `001.xml`. With inherited
`PYSPARK_PYTHON=/does-not-exist/lca-101-python`, the pre-fix extraction source
failed to launch a worker. The changed source succeeded and reported:

| Active environment | Driver and actual worker interpreter |
| --- | --- |
| Default | `/workspaces/LCA-diff-AI-dev-project/.venv/bin/python3` |
| Override | `/var/tmp/lca-venv/bin/python3` |

The probe was run independently in both environments. Its temporary source and
logs are local execution artifacts; the permanent regression is in the existing
`test_golden_spark_postgres_and_failed_audit` test.

## Guards, ports and unchanged contracts (AC3–AC5)

`uv run --frozen python ops/local/test_project_guard.py` passed in the workspace.
The existing backend CI step runs this same script. Coverage includes every app
command (including `app-config`), all three port variables, invalid and empty
values, 1/65535 endpoints, 100-digit inputs, long leading-zero inputs, quoted and
commented literal `.env` values (also `"8011"#local`), invalid dotenv values,
environment precedence and non-app `shell`/`up`/`config`/`help` isolation. Existing
project collision cases still pass; no test invokes the real Docker daemon.

Actual host invocations also passed:

| Invocation | Result |
| --- | --- |
| `LCA_APP_API_PORT=abc ./dev shell` in `lca-diff-101-eng` | Interactive shell opened and exited 0 |
| `LCA_APP_API_PORT=70000 ./dev up` in that workspace | Exit 0 |
| `LCA_APP_API_PORT=abc ./dev config` | Exit 0 |
| `LCA_APP_API_PORT=abc ./dev app-up` and value `0` | Exit 2; names `LCA_APP_API_PORT` and range 1–65535 |
| `LCA_APP_API_PORT=65536 ./dev app-status` | Same rejection; app container IDs unchanged across the negative checks |
| `./dev app-up` in the isolated app project, API port 8011 | Exit 0; all services healthy |
| `./dev app-smoke` in that project | Exit 0; real auth, seeded revision, precision and both loopback origins pass |
| `config` with invalid app port and a nonexistent `DOCKER_HOST` socket; `app-config` with that socket and valid ports | Both exit 0 without a daemon |

The documented host/database allowlists were compared with each suite's source.
`uv.lock`, API code, Compose definitions, runtime Dockerfiles and workflow files
are unchanged. No new CI job was added.

Local logs: `/tmp/lca-101-*` on the host; fresh-clone quality output is also in
`/tmp/lca-101-fresh-backend.log` inside its workspace container. These are
engineering checks, not a claim of independent QA or hosted success.

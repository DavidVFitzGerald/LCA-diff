# LCA diff

LCA diff helps Life Cycle Assessment (LCA) practitioners choose unit-process datasets for their models by comparing flows and Life Cycle Impact Assessment (LCIA) scores side by side. It makes shared flows, missing values and exact differences visible without recalculating impacts or normalizing the selected processes.

## Table of contents

- [Purpose](#purpose)
- [Demo](#demo)
- [Guide for reviewers](#guide-for-reviewers)
- [Quickstart](#quickstart)
  - [Run with demo data](#run-with-demo-data)
  - [Use the whole BAFU database [UNTESTED]](#use-the-whole-bafu-database-untested)
  - [Configuration and troubleshooting](#configuration-and-troubleshooting)
- [How this project was built](#how-this-project-was-built)
- [Architecture](#architecture)
- [Testing and evaluation](#testing-and-evaluation)
  - [Unit and backend integration checks](#unit-and-backend-integration-checks)
- [Local development](#local-development)
- [CI and logs](#ci-and-logs)
  - [Continuous integration](#continuous-integration)
  - [Logs and operational metrics](#logs-and-operational-metrics)
- [Project structure](#project-structure)
- [Limitations and next steps](#limitations-and-next-steps)
- [References](#references)

## Purpose

An LCA practitioner needs to choose which process best represents a material, energy supply or transport service. Similar process names can conceal different geographies, reference quantities, flows and impact indicators. Finding a dataset in a catalog or inspecting separate XML files and score spreadsheets does not, by itself, provide an aligned comparison of those differences.

LCA diff makes it easier for practitioners to see how flows and scores differ between processes. Users can search for processes, select several at once and compare them side by side. The app shows which flows are shared or unique, whether values are positive, negative, zero or missing, and where scores are unavailable. Users can show only differences, while warnings highlight different reference quantities. The app compares published data; it does not calculate new LCA results.

## Demo

![LCA diff comparing three synthetic processes, with flow bars, missing cells and a reference-unit warning](docs/images/lca-diff-demo.png)

The screenshot shows the running local application using invented demo data, served through the real API and PostgreSQL. There is no public hosted instance. Follow the [Quickstart](#quickstart) to try Flows, Scores, search, bulk selection, column reordering and the independent **Show differences only** switches.

This project was created for submission as the final project for the [AI Dev Tools Zoomcamp](https://github.com/DataTalksClub/ai-dev-tools-zoomcamp) course by DataTalks.Club.

## Guide for reviewers

The submitted MVP is local-only. Cloud deployment and continuous delivery, full-database release validation, browser workspace restoration, a complete accessibility audit, a telemetry dashboard, user-impact alerts and an on-call repair agent are excluded from this submission. The default run needs no licensed data or cloud credentials; the real-data import is optional.

The following self-evaluation uses the course's 24-point rubric. Scores describe the submitted artifacts, not planned features.

| Criterion                | Claimed score | How to verify                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem Description      |           2/2 | The opening description and [Purpose](#purpose) explain the user, difficulty and expected functionality.                                                                                                                                                                                                                                                                                                        |
| Product Specification    |           2/2 | Read the [PRD](docs/product/LCA_diff_PRD.md) and [implementation specification](docs/engineering/LCA_diff_Implementation_Specification.md). The [public task tracker](https://github.com/DavidVFitzGerald/LCA-diff/issues) contains acceptance criteria; as example, see [#30](https://github.com/DavidVFitzGerald/LCA-diff/issues/30), which records agent readiness, engineering and independent QA handoffs. |
| Agent Team Specification |           2/2 | [AGENTS.md](AGENTS.md), the [role documents](docs/team/) and [How this project was built](#how-this-project-was-built) define responsibilities and the work/review loop.                                                                                                                                                                                                                                        |
| Context Management       |           2/2 | [AGENTS.md](AGENTS.md) points to modular product, engineering, team and ADR documents, with precedence and context boundaries.                                                                                                                                                                                                                                                                                  |
| Application              |           2/2 | Run `./dev app-up`, sign in and compare processes. The browser uses the real HTTP/Firebase adapters and PostgreSQL; stop/start preserves published data. See [local acceptance evidence](docs/engineering/local-mvp-verification.md).                                                                                                                                                                           |
| Testing                  |           2/2 | Unit, PostgreSQL/API integration, ETL and browser suites exist. [Testing and evaluation](#testing-and-evaluation) gives setup and a single command for unit plus backend integration checks; CI records passing runs.                                                                                                                                                                                           |
| Containerization         |           2/2 | [compose.app.yaml](compose.app.yaml) runs the frontend, API, database, emulator and initialization jobs through `./dev app-up`.                                                                                                                                                                                                                                                                                 |
| Deployment               |           0/2 | The criterion requires public deployment. The application runs locally; no public URL or hosted deployment is provided.                                                                                                                                                                                                                                                                                         |
| CI/CD                    |           1/3 | [GitHub Actions](https://github.com/DavidVFitzGerald/LCA-diff/actions) runs tests on pull requests and pushes to `main`. There is no automatic deployment or production deployment workflow.                                                                                                                                                                                                                    |
| Observability            |           1/2 | The [API middleware](apps/api/src/lca_api/app.py) emits structured request logs and basic counters. See [Logs and operational metrics](#logs-and-operational-metrics). Distributed traces and a telemetry storage/dashboard stack are absent.                                                                                                                                                                   |
| Alerting on User Impact  |           0/1 | No user-impact alert rules or notification integration are implemented. Container healthchecks are not claimed as alerts.                                                                                                                                                                                                                                                                                       |
| On-Call Agent            |           0/2 | No agent is triggered by an operational alert to repair the app.                                                                                                                                                                                                                                                                                                                                                |
| **Total**                |     **16/24** | **Pass threshold: 10 points.**                                                                                                                                                                                                                                                                                                                                                                                  |

## Quickstart

### Run with demo data

Prerequisites: Git and a running Docker Engine with Docker Compose and **Linux containers**. The application supports standard Docker Desktop on Windows 11; **a rootless Docker context is not required to run the application**. In Docker Desktop, switch to Linux containers if Windows-container mode is selected. Use PowerShell for the Compose commands below, or Bash (Linux, WSL or Git Bash) for the optional `./dev` wrapper. Internet access is needed for the first image/dependency build. No host Python, Node.js, package manager, database, Firebase project, `.env` file or private dataset is required.

The maintainer confirmed Windows startup and login after the original workarounds; automated checks of the final fixes run on Linux. See [portability verification](docs/engineering/app-portability-verification.md) for the exact evidence and platform boundaries.

```sh
git clone https://github.com/DavidVFitzGerald/LCA-diff.git
cd LCA-diff
docker compose -p lca-diff-app -f compose.app.yaml up --detach --build --wait
```

**The Compose command above builds and starts the complete local application in one command.** In Bash, `./dev app-up` does the same with project/port checks; `make up` is an alias if Make is already available. Neither app startup path requires rootless Docker. Dependencies install inside pinned container images. The migration service builds the shared tools image once; the other initialization tasks reuse it. Startup waits for PostgreSQL, migrations, synthetic data publication, emulator account creation, API and frontend health. Airflow and Spark do not run during demo startup. The first build can take several minutes.

Open **http://127.0.0.1:5180** and sign in:

| Setting                | Local demo value                                                         |
| ---------------------- | ------------------------------------------------------------------------ |
| Email                  | `demo@example.com`                                                       |
| Password               | `local-demo-password-not-secret`                                         |
| API health/readiness   | http://127.0.0.1:8010/api/v1/health · http://127.0.0.1:8010/api/v1/ready |
| Firebase Auth Emulator | `127.0.0.1:9110`, project `demo-lca`                                     |

Search for `steel` and choose **Select all matches**. Add `photovoltaic, rooftop` to compare its flows with the two steel processes. Switch to **Scores**, select indicators and try **Show differences only**. Selected columns can be reordered with pointer or keyboard controls. Warnings explain different reference quantities; values are not normalized between columns.

For PowerShell (and any terminal with Docker Compose), use:

```sh
docker compose -p lca-diff-app -f compose.app.yaml --profile smoke run --rm --no-deps smoke
docker compose -p lca-diff-app -f compose.app.yaml ps --all
docker compose -p lca-diff-app -f compose.app.yaml down
docker compose -p lca-diff-app -f compose.app.yaml up --detach --build --wait
```

`down` keeps the published database and archive volumes. In Bash, the equivalent convenience commands are:

```sh
./dev app-smoke   # live API/auth/precision checks
./dev app-e2e     # real-stack Chromium browser acceptance
./dev app-status  # service health and initialization exit codes
./dev app-down    # stop the application; keep published data
./dev app-up      # restart using the existing data
```

All published ports bind to host loopback; PostgreSQL has no host port. For a remote Docker host, forward port 5180 through SSH or VS Code. The frontend proxies API and emulator requests, so forwarding that port is sufficient for normal browser use.

To view logs in PowerShell, run `docker compose -p lca-diff-app -f compose.app.yaml logs --tail 200 api` (replace `api` with another service name as needed).

The verified demo account is recreated on every start. To test registration, create an account in the app, request a verification email and obtain its link with `./dev app-logs auth` or from `http://127.0.0.1:5180/emulator/v1/projects/demo-lca/oobCodes`. Use the frontend origin for the verification link, then choose **I've verified my email**. Emulator accounts are temporary; published PostgreSQL data persists. All committed passwords are local-only emulator/database values.

### Use the whole BAFU database [UNTESTED]

The application also supports an opt-in import of **BAFU:2026** [1](#references). Download the process XMLs and corrected Excel LCIA scores from [openLCA Nexus](https://nexus.openlca.org/database/BAFU). They are external inputs and are not distributed in this repository. The [ecoSpold1 schema description files can be downloaded from ecoinvent](https://support.ecoinvent.org/data-formats-overview-2); these are useful for interpreting the source format and are required by the alternative three-archive intake example.

**Verification boundary:** the MVP was exercised with a representative private import, not a validated import of the complete database. The following uses the implemented full-input path; it is not evidence of full-corpus completeness, audit sign-off or redistribution permission. Only publish a candidate after reviewing its reports. Unverified score conversions remain `N/A`, and multi-output processes are excluded.

**The source-import workflow below uses the rootless development/ETL workspace**, which has different writable-source permissions from the portable app runtime. It is verified on the Linux development laptop, not as a native Windows ETL setup. Docker Desktop is sufficient for the demo and for serving an already-published database.

1. Extract the downloaded XMLs and corrected workbook into the following ignored layout. XML files may be in subdirectories. Keep provider inputs and generated audit rows private.

   ```text
   data/private/bafu-2026-v1/incoming/
     xml/                         # all process XML files
     scores/
       BAFU-2026 v1 LCIA Results_corrected.xlsx
   private/
     bafu-full.json               # private manifest created below
   ```

2. Create `private/bafu-full.json` with the content below. Paths are container paths, not host paths. Adjust the workbook filename and sheet to the downloaded release if necessary. There is intentionally **no `sample_process_limit`**; the committed [representative manifest](data_pipeline/examples/bafu-private-representative.json) instead limits the workload to five XML processes. Do not infer a publication date from a workbook correction note.

   ```json
   {
     "format_version": 1,
     "release": {
       "database_code": "BAFU",
       "release_version": "2026 v1",
       "display_name": "BAFU:2026 v1",
       "published_date": null,
       "license_policy": "all_verified_users"
     },
     "sources": {
       "process_xml_directory": "/inputs/xml",
       "lcia_workbook": "/inputs/scores/BAFU-2026 v1 LCIA Results_corrected.xlsx",
       "lcia_sheet": "BAFU_2026 v1"
     },
     "work_directory": "/workspaces/lca-diff/private/imports",
     "validation_rules": "/workspaces/lca-diff/data_pipeline/rules/bafu_2026_v1.json",
     "score_basis_rules": "/workspaces/lca-diff/data_pipeline/rules/bafu_2026_score_basis.json"
   }
   ```

3. Start a separate import project, install the frozen Python workspace inside its ETL container and migrate its database. Use this database only for import work, not destructive test suites.

   ```sh
   export COMPOSE_PROJECT_NAME=lca-diff-bafu
   export FRONTEND_PORT=5191 AIRFLOW_PORT=8091
   export LCA_PRIVATE_INPUT_DIR="$PWD/data/private/bafu-2026-v1/incoming"
   ./dev etl-up
   ./dev etl-run uv sync --frozen --all-packages
   ./dev etl-run env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres/lca uv run --frozen alembic upgrade head
   ./dev airflow-up
   ./dev etl-run uv run --frozen --package lca-etl python scripts/wait_etl_services.py
   ./dev etl-run uv run --frozen --package lca-etl lca-import run --manifest private/bafu-full.json --wait --timeout 3600
   ```

   The readiness check waits for DAG registration before import. The import command then triggers and waits for the Airflow DAG, which runs the Spark-backed pipeline. The one-hour CLI wait can be increased for a large import; a timeout leaves the DAG active, and repeating the same command checks the same deterministic run. The alternative focused execution is `./dev etl-run uv run --frozen --package lca-etl lca-import run-local --manifest private/bafu-full.json`. Reports and a ready candidate's portable artifact appear under `private/imports/<frozen-hash>/`. Review reconciliation, exclusions, missing scores and unit-basis issues before continuing. A failed or unready candidate is not publishable. See [ingestion and audit details](docs/engineering/b3-ingestion.md).

4. With the local application running (`./dev app-up`), promote and explicitly publish the ready artifact into its separate database. Replace angle-bracket placeholders with the artifact's actual hash, release/revision UUIDs and a newly chosen UUID for each operation. Keep each operation UUID stable when retrying that same operation.

   ```sh
   ./dev app-import promote --target /app/ops/target.json --artifact /private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid> --dry-run
   ./dev app-import promote --target /app/ops/target.json --artifact /private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid>
   ./dev app-import publish --target /app/ops/target.json --release <release-uuid> --revision <revision-uuid> --expected-active none --operation-id <publication-uuid>
   ```

   `--expected-active none` applies to the first publication of that release. Later revisions must name the expected active revision; see [publication and rollback](docs/engineering/b4-publication.md). The synthetic release stays separate. Reload the app to discover the newly published release. Promotion alone does not make data visible. Existing data must pass the same readiness and publication gates regardless of input size.

### Configuration and troubleshooting

Use separate terminals for demo, import, tests and development so exported project names do not carry between workflows. No environment variables are required for the demo. Direct Compose examples pin the project with `-p lca-diff-app`; when choosing another project, use the same `-p` value in every command and set `LCA_APP_PROJECT` to that value for consistent image tags. Optional overrides are illustrated in [.env.example](.env.example); process environment values take precedence over literal `.env` values.

| Variable                        | Default / purpose                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `LCA_APP_PROJECT`               | `lca-diff-app`; isolates application containers and volumes                           |
| `LCA_APP_FRONTEND_PORT`         | `5180`; frontend host port                                                            |
| `LCA_APP_API_PORT`              | `8010`; API host port                                                                 |
| `LCA_APP_AUTH_PORT`             | `9110`; Auth Emulator host port                                                       |
| `COMPOSE_PROJECT_NAME`          | `lca-diff-dev`; workspace/ETL project, distinct from the app project                  |
| `FRONTEND_PORT`, `AIRFLOW_PORT` | `5173`, `8091`; workspace frontend and optional Airflow host ports                    |
| `LCA_PRIVATE_INPUT_DIR`         | Host directory mounted read-only as `/inputs` for opt-in ETL                          |
| `LCA_APP_PRIVATE_DIR`           | Defaults to `./private`; existing host directory mounted as `/private` for app import |
| `VITE_SERVICE_MODE`             | Explicitly `mock` for standalone frontend development; app image builds with `real`   |

Database URLs, emulator settings and local service credentials are supplied by Compose. Standalone API settings and environment boundaries are defined in [ApiSettings](apps/api/src/lca_api/config.py); full topology and tooling details are in the [development guide](docs/engineering/development-environment.md).

- **Docker unavailable or wrong container mode:** check `docker context show` and `docker info`; start Docker Desktop/Engine and use Linux containers. App commands accept conventional and rootless engines. Only source-development/ETL commands require a rootless daemon; do not comment out the workspace guard.
- **Port occupied:** choose an unused port, for example `LCA_APP_FRONTEND_PORT=5181 ./dev app-up`. Keep the same overrides for subsequent commands. Ports must be literal integers from 1 to 65535.
- **Startup task failed:** inspect `docker compose -p lca-diff-app -f compose.app.yaml logs --tail 100 migrate seed auth-seed` (or the Bash status/log wrappers). Re-running startup rebuilds images and reuses the seed without adding a new revision.
- **Seed checksum failure in an older Windows checkout:** Git CRLF conversion changes the exact bytes of the immutable seed. New checkouts are protected by `.gitattributes`. For an existing converted checkout, preserve local work and make a fresh clone with `git -c core.autocrlf=false clone https://github.com/DavidVFitzGerald/LCA-diff.git LCA-diff-lf`, then start from that directory. Rebuild images; do not regenerate checksums or delete database volumes. `git ls-files --eol data_pipeline/seed/artifact/manifest.json` should show `w/lf`, not `w/crlf`.
- **Older checkout reports tools image already exists during build:** update to the fixed Compose file. Only `migrate` now builds the shared tools image. Do not delete database volumes to fix an image-export collision.
- **Import mount missing:** create the input and `private/` directories before using ETL/import commands; bind mounts do not create them automatically.
- **Login changed after switching URLs:** Firebase sessions are scoped to origin. Stay with either `127.0.0.1` or `localhost` and sign in again after switching.
- **Need an empty demo database:** `./dev app-reset --yes` deletes this app project's database/archive volumes. The next `app-up` seeds them again. `app-down` retains them; reset is never needed for a normal restart.

## How this project was built

I supplied an initial description of the requirements and developed a detailed specification through a brainstorm with ChatGPT's web chatbot. I then used ChatGPT, mainly GPT-6.1-Sol, and Claude Code, mainly Opus 5.5, through their respective CLIs to implement the project on a dedicated laptop accessed remotely over SSH.

All implementation work was carried out by the AI models. I acted as maintainer, authorizing which work to focus on, supervising the process and merging pull requests; I did not review the code in detail. Automated checks and independent agent QA provide the recorded verification evidence, rather than a claim of detailed human code review.

The agent workflow is based on Alexey Grigorev's [AI-Native Development: Specifications, Loop and Graph Engineering](https://aishippingblog.com/p/ai-native-development-specifications). Three agent roles have written responsibility documents:

| Role                                                | Responsibility                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Product Manager](docs/team/product-manager.md)     | Grooms issues, defines objective acceptance criteria and checks readiness against the specification                   |
| [Software Engineer](docs/team/software-engineer.md) | Implements one ready issue, runs container checks, commits and hands the delivered SHA to QA                          |
| [QA Engineer](docs/team/qa-engineer.md)             | Independently checks the delivered commit and criteria, reports PASS/FAIL/BLOCKED and returns failures to engineering |

The loop is **ready issue → implementation → independent QA → maintainer merge**. GitHub issues and PRs retain criteria, exact commands, results and handoffs; [#30](https://github.com/DavidVFitzGerald/LCA-diff/issues/30) is a complete example. [AGENTS.md](AGENTS.md) defines context, authority and container rules; [ADRs](docs/adr/README.md) record changes to the product and architecture contracts.

Some initial prompt material is preserved in [docs/reference/](docs/reference/), including the [implementation prompts](docs/reference/LCA-diff%20initial%20prompts%20for%20implementation.md) and [README request](docs/reference/LCA-diff%20prompt%20for%20README.md). These are historical records, not current implementation authority. Use the current [PRD](docs/product/LCA_diff_PRD.md), [specification](docs/engineering/LCA_diff_Implementation_Specification.md) and accepted ADRs for requirements.

## Architecture

```mermaid
flowchart LR
    Browser[React / TypeScript browser UI] --> Frontend[Vite-built frontend and proxy]
    Frontend --> API[FastAPI read API]
    Frontend --> Auth[Firebase Auth Emulator]
    Auth --> Verification[Verified identity]
    Verification --> API
    API --> DB[(PostgreSQL published data)]
    Sources[Private XML + LCIA workbook] --> ETL[Airflow / PySpark ETL]
    ETL --> Candidate[Audited candidate artifact]
    Seed[Committed synthetic artifact] --> Publication[Promote then publish]
    Candidate --> Publication
    Publication --> DB
```

React, TypeScript, Vite and TanStack Query provide the UI, asynchronous reads and caching. FastAPI/Pydantic define the read API; generated TypeScript DTOs and drift checks keep the real adapter aligned with OpenAPI. PostgreSQL, SQLAlchemy and Alembic provide persistent data, immutable release revisions and migrations. Firebase verifies identities; the local MVP uses its emulator. Both deterministic mock and real adapters live behind one frontend services boundary.

The optional Airflow/PySpark pipeline preserves original bytes, provenance and duplicate source flow records, then harmonizes exact amounts and reconciles workbook scores. Promotion loads a candidate without exposing it; explicit atomic publication changes the revision visible to the read-only API. Demo startup uses a prebuilt synthetic artifact, so it does not need provider data or Spark. Python packages share one frozen `uv.lock`; frontend dependencies use `package-lock.json`.

## Testing and evaluation

Tests use invented, deterministic data in public CI. The demo seed contains 25 source processes (24 published, one multi-output exclusion) and a 47-indicator workbook. Cases include positive/negative amounts, zero versus absence, high-precision decimals, missing scores and unresolved reference bases. Additional golden ETL fixtures cover duplicate aggregation, reference mapping, invalid units, audit reports and publication failures.

At local MVP acceptance, **472 frontend tests in 37 files**, **72 mock browser tests across Chromium/Firefox**, and **7 real-stack journeys per browser** passed. Independent QA records clean-clone startup and persistence across restarts in [issue #30](https://github.com/DavidVFitzGerald/LCA-diff/issues/30); detailed commands, coverage and remaining gaps are in [local MVP verification](docs/engineering/local-mvp-verification.md). These establish behavior on the fixtures and representative import, not scientific validation of the full provider corpus.

### Unit and backend integration checks

First select a separate disposable test project on the Docker host, even if you previously exported an import project name. Its database is distinct from both the import and application data volumes. Choose other unused ports if these are occupied:

```sh
export COMPOSE_PROJECT_NAME=lca-diff-tests
export FRONTEND_PORT=5192 AUTH_PORT=9192
./dev backend-up
./dev auth-up
./dev shell
```

Inside that container, install frozen dependencies once (and after lock changes), then run all frontend unit tests plus Python unit and targeted backend integration tests in **one command**:

```sh
npm --prefix apps/frontend ci
uv sync --frozen --all-packages
make test backend-test-unit backend-test-integration
```

`make test` alone runs **frontend tests only**. Backend integration fixtures recreate their disposable database schemas; do not point them at an import or application database. The API/auth test targets are `make backend-test-api backend-test-auth`. Full mock browser tests run with `make test-e2e` inside the workspace; real-stack tests run from the host with `./dev app-e2e` after `./dev app-up`.

The real browser suite expects the seed-only application. After publishing additional releases, some locator/request-count assumptions no longer apply; use a separate `LCA_APP_PROJECT` and unused app ports for a clean seed-only test stack. ETL, Airflow, seed and publication suites need their separate containers: see [ingestion validation](docs/engineering/b3-ingestion.md#focused-validation), [publication verification](docs/engineering/b4-verification.md) and the [ETL workflow](.github/workflows/etl.yml) for exact setup and commands.

## Local development

All development, package installation, formatting, builds and tests run inside containers. **Source development and ETL retain the rootless Docker workspace requirement** ([ADR 0003](docs/adr/0003-rootless-development-workspace.md)); this is separate from simply running the app on Docker Desktop. On the Docker host, explicitly select the development project:

```sh
export COMPOSE_PROJECT_NAME=lca-diff-dev
export FRONTEND_PORT=5173 AUTH_PORT=9099
./dev up
./dev check
./dev shell
```

Inside the workspace, start the frontend independently with deterministic mocks:

```sh
npm --prefix apps/frontend ci
VITE_SERVICE_MODE=mock npm --prefix apps/frontend run dev
```

Open or forward host port 5173. For separate real API/database/emulator services use `./dev api-up` on the host (default API 8000, emulator 9099); the recommended end-to-end real setup remains `./dev app-up`. The [services boundary](apps/frontend/src/services/README.md) explains adapter composition. There is no silent fallback from a failed real adapter to mocks.

Inside the workspace, run `make lint typecheck`, frontend `format:check` and `contracts:check`, or `make backend-format-check backend-lint backend-typecheck` after the frozen Python install. `./dev down` stops workspace services. See the [development environment guide](docs/engineering/development-environment.md) for Dev Containers, isolated projects and detailed commands.

## CI and logs

### Continuous integration

[Frontend](.github/workflows/frontend.yml), [Backend](.github/workflows/backend.yml) and [ETL](.github/workflows/etl.yml) workflows run on every pull request, pushes to `main` and manual dispatch. Applicable gates include frozen dependencies, formatting/lint/type checks, DTO drift, unit and integration tests, migrations, builds, ETL/publication checks and critical browser journeys. Frontend manual dispatch runs the complete available mock browser suite; PRs run critical smoke tests plus real-stack acceptance.

A failed required job blocks readiness for merge; frontend browser failures retain diagnostic artifacts. Successful checks do **not** deploy the application. Hosted infrastructure and continuous delivery are post-MVP.

### Logs and operational metrics

```sh
./dev app-logs api
./dev app-status
```

The API writes structured JSON logs to container stderr. Each request receives an `X-Request-ID`, also included in its log with status and duration; error envelopes carry a request ID. This helps match a failed browser request to its API log without logging request bodies or credentials. Docker retains container output according to the daemon's logging configuration; there is no separate log database or dashboard.

`GET /api/v1/metrics` requires a verified bearer token and returns in-memory request, error and slow-request counters. Counters reset when the API restarts. These are basic diagnostics, not distributed traces or a correlated metrics/traces/logs platform. No user-impact alerts or on-call automation are implemented.

## Project structure

```text
AGENTS.md                   Agent rules, context and lifecycle
apps/frontend/              React UI, services, Vitest and Playwright tests
apps/api/                   FastAPI read API, auth and OpenAPI schema
packages/contracts/         Generated TypeScript DTOs
packages/python/lca_shared/ Shared Python contracts, exact decimals and DB schema
data_pipeline/              Airflow DAG, Spark ETL, rules, fixtures and synthetic seed
db/                         Bootstrap roles and Alembic migrations
ops/local/                  Local app images, startup checks and seed orchestration
compose*.yaml               Separate app, workspace, ETL and publication topologies
.github/workflows/          Container-backed CI
docs/product/               Current product requirements
docs/engineering/           Specification, roadmap, operator guides and evidence
docs/team/                  Agent responsibilities
docs/adr/                   Architecture/product decisions
docs/images/                README screenshot
docs/reference/             Historical prompts; excluded from implementation context
```

## Limitations and next steps

- **Local-only:** no production Firebase project, public hosting or CD. A hosted release needs infrastructure, production access controls and data licensing approval.
- **Full-corpus validation remains outstanding:** a representative private import was verified. Importing every file does not establish complete reconciliation, approved score bases or full-release sign-off. Unverified scores stay `N/A`; multi-output processes are excluded.
- **Workspace state is in memory:** reload does not restore selected processes, indicators or comparison layout. Persistent account-scoped workspaces and stale-ID reconciliation are deferred.
- **Multiple releases:** indicators retain native release identities; equivalent-looking labels are not scientifically harmonized. The indicator tree can display duplicate method labels without a release suffix ([#108](https://github.com/DavidVFitzGerald/LCA-diff/issues/108)).
- **Verification scope:** large comparisons are tested with synthetic mock data; laptop/full-data benchmarks and the complete state/accessibility audit remain future work. The UI targets desktop/laptop browsers.
- **Operations:** tracing, telemetry storage/UI, user-impact alerts and an on-call repair agent are absent.

The [roadmap](docs/engineering/roadmap.md) tracks the deferred work. Priorities for a later hosted release are full-data reconciliation/audit and licensing, production infrastructure/authentication, then saved workspace recovery and operational monitoring. Cross-database mappings, uploads, exports and LCIA recalculation remain future features.

## References

[1] Database of the Swiss Federal Administration, BAFU:2026, Federal Office for the Environment, 2026. [Data download: openLCA Nexus](https://nexus.openlca.org/database/BAFU).

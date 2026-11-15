# B2 authenticated read API verification

Issue [#58](https://github.com/DavidVFitzGerald/LCA-diff/issues/58),
PR [#70](https://github.com/DavidVFitzGerald/LCA-diff/pull/70), stacked on B1 PR #61.
Mode: synthetic PostgreSQL data and real local Firebase Auth Emulator. Independent
QA, final hosted checks and maintainer merge remain pending. No frontend source,
fixtures or provisional contracts changed. No private source input was imported.

## Runtime and transport

The actual `lca-api` uv member exposes specification §7 routes plus readiness
and authenticated per-instance request counters. `ApiSettings` requires the
`lca_api` database role, explicit Firebase project and a signing secret of at
least 32 characters. Production refuses both explicit and ambient emulator
configuration. Local emulator mode requires a `demo-` project and explicit host.
Never reuse the documented local credentials/signing secret in production.

Firebase Admin 7.7.0 verifies ID tokens with `check_revoked=True`; wrong audience,
invalid/expired/revoked/disabled identity is denied. Email verification must be
the actual boolean true. The SDK skips token timestamps in emulator mode, so
the service additionally enforces expiration/issued-at in every mode. Tokens
remain inside the auth boundary and never enter logs. Public health/readiness
routes expose no dataset payload; every dataset route requires verified identity.

The API queries B1's security-barrier `api.*` views using read-only repeatable-read
transactions and the restricted role. Snapshot membership is validated against
ever-published revisions, allowing existing comparisons to retain older data after
publication changes. Release discovery alone follows the active pointer. Provider
audit/staging/source payloads are absent from API projections and public DTOs.

Search is AND-tokenized, literal, case-insensitive SQL substring filtering with
complete grouped ancestor counts and keyset-paged leaves. Paths are compared as
exact segments; branch IDs encode full path identity without delimiter collisions.
Flow rows use SQL ordering by type/category/subcategory/name/ID. Cursor boundaries
use actual SQL-normalized values, avoiding Python/database Unicode lower mismatch.
Score rows preserve source method/indicator order. Signed, versioned cursors bind
semantic filters and snapshots; comparison tokens additionally bind canonical
process/indicator sets, tab and difference mode. Column order changes reuse tokens.
Tokens are stateless; correctness does not depend on a process-local result cache.

Whole-comparison extrema/counts are returned as decimal-string summaries so chart
geometry remains coherent across visible column windows. Difference predicates
run only when enabled for at least two processes; presence, score status and exact
NUMERIC values are distinct. No measurement normalization occurs in the API.
Cell reads and warnings are filtered to requested windows, with no per-cell SQL.
Process warnings belong only in headers; cell warnings retain exact scope.

Defaults: 2 MB request, 4 MB response, 200 header/process/row batch boundaries,
10,000 cells/warnings per response and 10-second SQL timeout. Selection lists in
row queries have no count cap; request bytes/timeouts bound transport work. Clients
must page selection resolution and chunk headers/cell windows. Very large query
or token bodies can require a larger configured byte budget; this is a transport
error, never a silently truncated selection. Pool acquisition is bounded to five
seconds. Disconnect/outer cancellation cancels and joins the in-flight query task.
Rate limits are bounded per-instance/IP counters, not a distributed global quota;
production ingress policy remains R1. Structured logs contain correlation IDs,
status and duration, without auth headers, source rows or exception payloads.
CORS wraps early budget errors as well as ordinary responses.

## Container commands and evidence

From `/tmp/lca-diff-b2` on the Docker host (distinct from all frontend projects):

```sh
COMPOSE_PROJECT_NAME=lca-diff-b2 FRONTEND_PORT=5189 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-b2 FRONTEND_PORT=5189 ./dev backend-up
COMPOSE_PROJECT_NAME=lca-diff-b2 FRONTEND_PORT=5189 AUTH_PORT=9199 ./dev auth-up
COMPOSE_PROJECT_NAME=lca-diff-b2 FRONTEND_PORT=5189 ./dev shell
```

Inside the guarded workspace:

```sh
uv lock --check
uv sync --frozen --all-packages
make backend-format-check backend-lint backend-typecheck
make backend-test-unit backend-test-integration backend-test-api backend-test-auth
make backend-openapi backend-openapi-check backend-compat
```

Observed focused checks: 11 unit cases (9 inherited domain cases plus API
configuration/token/cancellation groups), 5 inherited PostgreSQL migration/security
scenarios, 4 API scenarios and 1 real Emulator auth scenario. They cover 205-ID
selection pagination, complete filtered tree counts, literal SQL metacharacters,
Unicode cursor boundaries, long decimal strings, signed extrema, zero/absence,
valid/missing/unresolved scores, warning scope, snapshots across pointer changes,
token tampering, constant window query count, invalid/oversized requests, CORS and
rate limits. Auth exercises verified/unverified/expired/wrong-project/revoked
tokens against the actual emulator. No production Firebase account was used.
Strict MyPy, Ruff, frozen resolution and schema drift checks pass locally.

The runtime Dockerfile's frozen selected-package install asserts that neither
Airflow nor PySpark is present. Runtime UID/GID is 65532; all capabilities are
dropped and no-new-privileges is enabled. Emulator CLI 15.36.0 uses its committed
npm lock in a separate Node image running as `node`. Both base images are pinned
by digest. API/emulator Compose profiles remain independent of mock frontend use.
The built runtime's real HTTP smoke passed health/readiness, unauthenticated
dataset denial, verified emulator identity and synthetic active-release discovery.
Container inspection confirmed `65532:65532`, `CapDrop=[ALL]` and
`no-new-privileges:true`. The application never runs migrations on startup.

To run the local API after migrations (no startup migration):

```sh
COMPOSE_PROJECT_NAME=lca-diff-b2 FRONTEND_PORT=5189 API_PORT=8189 AUTH_PORT=9199 ./dev api-up
```

API port 8189 and auth port 9199 bind only localhost. Readiness checks the published
view exists. `./dev api-down` stops only this project's API/emulator; it does not
remove the database or affect the frontend agent's project. CI runs the synthetic
API/auth scenarios in pinned containers with an isolated Docker network; the
test container uses the checkout owner's UID/GID, restricted capabilities and
writable disposable HOME/cache rather than granting root bind-mount privileges.

One upstream Starlette warning recommends its future httpx2 TestClient transport;
the official Airflow constraints pin httpx 0.28.1 and the current tests pass with
that supported compatibility path. No check is skipped or downgraded for it.

## OpenAPI and I1 reconciliation

`apps/api/openapi.json` is generated by `uv run --frozen lca-openapi`; `--check`
compares deterministic sorted bytes and runs in CI without DB/auth credentials.
It documents HTTP bearer authentication and decimal-string measurement schemas.
I1 must generate TypeScript types reproducibly; no hand-edited generated frontend
types or real frontend adapter is introduced here.

Intentional provisional-contract differences for I1:

- HTTP success responses are direct typed envelopes; HTTP errors use
  `{error:{code,message,request_id,retryable}}`. The adapter maps them to the
  frontend `ServiceResult` discriminant.
- IDs are validated UUIDs; mock fixture IDs and mock cursors are synthetic.
  Opaque real cursor/token formats are not interchangeable with mock tokens.
- `GET indicators/tree` accepts a JSON-encoded `revision_snapshot` query parameter,
  not a GET body. Snapshot pairs use `release_id`/`revision_id` consistently.
- Row DTOs include whole-selection numeric `summary` metadata. Indicator-tree
  entries have nullable summary; comparison score entries populate it.
- Search node DTOs use one kind-discriminated shape with nullable fields unused by
  a particular kind; the adapter may project the existing branch/leaf union.
- Authentication registration/reset/verification remain Firebase client actions
  behind the frontend service boundary. Email-enumeration protection can report
  password-reset success for unknown accounts; I1 must use that safe success UX
  instead of promising an unknown-account error.

B3 owns actual XML/workbook ingestion and private audit reports; B4 owns validated
promotion/publication/rollback and real API visibility proof; I1 owns browser
Firebase/HTTP adapter parity and real UI E2E. R1/R2 retain cloud deployment,
production authorization, licensing and complete private release validation.

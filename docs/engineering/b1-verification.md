# B1 domain and persistence verification

Issue [#57](https://github.com/DavidVFitzGerald/LCA-diff/issues/57),
PR [#61](https://github.com/DavidVFitzGerald/LCA-diff/pull/61).
Mode: synthetic domain/PostgreSQL checks; independent QA and merge are pending.
No source archives were extracted or imported by B1. Frontend files are unchanged.

## Implemented contracts

The shared uv member defines finite exact decimals, decimal-string JSON boundaries,
explicit present/absent and valid/missing/unresolved score states, a strict Pydantic
boundary base and revision references. Its UUIDv5 namespace and tuple encoding are
fixed in `identity.py` (version 1); release scope is provider version, never import
revision. Names/signs are not key inputs. Environmental category/full subcategory,
meaningful supplied location and canonical unit separate identities. Unit aliases
and scientific normalizations must be approved in ETL before key construction.
Fallback identity includes containing process and source exchange identity.

All specification §4 tables exist under their required physical names. Staging
retains malformed original values and duplicate source numbers. Composite keys
keep source objects, staged parents, reference resolutions, measurements,
indicators and provenance in the intended revision. `NUMERIC` has no arbitrary
scale. Provenance stores durable source URI/path, process number, ordinal, source
amount/unit and normalized input/rules; its local staged-exchange FK is optional.
Impact method/indicator display metadata is revision-bound to preserve snapshots;
shared canonical flow identity/descriptions are frozen once published.

Alembic revision `0001` uses the independent frozen `schema_v1`/`security_v1`
definitions. Later changes must alter current metadata and add a migration without
editing the frozen definitions. Destructive downgrade is deliberately refused;
use a fresh disposable database or the controlled backup/restore procedure in R1.
Applications must not migrate on startup.

Published-data guards use permanently set `published_at`, including superseded
revisions. Inserts, changes, deletes and reparenting are rejected for frozen
revision data; shared published flow and release metadata cannot be changed.
Approved resolution rules and any draft rules referenced by published audit or
measurement/provenance rows are immutable; create a new version instead. Revision,
release-parent and shared-rule/flow row locks serialize writes against publication.
The publisher uses a narrowly granted SECURITY DEFINER lock-only helper rather
than receiving catalog UPDATE privileges for row locks; authorization checks stay
in the invoker trigger. The actual publisher role's freeze and catalog-write denial
are exercised by the role scenario. Guard functions pin their search path with temporary schemas explicitly last, so
an importer cannot bypass them using temporary table names or a caller search path.
Truncation of domain tables is
prohibited. B4 remains responsible for complete readiness validation before a
publisher freezes a revision and activates its pointer.

## Container commands and observed results

No tools were installed on the host. From `/tmp/lca-diff-b1` on the Docker host:

```sh
COMPOSE_PROJECT_NAME=lca-diff-b1 FRONTEND_PORT=5188 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-b1 FRONTEND_PORT=5188 ./dev check
COMPOSE_PROJECT_NAME=lca-diff-b1 FRONTEND_PORT=5188 ./dev backend-up
COMPOSE_PROJECT_NAME=lca-diff-b1 FRONTEND_PORT=5188 ./dev shell
```

The guarded check passed namespace UID/GID mapping to unprivileged host UID/GID
1000, zero capabilities, no-new-privileges, eight rootful/unreachable/preflight
regressions, frozen sync and workspace writes. Tool versions: Python 3.14.2,
uv 0.9.30, Node 24.22.3, npm 11.19.1. PostgreSQL uses the pinned 17-bookworm digest
in Compose, no host listener, separate named volume and namespace UID/GID 999.

Inside the workspace, the following passed:

```sh
uv lock --check
uv sync --frozen --all-packages
make backend-format-check
make backend-lint
make backend-typecheck
make backend-test-unit
make backend-test-integration
make backend-migrate
make backend-compat
```

Focused checks currently contain 9 unit cases and 5 PostgreSQL scenarios. Unit
checks cover finite syntax, long/tiny exact arithmetic under low caller precision,
zero/absence/unavailable score separation, string JSON schemas, deterministic
identity separation, dotenv precedence, production dotenv refusal and log redaction.
Database checks migrate an empty disposable schema and exercise composite FK and
publication membership, duplicate staging retention, full NUMERIC precision,
self-contained provenance, score states, immutable history/reparenting, API/private
role isolation, importer publication denial and independent-transaction write/
publication lock contention. Integration tests deliberately reset the recognized
local `lca` database; never point them at shared or production data.

Initial runs found a generated composite-constraint naming collision and a typing
annotation for environment-populated settings. Independent QA additionally found
a release-metadata/publication race, mutable draft-rule references in frozen audit
history, and importer temporary-table shadowing of guard lookups. All were fixed
with focused regressions within the existing scenarios before final handoff.
Default frozen sync now retains the real shared member through the root workspace
dependency. The dependency probe caught the Firebase 7.8.0 conflict described
in `constraints/README.md`; both selections pass with 7.7.0.

The backend workflow runs frozen lock/install, Ruff, MyPy, unit/database migration
checks and dependency probes inside pinned containers using synthetic data. The
existing frontend workflow remains intact. Hosted results and final reviewed SHA
must be added to the issue handoff; local results do not claim hosted success.

## Roles and B2/B3/B4 handoff

Local disposable credentials are explicit examples in `db/bootstrap.sql`, never
production credentials. Bootstrap alone uses the PostgreSQL administrative role;
migrations use `lca_migrator`, ETL uses `lca_import`, publication uses
`lca_publisher` and API uses `lca_api`. Import cannot update the active pointer or
set `published_at`. API has no public-schema usage/base-table access or writes,
uses read-only transactions and bounded statement/idle timeouts.

API reads the following `api` security-barrier views, whose fields follow the
current SQLAlchemy tables except the explicitly limited projections below:

- `database_release`, `release_publication`, `process`, `process_flows`, `flow`,
  `impact_method`, `impact_indicator`: only ever-published revision data.
- `release_revision`: `id`, `database_release_id`, `revision_no`, `status`,
  `published_at`, excluding private manifest/rule metadata.
- `lcia_score`: `revision_id`, `process_id`, `indicator_id`, `amount`, `status`.
- `process_warning`: `id`, `revision_id`, `process_id`, `flow_id`, `flow_type`,
  `indicator_id`, `code`, `message`, excluding validation-event linkage.

B2 must query those views with the API role, list active revisions through
`api.release_publication`, validate requested revision membership and allow older
ever-published snapshots. No private staging/audit view exists. B2 owns Firebase
verification, entitlement enforcement, request budgets/cursors and public DTOs;
these grants do not prove end-user authentication. `flow.process_name` is nullable
display metadata for ETL-resolved referenced process descriptions.

B3 owns source extraction, scientific transforms, reconciliation/rule approval and
all required audit reports. B4 owns authenticated operations, artifact checksums,
readiness validation, idempotent promotion, atomic publication and rollback. Those
operations must preserve the locks/guards and self-contained provenance. I1 owns
generated TypeScript DTOs and mock/real parity. No frontend contracts were changed;
the shared scalar/revision semantics follow §7, while I1 reconciles route/DTO detail.

Stop only this backend database with `./dev backend-down` under the same project
environment, or stop this entire project with `./dev down`. Neither removes named
volumes. Do not stop the frontend agent's project. R1/R2 retain cloud provisioning,
backup/restore, licensing, full-data validation and production approval gates.

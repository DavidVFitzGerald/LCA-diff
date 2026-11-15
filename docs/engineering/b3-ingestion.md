# BAFU ingestion and private operator workflow

B3 implements extraction, staging, reconciliation, candidate readiness and a
portable promotion artifact. None of these commands publishes data. B4 owns
promotion/publication/rollback; I1 owns the real frontend adapter; R2 owns full
input validation, licensing and actual release approval.

## Local container entry points

Use a separate backend worktree and these host-side variables. Source ZIPs are
mounted **read-only**, and generated data stays in the worktree's ignored
`private/` directory. Do not run these commands in the frontend agent's project.

```sh
export COMPOSE_PROJECT_NAME=lca-diff-b3
export FRONTEND_PORT=5191
export AIRFLOW_PORT=8091
export LCA_PRIVATE_INPUT_DIR=/home/david/projects/LCA-diff/data/private/bafu-2026-v1/incoming
./dev etl-up
./dev etl-run uv sync --frozen --all-packages
./dev etl-run env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres/lca uv run --frozen alembic upgrade head
./dev airflow-up
```

The explicit migration URL above is for the isolated disposable local database.
Normal ETL processes use `lca_import`, which cannot update the publication
pointer or freeze/publish revisions. Migration 0002 grants it only pointer SELECT
for accurate status reports. The API retains its read-only published views.

`compose.etl.yaml` adds a pinned Java/Python ETL image and separate Airflow
metadata PostgreSQL volume, API server, scheduler and DAG processor. Its UI binds
only `127.0.0.1:8091`; access is via localhost/SSH forwarding. LocalExecutor runs
bounded `local[2]` Spark work without a Docker socket. The mock frontend profile
has no dependency on any ETL service. Local namespace UID 0 is deliberately the
unprivileged rootless daemon owner; this setting is not a production identity.

## Input manifest and commands

The strict JSON manifest supports either the three original ZIP archives or an
expanded `process_xml_directory` and `lcia_workbook`. The supplied archive names
are wired in `data_pipeline/examples/bafu-private-representative.json`. Keep
`published_date: null` until maintainer verified. A workbook correction note is
not a legal publication date or licensing approval.

```sh
./dev etl-run uv run --frozen --package lca-etl lca-import prepare --manifest data_pipeline/examples/bafu-private-representative.json
./dev etl-run make import MANIFEST=data_pipeline/examples/bafu-private-representative.json
./dev etl-run uv run --frozen --package lca-etl lca-import report --run-id <import-run-uuid>
```

`prepare` freezes hashes, rules, manifest and pipeline implementation identity,
copies original bytes immutably, validates bounded ZIP paths and members, then
extracts a private working copy. `run` triggers/monitors the manual
`lca_bafu_import` DAG. `run-local --manifest ...` executes the same Spark-backed
pipeline directly for focused integration/recovery checks. It does not replace
the required Airflow integration evidence.

`sample_process_limit` explicitly marks a representative run in its reports and
artifact. It limits the import workload, not user process selection. The workbook
remains fully staged so unmatched rows are visible in the audit. Remove that
field in a separate private manifest only when explicitly running full-data
validation. A representative artifact must not be presented as a full release.

## Scientific and audit behavior

XML is parsed securely by expected tag paths, with byte/depth/node budgets and
per-file diagnostics. Original attributes, text, children and exchange ordinals
remain staged. All duplicate records survive; exact PostgreSQL `NUMERIC` SUM
aggregates only the same process/flow/type, including cancellation to present
zero. Source identity, full environmental compartment, unit and release determine
UUIDv5 identities; names and signs do not. Missing references need an approved
mapping or explicit isolated fallback with an affected-cell warning.

OOXML cells are streamed directly from the XLSX package. Numeric lexical values,
cell types, formula/cache metadata and all original A:AY cells are retained.
No Python float conversion invents source precision. Matching is a strict
name/geography/category/subcategory candidate pass, never row number or fuzzy
similarity. Ambiguous/duplicate/unmatched rows stay unlinked without an approved
override. Source order is preserved across all 47 indicator columns.

Same-unit source scores with XML reference quantity one preserve the provider
value. Different or unverified quantity/unit bases yield `unresolved_basis` and
N/A. A conversion/alias rule must declare exact source and target quantities,
units, positive factor, release/process scope, author, evidence and explicit
approver. Rules cannot authorize themselves through an agent status edit. The
committed real-data rule files contain **no guessed conversions**. Supplied schema
HTML and workbook Info metadata do not establish the metre/kilometre direction
or explain non-unit reference quantities.

Every run produces the ten specification §5.8 reports under
`private/imports/<frozen-hash>/reports/`, including full original A:AY rows for
every flagged worksheet row, even resolved anomalies and failed candidates.
Header-only defects and XML processes without workbook rows use separate reports.
CSV quoting preserves commas, quotes, newlines and Unicode; original numeric
zero is distinct from missing cells. These raw audit CSVs may contain spreadsheet
formulas: treat them as data, not executable spreadsheet content. Generated run
directories are owner-only (0700); do not attach private reports to public issues.

## Retry and transfer contract

One deterministic revision/import-run identity belongs to one frozen manifest,
source/rule checksums and pipeline implementation. Concurrent retries use a
session advisory lease. Completed runs are reused; unfinished Spark output is
retained in `failed-extractions/` before a retry. Scientific failures remain
audited; operational retry and readiness events can be marked resolved after
successful verification without deleting their history.

A ready candidate exports `artifact/manifest.json` plus its SHA-256 file. It
contains versioned release/revision/run IDs, representative status, readiness,
ordered table JSONL files, byte sizes/counts/checksums and source/rule/report
objects. Decimal quantities are strings. Export runs under one repeatable-read
snapshot and the revision row lock, with independent semantic gates. Provenance
is self-contained; optional local staging FKs are null and local source/report
URIs become portable `artifact://` references. B4 independently checks these
objects and gates before a non-visible target load and explicit publication.

## Focused validation

Inside the guarded ETL container, run frozen lock checks, formatter/linter/MyPy,
the source-security unit test, `make backend-test-etl`, and after `./dev airflow-up`,
`make backend-test-airflow`. The golden workload covers exact duplicate zero,
compartment separation, signed technosphere, missing/manual references,
multi-output exclusion, source ordering/missingness, verified synthetic conversion
direction, unverified non-unit basis, complete audit CSV round-trip, failed imports
and artifact checksums/recovery. The Airflow check triggers the real DAG via CLI.
Public CI uses only these invented sources. No arbitrary coverage target or full
BAFU import is required on each PR.

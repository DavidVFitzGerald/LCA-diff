# B3 verification and handoff — issue #59

Scope: one complete ingestion milestone, one implementation PR
[#72](https://github.com/DavidVFitzGerald/LCA-diff/pull/72), stacked on B2
[#70](https://github.com/DavidVFitzGerald/LCA-diff/pull/70). Branch
`feat/b3-ingestion`, worktree `/tmp/lca-diff-b3`. B1/B2 code and the latest
frontend progress are inherited from the verified stack; B3 authors no frontend
changes. No production action or publication occurred.

## Implemented behavior

The actual `lca-etl` workspace member uses Python 3.14, Airflow 3.4.0, PySpark
4.3.0 and a pinned Java 17 container under the shared constrained `uv.lock`.
Secure bounded XML extraction and streaming OOXML preserve source bytes,
metadata, decimal lexemes, original cell types and ordinals. Revision-scoped
staging retains every duplicate; exact PostgreSQL NUMERIC aggregation preserves
present zero and one provenance constituent per exchange. Conservative matching,
explicit approved rules, missing/unresolved score states, warnings and all ten
required private reports are implemented.

The manual Airflow DAG and prepare/run/report CLI produce a non-visible candidate
and a portable checksummed artifact. Export uses a repeatable-read snapshot,
revision lock, semantic readiness recheck and required report/count checks.
Completed-run reuse verifies every table/object path, size and checksum; missing
final artifact metadata can be rebuilt safely, while corrupt payloads are
rejected. Explicit resolved row overrides remain in the full-original-row audit.

Generated run directories are 0700. The source ZIP mount is read-only. Airflow
metadata has its own private Postgres volume and localhost-only UI; no Docker
socket is mounted. Migration 0002 grants importer pointer SELECT for status
reports, retaining publication-write/freeze denial. The lean API image still
installs 53 packages and asserts that Airflow/PySpark are absent.

## Container validation

Local ETL commands use:

```sh
export COMPOSE_PROJECT_NAME=lca-diff-b3
export FRONTEND_PORT=5191
export LCA_PRIVATE_INPUT_DIR=/home/david/projects/LCA-diff/data/private/bafu-2026-v1/incoming
./dev etl-up
./dev etl-run uv sync --frozen --all-packages
./dev etl-run env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres/lca uv run --frozen alembic upgrade head
./dev airflow-up
./dev etl-run uv run --frozen --package lca-etl pytest data_pipeline/tests -m airflow -x -q
```

Actual Airflow DAG/CLI integration passed: three real LocalExecutor tasks,
Spark extraction, staging, harmonization, reports and artifact verification;
**1 passed in 33.95s**. A runtime difference in Airflow 3.4's `dags state` output
(`state, conf`) was fixed in the monitor and covered by this integration.

The affected final source-security/golden/failure checks use the separate
`lca-diff-b3-checks` project (port variable 5192), preserving the private import's
retained staging database:

```sh
COMPOSE_PROJECT_NAME=lca-diff-b3-checks FRONTEND_PORT=5192 ./dev etl-up
COMPOSE_PROJECT_NAME=lca-diff-b3-checks FRONTEND_PORT=5192 ./dev etl-run uv run --frozen pytest packages/python/lca_shared/tests -q
COMPOSE_PROJECT_NAME=lca-diff-b3-checks FRONTEND_PORT=5192 ./dev etl-run uv run --frozen --package lca-etl pytest data_pipeline/tests -m 'unit or etl' -x -q
```

Results: **14 foundation checks passed in 7.15s**; **2 focused ETL checks passed
in 23.58s**. These cover exact duplicate cancellation/provenance, environmental
compartment identity, signed technosphere, manual/fallback references,
multi-output exclusion, missing/invalid scores, source ordering, verified
synthetic conversion direction, unresolved non-unit basis, full A:AY CSV
round-trip, failed import audits, resolved override evidence, artifact recovery
and corrupt-payload rejection. No coverage percentage target was imposed.

Formatter and Ruff passed over all maintained Python sources; strict combined
MyPy passed **37 source files**. Frozen combined workspace resolution succeeds
with 174 packages under the vendored official Airflow constraints. The combined
API Docker build passed with its lean-dependency assertion. Four hosted checks
(`quality`, `backend-quality`, `api-quality`, `etl-quality`) passed at `63da158`;
the final QA regression/documentation commit requires its own hosted results and
independent exact-SHA QA before readiness is claimed.

The first ETL CI attempt found a real numeric-runner-UID/Java-home problem.
Providing a real CI account inside the image and an absolute Spark Ivy cache
fixed it; the ETL job then passed with its full scientific and Airflow checks.
No gate was skipped or weakened.

## Representative supplied-input evidence

The original archive inventory contains 11,947 XML files, one complete XLSX and
three schema-description HTML files. The actual representative command was:

```sh
./dev etl-run uv run --frozen --package lca-etl lca-import run-local --manifest data_pipeline/examples/bafu-private-representative.json
```

That source run at `9fe44e5` processed **five XML processes and all 11,947 workbook
rows**, producing 38 staged exchanges, 38 flow/provenance rows and 235 score
records: **141 valid, 94 unresolved-basis N/A**. Five workbook rows matched;
11,942 rows were intentionally unmatched because only five XML files were selected.
The 28 isolated technosphere fallbacks are likewise expected from that small
subset, and are **not evidence of missing references in the full supplied corpus**.
There were zero unresolved critical issues in the representative candidate.

Its private audit has **11,944 flagged rows, each with all 51 original A:AY
columns**. All 36 exported table/object payloads were subsequently verified by
checksum/size, the generated directory is 0700, and all three original ZIP hashes
remain unchanged. Detailed paths/checksums/counts are retained only in the
ignored `private/b3-private-evidence.json` and private run artifacts. No original
provider rows or score payloads are included here or in public CI.

The schema HTML and workbook Info sheet do not prove quantitative conversion
bases for unit discrepancies or non-unit XML references; no real conversion
rule was invented. A ready **representative** artifact is not a fully validated
BAFU release. B4 still owns promotion/publication/rollback; I1 owns the real
frontend adapter; R2 owns full corpus reconciliation, licensing/date approval
and actual release validation.

## Next action

Independent QA verifies the final PR SHA and all issue criteria. The coordinator
then hands the three validated stacked PRs to the maintainer in B1 → B2 → B3
order. B3 engineering does not merge or close #59. The maintainer requested a
stop after B3; B4 implementation is not started by this handoff.

# B4 verification and handoff

Issue [#60](https://github.com/DavidVFitzGerald/LCA-diff/issues/60), branch
`feat/b4-publication`, [PR #86](https://github.com/DavidVFitzGerald/LCA-diff/pull/86),
based on main recovery merge `9b0ebba`. Application delivery commit: `1b9ee46`.
Implementation uses one issue and one PR. Independent final-SHA QA, hosted CI
and maintainer merge remain pending. No frontend implementation changed and no
production operation, infrastructure provisioning or proprietary import occurred.

## Delivered scope

- Authenticated CLI promotion, publish and rollback with explicit targets,
  operation UUIDs, dry-run and expected-pointer conflict detection.
- Create-only local/GCS archive transfer, checksummed portable artifact load,
  batched inserts, target readiness/rule/reference/count/provenance verification.
- Migration 0003 adds append-only operation receipts with database-derived actor,
  time and role, artifact identity and before/after pointers. Published values
  retain B1's database immutability protections.
- Separate target PostgreSQL overlay and focused synthetic CLI/API lifecycle,
  fault, concurrency, SDK-precondition and production-approval checks.
- [Operator playbook](b4-publication.md) documents recovery and cloud boundaries.

## Local container evidence

Guarded rootless Docker project `lca-diff-b4`, frontend port 5194; no other
project's services or volumes were changed. Invocations used these host variables:

```sh
export COMPOSE_PROJECT_NAME=lca-diff-b4
export FRONTEND_PORT=5194
export LCA_PRIVATE_INPUT_DIR=/absolute/path/to/private/incoming
export LCA_PUBLICATION_OVERRIDE=/tmp/lca-b4-runtime.yaml
```

The raw input mount remained read-only and unused by these synthetic tests.
Fresh local frozen sync failed because the tmpfs workspace exhausted its quota
while copying PySpark. Local checks instead used the existing B3 lock-compatible
virtual environment mounted read-only at the same container path, with
`UV_NO_SYNC=1`. The 174-package resolution and Google Storage 3.17.1 were checked
inside the container. This is a local resource workaround, not proof of a fresh
install: hosted CI must perform its ordinary fresh `uv sync --frozen --all-packages`.

Commands executed in the guarded ETL container:

```sh
./dev publication-run uv lock --check
./dev publication-run make backend-format-check backend-lint backend-typecheck
./dev publication-run make backend-test-unit backend-test-integration
./dev publication-run make backend-test-publication
```

Observed: frozen lock check passes (174 packages); Ruff format/lint and MyPy
pass (43 source files); 12 unit checks and 5 PostgreSQL integration scenarios
pass. The final focused B4 suite passes all 3 scenarios in 41.93 seconds,
including exact old/new cell values across publication and replay release binding.
Independent QA then identified coordinated target-data drift that semantic checks
alone did not reject. Promotion receipts now bind exact target table contents,
verified on publish/rollback and retry. A regression changes an unpublished amount
and its provenance sum together and proves activation/retry are denied. The
focused suite passes all 3 scenarios in 62.81 seconds after this fix; Ruff and
MyPy pass (44 source files). Final-SHA QA remains required.

The publication suite migrates clean disposable source/target databases, creates
three synthetic ready candidates (first through real Spark), and exercises real
CLI transactions. It proves no visibility before publish, unchanged old snapshot
reads, serialized competing publishers, rollback, role denial, append-only audit,
no staging dependencies, semantic/checksum denial and interruption/retry without
partial database state. API auth is a verified test identity here; the existing
separate B2 emulator CI retains real Firebase validation. GCS is an SDK boundary
fake; actual cloud transfer/permissions/retention verification belongs to R1.

## Remaining gates and next action

Engineering committed and pushed `1b9ee46` and opened draft PR #86. Hosted checks
on `d3bd9ed` passed backend, API and ETL (including fresh frozen installations,
publication and real Airflow). Frontend CI failed an unchanged mixed-sign row
height assertion, while its prior identical-frontend run passed. One rerun was
requested and the issue is tracked separately in #87; no frontend code was
changed to hide it. Final checks and independent QA are in progress. Prior role attempts were blocked by agent
usage limits; the independent QA role has now resumed. Self-review does not replace
independent QA. #60 stays open until
checks, QA and an approved merge. I1 owns frontend integration; R1 owns actual
cloud deployment/restore/credential drills; R2 owns full-data validation,
licensing/date/audit signoff and explicit production publication approval.

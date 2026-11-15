# Promotion, publication and rollback

B4 (#60) adds maintainer-only commands to B3's `lca-import` CLI. Promotion copies
an already-ready artifact into a separate target. Only explicit publication or
rollback changes visibility. The frontend remains on its existing mock adapter;
I1 owns connecting it. No production operation is authorized by this playbook.

## Disposable local setup

Use an isolated backend worktree. These host commands only orchestrate rootless
Docker; all Python commands execute in its restricted ETL container.

```sh
export COMPOSE_PROJECT_NAME=lca-diff-b4
export FRONTEND_PORT=5194
export LCA_PRIVATE_INPUT_DIR=/absolute/path/to/private/incoming
./dev publication-up
./dev publication-run uv sync --frozen --all-packages
./dev publication-run env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres/lca uv run --frozen alembic upgrade head
./dev publication-run env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres-target/lca uv run --frozen alembic upgrade head
```

The overlay provides a separate target PostgreSQL volume without a host port.
Its local importer, publisher and migration URLs are container environment
variables; the committed credentials work only in these disposable environments.
The source database is `postgres`; the target is `postgres-target`. Never point
the destructive publication test suite at a retained database.

Create ignored `private/target.json` inside the worktree:

```json
{
  "name": "local-b4",
  "environment": "local",
  "archive_uri": "file:///workspaces/lca-diff/private/promoted"
}
```

The target defaults to environment variables `LCA_TARGET_IMPORT_DATABASE_URL`
and `LCA_TARGET_PUBLISH_DATABASE_URL`. A target can name alternative uppercase
environment variables using `import_url_env` and `publish_url_env`. Configuration
contains no passwords. Container-only paths refer to the ETL container filesystem.

## Explicit operator commands

First follow [B3 ingestion](b3-ingestion.md) to prepare/run a manifest and review
all reports. A ready run supplies `artifact/manifest.json`. Use actual UUIDs and
paths in place of placeholders below. Choose one operation UUID per intended
action and retain it for retries. Dry-run performs target SQL verification in a
transaction that is rolled back; it writes neither archives nor audit receipts.

```sh
./dev publication-run uv run --frozen --package lca-etl lca-import promote --target private/target.json --artifact private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid> --dry-run
./dev publication-run uv run --frozen --package lca-etl lca-import promote --target private/target.json --artifact private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid>
./dev publication-run uv run --frozen --package lca-etl lca-import publish --target private/target.json --release <release-uuid> --revision <revision-uuid> --expected-active none --operation-id <publication-uuid> --dry-run
./dev publication-run uv run --frozen --package lca-etl lca-import publish --target private/target.json --release <release-uuid> --revision <revision-uuid> --expected-active none --operation-id <publication-uuid>
./dev publication-run uv run --frozen --package lca-etl lca-import rollback --target private/target.json --release <release-uuid> --revision <previously-published-uuid> --expected-active <current-uuid> --operation-id <rollback-uuid> --dry-run
./dev publication-run uv run --frozen --package lca-etl lca-import rollback --target private/target.json --release <release-uuid> --revision <previously-published-uuid> --expected-active <current-uuid> --operation-id <rollback-uuid>
```

For later publication replace `none` with the currently active revision UUID.
Obtain it from authenticated B2 release metadata or a private operator database
query. A stale pointer fails with `STALE_PUBLICATION_POINTER`; inspect the new
state and use a new operation UUID for a newly intended action. Success is JSON
containing the operation, target, release/revision and before/after pointers;
`reused: true` means that exact operation previously committed. It does not claim
the pointer has remained unchanged since that operation. An operation UUID reused
for another action/target/revision/expected pointer is rejected.

## Artifact and transaction lifecycle

Promotion verifies manifest/file SHA-256 values, table counts and schemas,
readiness, reference/score/rule consistency and original source coordinates.
Files are copied beneath `<archive>/<artifact-sha256>/` using create-only writes.
An existing object must match its expected bytes. Database inserts are batched
and compared on conflict, then independent target gates run before one commit.
All candidate data and its promotion receipt commit together. No publication
pointer changes. Staging tables are not transferred: source objects, original
exchange ordinals/amounts, workbook coordinates and rules remain self-contained.
Local `artifact://` source/report references become durable target archive URIs.
The receipt also binds exact target table contents with deterministic hashes,
including provenance and metadata. Activation and retries reject coordinated
target edits even if row counts and scientific sum checks still agree. Only
revision status and its publication timestamp are excluded from that content
binding because activation deliberately changes them.

Publish verifies the promoted archive again and locks release dependencies and
the revision before changing status/pointer and appending its audit receipt in
one transaction. Competing publishers serialize, and only the one whose expected
pointer still matches succeeds. Rollback accepts only a previously published
revision in the same release. Both revisions and all earlier receipts remain.
B1 database guards protect published identities and values; B2 comparisons keep
reading their explicit immutable revision snapshot across pointer switches.

The append-only `publication_operation` table records the actual database
session identity/role/time, artifact identity, before/after pointers and private
promotion receipt or production approval evidence. It has no public API view.
Raw audit CSVs stay in private object storage, never log output or public issues.

## Failure recovery

If transfer stops, the target transaction rolls back while already copied
immutable files remain. Retry the same artifact/target/operation UUID: matching
files are reused and the entire candidate is reverified. A lost response after
commit also reuses the receipt. A conflicting object, checksum, source/rule or
existing database row fails closed; restore the expected immutable bytes or
produce a new corrected B3 revision rather than overwriting history.

If publish/rollback fails, its status changes, pointer and audit insert roll
back together. Check the current pointer before retrying. Do not delete archives
or receipts to recover. Archive retention, real backups/restores and credential
revocation drills are R1 gates; do not garbage-collect objects referenced by any
published revision, even after rollback. Migration 0003 refuses downgrade to
protect audit history; use a reviewed forward migration or database restore.

## Cloud SQL and private GCS

R1 provisions the real infrastructure/IAM. From the maintenance laptop, connect
through an authenticated Cloud SQL Auth Proxy (localhost or `/cloudsql/` socket),
with a separate database login granted membership in `lca_import` for promotion
or `lca_publisher` for activation. Superuser sessions are rejected. The CLI sets
the expected restricted role and fixed search path; ordinary API users possess
neither these logins nor a public HTTP publication route. Migrations use the
separate controlled migration identity. Credentials must be injected privately
into the container; do not commit `.env` files or mount broad host credentials.

Use target `environment: production` and `archive_uri: gs://<private-bucket>/<prefix>`.
The GCS SDK uses Application Default Credentials for the explicit maintainer
identity. Bucket metadata read, object create and object read permissions are
needed; object delete/overwrite permissions are unnecessary. Public access
prevention must explicitly be `enforced`; use uniform bucket-level access,
private IAM and retention policies provisioned in R1. GCS uploads require
`if_generation_match=0`, transport checksums and subsequent SHA-256 verification.
No bucket is created by the CLI. Avoid public PostgreSQL listeners; direct
connections additionally require certificate-verifying TLS.

Production rejects representative artifacts. Publishing requires a verified
source release date and a private approval JSON passed with `--approval`:

```json
{
  "action": "publish",
  "target": "production-target-name",
  "release_id": "<release-uuid>",
  "revision_id": "<revision-uuid>",
  "artifact_sha256": "<artifact-manifest-sha256>",
  "expected_active_revision_id": null,
  "approved_by": "<maintainer identity>",
  "approved_at": "<past ISO-8601 timestamp with timezone>",
  "evidence": "<explicit approval and R2 audit/license/release-gate record>"
}
```

Use `action: rollback` and the current expected pointer for rollback approval.
This file records an external explicit maintainer decision; it cannot grant IAM
or replace that decision, R2's full-data validation or licensing signoff. Creating
a file or running a dry-run does not authorize a production action.

## Focused verification

`./dev publication-run make backend-test-publication` builds three invented
revisions and resets both disposable databases. It exercises real Spark for one
candidate, real CLI/PostgreSQL operations and B2 HTTP reads. It covers role
denial, checksum/semantic failures, interrupted transfer/retry, concurrent
publication, immutability and snapshot continuity. The GCS SDK boundary is faked
with create-only preconditions; actual cloud transfer is an R1 staging check.
B2's separate Auth Emulator suite verifies real Firebase auth; this test supplies
a verified test identity to isolate publication behavior. See
[verification evidence](b4-verification.md) for results and remaining gates.

"""Authenticated, idempotent promotion and atomic publication/rollback."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from lca_shared.logging import event
from sqlalchemy import Connection, Table, create_engine, insert, select, text, tuple_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from lca_etl.intake import sha256
from lca_etl.object_store import ObjectStore
from lca_etl.publication_artifact import TABLES, Candidate
from lca_etl.publication_models import OperationError, Target
from lca_etl.publication_validation import validate_target


def authenticate(connection: Connection, action: str) -> None:
    role = "lca_import" if action == "promote" else "lca_publisher"
    permitted = connection.scalar(
        text("SELECT pg_catalog.pg_has_role(session_user,:role,'MEMBER')"), {"role": role}
    )
    superuser = connection.scalar(
        text("SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user")
    )
    if not permitted or superuser:
        raise OperationError("OPERATOR_DENIED")
    connection.exec_driver_sql("SET LOCAL ROLE " + role)
    if connection.scalar(text("SELECT current_user")) != role:
        raise OperationError("OPERATOR_DENIED")
    connection.exec_driver_sql("SET LOCAL search_path=pg_catalog,public,pg_temp")
    connection.exec_driver_sql("SET LOCAL statement_timeout='60s'")
    connection.exec_driver_sql("SET LOCAL lock_timeout='10s'")


def result(row: dict[str, Any], *, reused: bool = False, dry_run: bool = False) -> dict[str, Any]:
    return {
        "operation_id": str(row["id"]),
        "action": row["action"],
        "target": row["target"],
        "release_id": str(row["database_release_id"]),
        "revision_id": str(row["revision_id"]),
        "previous_revision_id": str(row["previous_revision_id"])
        if row["previous_revision_id"]
        else None,
        "active_revision_id": str(row["active_revision_id"]) if row["active_revision_id"] else None,
        "reused": reused,
        "dry_run": dry_run,
    }


def prior_operation(
    connection: Connection,
    identifier: UUID,
    action: str,
    revision: UUID,
    target: Target,
    digest: str | None = None,
) -> dict[str, Any] | None:
    connection.execute(
        text("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(:key,0))"),
        {"key": str(identifier)},
    )
    found = (
        connection.execute(
            select(db.publication_operation).where(db.publication_operation.c.id == identifier)
        )
        .mappings()
        .one_or_none()
    )
    if found is None:
        return None
    if (
        found["action"] != action
        or found["revision_id"] != revision
        or found["target"] != target.name
        or (digest is not None and found["artifact_sha256"] != digest)
        or found["details"].get("archive_uri") != target.archive_uri
    ):
        raise OperationError("OPERATION_ID_CONFLICT")
    return dict(found)


def active(connection: Connection, release: UUID) -> UUID | None:
    return connection.scalar(
        select(db.release_publication.c.active_revision_id).where(
            db.release_publication.c.database_release_id == release
        )
    )


def require_approval(
    target: Target,
    action: str,
    revision: UUID,
    release: UUID,
    digest: str,
    expected: UUID | None,
    path: Path | None,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    if target.environment != "production":
        return None
    if payload.get("representative"):
        raise OperationError("REPRESENTATIVE_PRODUCTION_FORBIDDEN")
    if action == "promote":
        return None
    if path is None:
        raise OperationError("PRODUCTION_APPROVAL_REQUIRED")
    approval: dict[str, Any] = json.loads(path.read_bytes())
    required = {
        "action": action,
        "target": target.name,
        "release_id": str(release),
        "revision_id": str(revision),
        "artifact_sha256": digest,
        "expected_active_revision_id": str(expected) if expected else None,
    }
    if any(approval.get(key) != value for key, value in required.items()) or not all(
        isinstance(approval.get(key), str) and approval[key].strip()
        for key in ("approved_by", "evidence", "approved_at")
    ):
        raise OperationError("PRODUCTION_APPROVAL_INVALID")
    moment = datetime.fromisoformat(approval["approved_at"])
    if moment.tzinfo is None or moment > datetime.now(UTC):
        raise OperationError("PRODUCTION_APPROVAL_INVALID")
    return approval


def insert_candidate(connection: Connection, candidate: Candidate, store: ObjectStore) -> None:
    # Parent release/rules/global identities serialize against publication and
    # other promotion attempts; every table insert is in this one transaction.
    for table in TABLES:
        batch: list[dict[str, Any]] = []

        def flush(table: Table, batch: list[dict[str, Any]]) -> None:
            if not batch:
                return
            keys = list(table.primary_key.columns)
            inserted = {
                tuple(row)
                for row in connection.execute(
                    pg_insert(table).on_conflict_do_nothing().returning(*keys), batch
                )
            }
            conflicts = {
                tuple(row[column.name] for column in keys): row
                for row in batch
                if tuple(row[column.name] for column in keys) not in inserted
            }
            if conflicts:
                rows = connection.execute(
                    select(table).where(tuple_(*keys).in_(list(conflicts)))
                ).mappings()
                seen = set()
                for existing in rows:
                    key = tuple(existing[column.name] for column in keys)
                    seen.add(key)
                    if any(existing[name] != value for name, value in conflicts[key].items()):
                        raise OperationError("TARGET_EXISTING_DATA_CONFLICT")
                if seen != set(conflicts):
                    raise OperationError("TARGET_EXISTING_DATA_CONFLICT")
            batch.clear()

        for row in candidate.rows(table):
            if table is db.source_object:
                descriptor = candidate.source_map.get(str(row["id"]))
                if (
                    descriptor is None
                    or descriptor["sha256"] != row["sha256"]
                    or descriptor["byte_size"] != row["byte_size"]
                    or descriptor["source_relative_path"] != row["relative_path"]
                    or row["storage_uri"] != "artifact://" + descriptor["path"]
                ):
                    raise OperationError("ARTIFACT_SOURCE_BINDING_INVALID")
                row["storage_uri"] = store.location(candidate.digest + "/" + descriptor["path"])
            if table is db.import_run:
                if row["report_uri"] != "artifact://reports" or row["status"] != "ready":
                    raise OperationError("ARTIFACT_RUN_INVALID")
                row["report_uri"] = store.location(candidate.digest + "/reports")
            batch.append(row)
            if len(batch) == 500:
                flush(table, batch)
        flush(table, batch)
        if table is db.database_release:
            connection.execute(
                select(table.c.id).where(table.c.id == candidate.release).with_for_update()
            )
        if table is db.release_revision:
            connection.execute(
                select(table.c.id).where(table.c.id == candidate.revision).with_for_update()
            )


def promote(
    path: Path, target: Target, operation_id: UUID, *, dry_run: bool = False
) -> dict[str, Any]:
    database = create_engine(
        target.database_url("promote"),
        hide_parameters=True,
        execution_options={"schema_translate_map": {None: "public"}},
    )
    try:
        with database.connect() as connection:
            transaction = connection.begin()
            try:
                authenticate(connection, "promote")
                candidate = Candidate(path)
                previous = prior_operation(
                    connection,
                    operation_id,
                    "promote",
                    candidate.revision,
                    target,
                    candidate.digest,
                )
                store = ObjectStore(
                    target.archive_uri, require_private=target.environment == "production"
                )
                if previous is not None:
                    verify_receipt(previous, store)
                    validate_target(
                        connection, candidate.revision, previous["details"]["receipt"]["manifest"]
                    )
                    transaction.rollback()
                    return result(previous, reused=True, dry_run=dry_run)
                require_approval(
                    target,
                    "promote",
                    candidate.revision,
                    candidate.release,
                    candidate.digest,
                    None,
                    None,
                    candidate.payload,
                )
                files = [
                    *candidate.payload["tables"],
                    *candidate.payload["objects"],
                    {
                        "path": "manifest.json",
                        "sha256": candidate.digest,
                        "byte_size": candidate.path.stat().st_size,
                    },
                    {
                        "path": "manifest.sha256",
                        "sha256": sha256(candidate.path.parent / "manifest.sha256"),
                        "byte_size": (candidate.path.parent / "manifest.sha256").stat().st_size,
                    },
                ]
                if not dry_run:
                    for item in files:
                        store.put(
                            candidate.path.parent / item["path"],
                            candidate.digest + "/" + item["path"],
                            item["sha256"],
                            item["byte_size"],
                        )
                insert_candidate(connection, candidate, store)
                before = active(connection, candidate.release)
                validate_target(connection, candidate.revision, candidate.payload)
                record = {
                    "id": operation_id,
                    "database_release_id": candidate.release,
                    "revision_id": candidate.revision,
                    "action": "promote",
                    "target": target.name,
                    "artifact_sha256": candidate.digest,
                    "previous_revision_id": before,
                    "active_revision_id": before,
                    "session_user_name": "database-derived",
                    "database_role": "database-derived",
                    "details": {
                        "archive_uri": target.archive_uri,
                        "receipt": candidate.receipt(),
                        "files": files,
                    },
                }
                if dry_run:
                    transaction.rollback()
                else:
                    connection.execute(insert(db.publication_operation).values(**record))
                    transaction.commit()
                event("PROMOTION_VERIFIED", revision_id=candidate.revision)
                return result(record, dry_run=dry_run)
            except BaseException:
                if transaction.is_active:
                    transaction.rollback()
                raise
    finally:
        database.dispose()


def verify_receipt(record: dict[str, Any], store: ObjectStore) -> None:
    prefix = record["artifact_sha256"]
    for item in record["details"]["files"]:
        store.verify(prefix + "/" + item["path"], item["sha256"], item["byte_size"])


def activate(
    target: Target,
    action: str,
    revision: UUID,
    operation_id: UUID,
    *,
    expected: UUID | None,
    release_id: UUID | None = None,
    approval: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    if action not in ("publish", "rollback"):
        raise OperationError("OPERATION_INVALID")
    database = create_engine(
        target.database_url(action),
        hide_parameters=True,
        execution_options={"schema_translate_map": {None: "public"}},
    )
    try:
        with database.connect() as connection:
            transaction = connection.begin()
            try:
                authenticate(connection, action)
                previous = prior_operation(connection, operation_id, action, revision, target)
                if previous is not None:
                    if release_id is not None and previous["database_release_id"] != release_id:
                        raise OperationError("RELEASE_MISMATCH")
                    if previous["previous_revision_id"] != expected:
                        raise OperationError("OPERATION_ID_CONFLICT")
                    transaction.rollback()
                    return result(previous, reused=True, dry_run=dry_run)
                record = (
                    connection.execute(
                        select(db.release_revision).where(db.release_revision.c.id == revision)
                    )
                    .mappings()
                    .one_or_none()
                )
                if record is None:
                    raise OperationError("REVISION_UNKNOWN")
                release = record["database_release_id"]
                if release_id is not None and release != release_id:
                    raise OperationError("RELEASE_MISMATCH")
                # Lock parent, then revision/dependencies. All CLI publishers use
                # this order; empty publication pointers are protected by parent.
                connection.execute(
                    text("SELECT public.lca_lock_publication_dependencies(:revision,:release)"),
                    {"revision": revision, "release": release},
                )
                record = (
                    connection.execute(
                        select(db.release_revision)
                        .where(db.release_revision.c.id == revision)
                        .with_for_update()
                    )
                    .mappings()
                    .one()
                )
                before = active(connection, release)
                if before != expected:
                    raise OperationError("STALE_PUBLICATION_POINTER")
                promotion = (
                    connection.execute(
                        select(db.publication_operation)
                        .where(
                            db.publication_operation.c.revision_id == revision,
                            db.publication_operation.c.action == "promote",
                            db.publication_operation.c.target == target.name,
                        )
                        .order_by(db.publication_operation.c.created_at.desc())
                        .limit(1)
                    )
                    .mappings()
                    .one_or_none()
                )
                if promotion is None or promotion["details"]["archive_uri"] != target.archive_uri:
                    raise OperationError("PROMOTION_RECEIPT_REQUIRED")
                digest = promotion["artifact_sha256"]
                payload = promotion["details"]["receipt"]["manifest"]
                approved = require_approval(
                    target, action, revision, release, digest, expected, approval, payload
                )
                store = ObjectStore(
                    target.archive_uri, require_private=target.environment == "production"
                )
                verify_receipt(dict(promotion), store)
                validate_target(connection, revision, payload)
                if action == "rollback" and record["published_at"] is None:
                    raise OperationError("ROLLBACK_REQUIRES_PUBLISHED_REVISION")
                if (
                    action == "publish"
                    and record["published_at"] is None
                    and record["status"] != "ready"
                ):
                    raise OperationError("REVISION_NOT_READY")
                if target.environment == "production":
                    release_row = (
                        connection.execute(
                            select(db.database_release).where(db.database_release.c.id == release)
                        )
                        .mappings()
                        .one()
                    )
                    if release_row["source_published_at"] is None:
                        raise OperationError("SOURCE_RELEASE_DATE_REQUIRED")
                now = datetime.now(UTC)
                if before != revision:
                    if before is not None:
                        connection.execute(
                            update(db.release_revision)
                            .where(db.release_revision.c.id == before)
                            .values(status="superseded")
                        )
                    values: dict[str, Any] = {"status": "published"}
                    if record["published_at"] is None:
                        values["published_at"] = now
                    connection.execute(
                        update(db.release_revision)
                        .where(db.release_revision.c.id == revision)
                        .values(**values)
                    )
                    connection.execute(
                        pg_insert(db.release_publication)
                        .values(
                            database_release_id=release,
                            active_revision_id=revision,
                            activated_at=now,
                        )
                        .on_conflict_do_update(
                            index_elements=[db.release_publication.c.database_release_id],
                            set_={"active_revision_id": revision, "activated_at": now},
                        )
                    )
                audit = {
                    "id": operation_id,
                    "database_release_id": release,
                    "revision_id": revision,
                    "action": action,
                    "target": target.name,
                    "artifact_sha256": digest,
                    "previous_revision_id": before,
                    "active_revision_id": revision,
                    "session_user_name": "database-derived",
                    "database_role": "database-derived",
                    "details": {"archive_uri": target.archive_uri, "approval": approved},
                }
                if dry_run:
                    transaction.rollback()
                else:
                    connection.execute(insert(db.publication_operation).values(**audit))
                    transaction.commit()
                event("PUBLICATION_OPERATION_VERIFIED", revision_id=revision)
                return result(audit, dry_run=dry_run)
            except BaseException:
                if transaction.is_active:
                    transaction.rollback()
                raise
    finally:
        database.dispose()

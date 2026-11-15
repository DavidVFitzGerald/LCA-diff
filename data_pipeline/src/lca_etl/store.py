"""Revision-scoped transactional staging; importer credentials cannot publish."""

import hashlib
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid5

from lca_shared.db import schema as db
from sqlalchemy import Connection, Table, func, select
from sqlalchemy.dialects.postgresql import insert

from lca_etl.intake import canonical_json
from lca_etl.models import Manifest, RuleSet

IMPORT_NAMESPACE = UUID("248e390c-31e5-5bba-8251-02880d3e3d15")


def stable(namespace: UUID, *parts: object) -> UUID:
    return uuid5(namespace, canonical_json([str(part) for part in parts]).decode())


def insert_rows(connection: Connection, table: Table, rows: Iterable[dict[str, Any]]) -> None:
    batch = []
    for row in rows:
        batch.append(row)
        if len(batch) == 500:
            connection.execute(insert(table).on_conflict_do_nothing(), batch)
            batch.clear()
    if batch:
        connection.execute(insert(table).on_conflict_do_nothing(), batch)


def register(
    connection: Connection,
    manifest: Manifest,
    prepared: dict[str, Any],
    rules: tuple[RuleSet, RuleSet],
) -> tuple[UUID, UUID, UUID]:
    release = manifest.release
    release_id = stable(IMPORT_NAMESPACE, release.database_code, release.release_version)
    insert_rows(
        connection,
        db.database_release,
        [
            {
                "id": release_id,
                "database_code": release.database_code,
                "release_version": release.release_version,
                "display_name": release.display_name,
                "source_published_at": datetime.combine(
                    release.published_date, datetime.min.time(), UTC
                )
                if release.published_date is not None
                else None,
                "license_policy": release.license_policy,
            }
        ],
    )
    stored = (
        connection.execute(
            select(db.database_release)
            .where(
                db.database_release.c.database_code == release.database_code,
                db.database_release.c.release_version == release.release_version,
            )
            .with_for_update()
        )
        .mappings()
        .one()
    )
    release_id = stored["id"]
    if (
        stored["display_name"] != release.display_name
        or stored["license_policy"] != release.license_policy
    ):
        raise ValueError("Existing release metadata differs; no implicit overwrite is allowed")
    revision_id = stable(release_id, prepared["manifest_sha256"])
    run_id = stable(revision_id, "import")
    current = (
        connection.execute(
            select(db.release_revision).where(db.release_revision.c.id == revision_id)
        )
        .mappings()
        .one_or_none()
    )
    if current is None:
        revision_no = connection.scalar(
            select(func.coalesce(func.max(db.release_revision.c.revision_no), 0) + 1).where(
                db.release_revision.c.database_release_id == release_id
            )
        )
        insert_rows(
            connection,
            db.release_revision,
            [
                {
                    "id": revision_id,
                    "database_release_id": release_id,
                    "revision_no": revision_no,
                    "status": "staging",
                    "mapping_rule_version": "+".join(item.version for item in rules),
                    "manifest_sha256": prepared["manifest_sha256"],
                }
            ],
        )
    for rule_set in rules:
        for rule in rule_set.rules:
            if (
                rule.database_code != release.database_code
                or rule.release_version != release.release_version
            ):
                raise ValueError("Rule scope does not belong to this release")
            raw = rule.model_dump(mode="json")
            checksum = hashlib.sha256(canonical_json(raw)).hexdigest()
            previous = (
                connection.execute(
                    select(db.resolution_rule).where(db.resolution_rule.c.id == rule.id)
                )
                .mappings()
                .one_or_none()
            )
            if previous is not None and (
                previous["database_release_id"] != release_id or previous["checksum"] != checksum
            ):
                raise ValueError("Rule identity/content collision")
            insert_rows(
                connection,
                db.resolution_rule,
                [
                    {
                        "id": rule.id,
                        "database_release_id": release_id,
                        "rule_type": rule.rule_type,
                        "input_key": {
                            key: raw[key]
                            for key in ("process_number", "source_number", "excel_row")
                        },
                        "resolution": raw,
                        "author": rule.author,
                        "evidence": rule.evidence,
                        "approved": rule.approved,
                        "approved_by": rule.approved_by,
                        "effective_version": rule.version,
                        "checksum": checksum,
                    }
                ],
            )
    if current is None or current["published_at"] is None:
        insert_rows(
            connection,
            db.import_run,
            [
                {
                    "id": run_id,
                    "revision_id": revision_id,
                    "dag_run_id": f"lca__{revision_id}",
                    "status": "prepared",
                    "parser_version": "0.1.0",
                    "transformer_version": "0.1.0",
                    "report_uri": str(prepared["directory"]) + "/reports",
                }
            ],
        )
    return release_id, revision_id, run_id


def issue(
    connection: Connection,
    revision_id: UUID,
    run_id: UUID,
    *,
    code: str,
    stage: str,
    severity: str = "ERROR",
    source_object_id: UUID | None = None,
    process_source_id: str | None = None,
    exchange_ordinal: int | None = None,
    spreadsheet_row: int | None = None,
    message: str,
    resolution_state: str = "unresolved",
    resolution_rule_id: UUID | None = None,
) -> UUID:
    issue_id = stable(
        run_id,
        code,
        source_object_id,
        process_source_id,
        exchange_ordinal,
        spreadsheet_row,
        message,
    )
    insert_rows(
        connection,
        db.validation_issue,
        [
            {
                "id": issue_id,
                "revision_id": revision_id,
                "import_run_id": run_id,
                "stage": stage,
                "severity": severity,
                "code": code,
                "source_object_id": source_object_id,
                "process_source_id": process_source_id,
                "exchange_ordinal": exchange_ordinal,
                "spreadsheet_row": spreadsheet_row,
                "message": message,
                "resolution_state": resolution_state,
                "resolution_rule_id": resolution_rule_id,
                "resolved_at": datetime.now(UTC) if resolution_state != "unresolved" else None,
            }
        ],
    )
    return issue_id


def warning(
    connection: Connection,
    revision_id: UUID,
    process_id: UUID,
    *,
    code: str,
    message: str,
    issue_id: UUID,
    flow_id: UUID | None = None,
    flow_type: str | None = None,
    indicator_id: UUID | None = None,
) -> None:
    insert_rows(
        connection,
        db.process_warning,
        [
            {
                "id": stable(process_id, code, flow_id, flow_type, indicator_id, issue_id),
                "revision_id": revision_id,
                "process_id": process_id,
                "code": code,
                "message": message,
                "validation_issue_id": issue_id,
                "flow_id": flow_id,
                "flow_type": flow_type,
                "indicator_id": indicator_id,
            }
        ],
    )

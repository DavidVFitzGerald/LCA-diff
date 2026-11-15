"""Bind the target's exact immutable values to its append-only promotion receipt."""

import hashlib
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from sqlalchemy import Connection, select

from lca_etl.publication_artifact import TABLES
from lca_etl.publication_models import OperationError


def canonical(value: Any) -> Any:
    if isinstance(value, Decimal):
        # normalize() uses the ambient Decimal precision and can round. Strip
        # insignificant fractional zeros without performing any arithmetic.
        result = format(value, "f")
        if "." in result:
            result = result.rstrip("0").rstrip(".")
        return "0" if value == 0 else result
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: canonical(item) for key, item in value.items()}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def fingerprint(
    connection: Connection,
    revision: UUID,
    release: UUID,
    rule_ids: list[str] | None = None,
) -> dict[str, Any]:
    if rule_ids is None:
        rule_ids = [
            str(item)
            for item in connection.scalars(
                select(db.resolution_rule.c.id)
                .where(db.resolution_rule.c.database_release_id == release)
                .order_by(db.resolution_rule.c.id)
            )
        ]
    hashes = {}
    for table in TABLES:
        if table is db.database_release:
            predicate = table.c.id == release
        elif table is db.release_revision:
            predicate = table.c.id == revision
        elif table is db.resolution_rule:
            predicate = table.c.id.in_([UUID(item) for item in rule_ids])
        elif table is db.flow:
            predicate = table.c.id.in_(
                select(db.process_flows.c.flow_id).where(db.process_flows.c.revision_id == revision)
            )
        else:
            predicate = table.c.revision_id == revision
        digest = hashlib.sha256()
        query = (
            select(table)
            .where(predicate)
            .order_by(*table.primary_key.columns)
            .execution_options(stream_results=True)
        )
        rows = connection.execute(query).mappings()
        try:
            for row in rows:
                data = dict(row)
                if table is db.release_revision:
                    # These are the only values intentionally changed by activation.
                    data.pop("status")
                    data.pop("published_at")
                digest.update(
                    (
                        json.dumps(canonical(data), sort_keys=True, ensure_ascii=False) + "\n"
                    ).encode()
                )
        finally:
            rows.close()
        hashes[table.name] = digest.hexdigest()
    return {"rule_ids": rule_ids, "tables": hashes}


def verify_fingerprint(
    connection: Connection, revision: UUID, release: UUID, receipt: dict[str, Any]
) -> None:
    expected = receipt.get("target_fingerprint")
    if (
        expected is None
        or fingerprint(connection, revision, release, expected["rule_ids"]) != expected
    ):
        raise OperationError("TARGET_CONTENT_CHANGED")

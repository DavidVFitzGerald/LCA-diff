"""Strict portable-candidate reader; measurements never pass through floats."""

import hashlib
import json
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from lca_shared.decimal import decimal
from sqlalchemy import DateTime, Numeric, Table, Uuid

from lca_etl.artifact import verify_artifact
from lca_etl.intake import sha256
from lca_etl.object_store import safe_relative
from lca_etl.publication_models import OperationError

TABLES = tuple(
    getattr(db, name)
    for name in (
        "database_release",
        "release_revision",
        "import_run",
        "source_object",
        "resolution_rule",
        "validation_issue",
        "flow",
        "process",
        "process_flows",
        "flow_provenance",
        "impact_method",
        "impact_indicator",
        "lcia_score",
        "process_warning",
    )
)
REPORTS = {
    "run.json",
    "validation_issues.csv",
    "lcia_workbook_issues.csv",
    "lcia_header_issues.csv",
    "process_match_report.csv",
    "score_basis_report.csv",
    "excluded_processes.csv",
    "aggregation_report.csv",
    "release_manifest.json",
    "summary.md",
}


def invalid_constant(value: str) -> None:
    raise OperationError("NONFINITE_ARTIFACT_VALUE")


class Candidate:
    def __init__(self, path: Path) -> None:
        self.path = path.resolve()
        self.payload = verify_artifact(self.path)
        self.digest = sha256(self.path)
        self.release = UUID(self.payload["release_id"])
        self.revision = UUID(self.payload["revision_id"])
        self.run = UUID(self.payload["run_id"])
        self.tables = {item["name"]: item for item in self.payload["tables"]}
        if (
            len(self.tables) != len(self.payload["tables"])
            or set(self.tables) != {table.name for table in TABLES}
            or self.payload.get("readiness", {}).get("status") != "ready"
            or self.payload["readiness"].get("unresolved_critical") != 0
        ):
            raise OperationError("ARTIFACT_CONTRACT_INVALID")
        if any(
            self.tables[name]["row_count"] != 1
            for name in ("database_release", "release_revision", "import_run")
        ):
            raise OperationError("ARTIFACT_CARDINALITY_INVALID")
        reports = {
            item["path"].removeprefix("reports/")
            for item in self.payload["objects"]
            if item.get("kind") == "reports"
        }
        if not reports >= REPORTS:
            raise OperationError("ARTIFACT_REPORTS_MISSING")
        for item in self.payload["tables"] + self.payload["objects"]:
            safe_relative(item["path"])
        self.source_map: dict[str, dict[str, Any]] = {}
        for item in self.payload["objects"]:
            if item.get("kind") == "source":
                key = str(UUID(item["source_object_id"]))
                if key in self.source_map:
                    raise OperationError("ARTIFACT_SOURCE_DUPLICATED")
                self.source_map[key] = item
        if len(self.source_map) != self.tables["source_object"]["row_count"]:
            raise OperationError("ARTIFACT_SOURCE_BINDING_INVALID")

    def rows(self, table: Table) -> Iterator[dict[str, Any]]:
        descriptor = self.tables[table.name]
        digest = hashlib.sha256()
        count = 0
        with (self.path.parent / descriptor["path"]).open("rb") as stream:
            for line in stream:
                digest.update(line)
                row = json.loads(line, parse_constant=invalid_constant)
                if not isinstance(row, dict) or set(row) != set(table.c.keys()):
                    raise OperationError("ARTIFACT_ROW_INVALID")
                for column in table.c:
                    value = row[column.name]
                    if value is None:
                        if not column.nullable:
                            raise OperationError("ARTIFACT_ROW_INVALID")
                    elif isinstance(column.type, Numeric):
                        if not isinstance(value, str):
                            raise OperationError("MEASUREMENTS_REQUIRE_STRINGS")
                        row[column.name] = decimal(value)
                    elif isinstance(column.type, Uuid):
                        row[column.name] = UUID(value)
                    elif isinstance(column.type, DateTime):
                        row[column.name] = datetime.fromisoformat(value)
                if "revision_id" in row and row["revision_id"] != self.revision:
                    raise OperationError("ARTIFACT_REVISION_MISMATCH")
                if table is db.release_revision and (
                    row["id"] != self.revision
                    or row["database_release_id"] != self.release
                    or row["status"] != "ready"
                    or row["published_at"] is not None
                    or row["manifest_sha256"] != self.payload["manifest_sha256"]
                ):
                    raise OperationError("ARTIFACT_REVISION_INVALID")
                if table is db.database_release and row["id"] != self.release:
                    raise OperationError("ARTIFACT_RELEASE_MISMATCH")
                if table is db.resolution_rule and row["database_release_id"] != self.release:
                    raise OperationError("ARTIFACT_RULE_SCOPE_INVALID")
                if table is db.flow_provenance and row["stg_bafu_exchange_id"] is not None:
                    raise OperationError("ARTIFACT_REQUIRES_LOCAL_STAGING")
                count += 1
                yield row
        if count != descriptor["row_count"] or digest.hexdigest() != descriptor["sha256"]:
            raise OperationError("ARTIFACT_CHANGED_DURING_LOAD")

    def receipt(self) -> dict[str, Any]:
        return {"manifest": self.payload, "manifest_sha256": self.digest}

"""Portable, checksummed candidate transfer contract consumed by B4 promotion."""

import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse
from uuid import UUID

from lca_shared.db import schema as db
from sqlalchemy import Connection, select

from lca_etl.intake import immutable_copy, sha256, write_json
from lca_etl.models import Manifest


def json_value(value: Any) -> Any:
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Unsupported artifact value {type(value).__name__}")


def build_artifact(
    connection: Connection,
    release_id: UUID,
    revision_id: UUID,
    run_id: UUID,
    manifest: Manifest,
    prepared: dict[str, Any],
) -> Path:
    directory = Path(prepared["directory"])
    artifact = directory / "artifact"
    artifact.mkdir(parents=True, exist_ok=True)
    objects = []
    source_map = {}
    for source in connection.execute(
        select(db.source_object)
        .where(db.source_object.c.revision_id == revision_id)
        .order_by(db.source_object.c.relative_path)
    ).mappings():
        relative = Path("raw") / source["relative_path"]
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Source path cannot escape the promotion artifact")
        original = Path(unquote(urlparse(source["storage_uri"]).path))
        copied = immutable_copy(original, artifact / relative)
        if copied["sha256"] != source["sha256"] or copied["byte_size"] != source["byte_size"]:
            raise ValueError("Archived source bytes no longer match the candidate")
        objects.append(
            {
                "path": relative.as_posix(),
                "sha256": copied["sha256"],
                "byte_size": copied["byte_size"],
                "kind": "source",
                "source_object_id": str(source["id"]),
                "source_relative_path": source["relative_path"],
            }
        )
        source_map[str(source["id"])] = relative.as_posix()
    for group in ("reports", "rules", "archives"):
        root = directory / group
        if not root.exists():
            continue
        for archived_path in sorted(path for path in root.rglob("*") if path.is_file()):
            relative = archived_path.relative_to(directory)
            copied = immutable_copy(archived_path, artifact / relative)
            objects.append(
                {
                    "path": relative.as_posix(),
                    "sha256": copied["sha256"],
                    "byte_size": copied["byte_size"],
                    "kind": group,
                }
            )
    selections = [
        (db.database_release, db.database_release.c.id == release_id),
        (db.release_revision, db.release_revision.c.id == revision_id),
        (db.import_run, db.import_run.c.id == run_id),
        (db.source_object, db.source_object.c.revision_id == revision_id),
        (db.resolution_rule, db.resolution_rule.c.database_release_id == release_id),
        (db.validation_issue, db.validation_issue.c.revision_id == revision_id),
        (
            db.flow,
            db.flow.c.id.in_(
                select(db.process_flows.c.flow_id).where(
                    db.process_flows.c.revision_id == revision_id
                )
            ),
        ),
        (db.process, db.process.c.revision_id == revision_id),
        (db.process_flows, db.process_flows.c.revision_id == revision_id),
        (db.flow_provenance, db.flow_provenance.c.revision_id == revision_id),
        (db.impact_method, db.impact_method.c.revision_id == revision_id),
        (db.impact_indicator, db.impact_indicator.c.revision_id == revision_id),
        (db.lcia_score, db.lcia_score.c.revision_id == revision_id),
        (db.process_warning, db.process_warning.c.revision_id == revision_id),
    ]
    tables = []
    for table, predicate in selections:
        path = artifact / "tables" / f"{table.name}.jsonl"
        path.parent.mkdir(exist_ok=True)
        count = 0
        with path.open("w", encoding="utf-8") as stream:
            query = (
                select(table)
                .where(predicate)
                .order_by(*table.primary_key.columns)
                .execution_options(stream_results=True)
            )
            for result in connection.execute(query).mappings():
                row = dict(result)
                if table is db.flow_provenance:
                    row["stg_bafu_exchange_id"] = None
                if table is db.source_object:
                    # Portable archive reference; B4 rewrites this only in an
                    # unpublished target after independently checking object hash.
                    row["storage_uri"] = "artifact://" + source_map[str(row["id"])]
                stream.write(
                    json.dumps(row, sort_keys=True, ensure_ascii=False, default=json_value) + "\n"
                )
                count += 1
        tables.append(
            {
                "name": table.name,
                "path": path.relative_to(artifact).as_posix(),
                "sha256": sha256(path),
                "byte_size": path.stat().st_size,
                "row_count": count,
            }
        )
    payload = {
        "format_version": 1,
        "artifact_type": "lca-release-candidate",
        "release_id": str(release_id),
        "revision_id": str(revision_id),
        "run_id": str(run_id),
        "manifest_sha256": prepared["manifest_sha256"],
        "representative": prepared["representative"],
        "release": manifest.release.model_dump(mode="json"),
        "pipeline_version": "0.1.0",
        "tables": tables,
        "objects": objects,
    }
    write_json(artifact / "manifest.json", payload)
    (artifact / "manifest.sha256").write_text(
        sha256(artifact / "manifest.json") + "  manifest.json\n"
    )
    return artifact / "manifest.json"

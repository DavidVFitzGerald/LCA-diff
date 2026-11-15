"""Source staging and candidate lifecycle. No operation in this module publishes."""

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from lca_shared.logging import event
from sqlalchemy import Connection, create_engine, select
from sqlalchemy.engine import Engine

from lca_etl.intake import load_rules, prepare, sha256, write_json, xml_files
from lca_etl.models import Manifest
from lca_etl.store import insert_rows, issue, register, stable
from lca_etl.workbook import cells51, headers, rows


def engine() -> Engine:
    return create_engine(os.environ["LCA_DATABASE_URL"], pool_pre_ping=True, hide_parameters=True)


def source(
    connection: Connection, revision_id: UUID, path: Path, relative_path: str, kind: str
) -> UUID:
    object_id = stable(revision_id, "source", relative_path)
    insert_rows(
        connection,
        db.source_object,
        [
            {
                "id": object_id,
                "revision_id": revision_id,
                "relative_path": relative_path,
                "sha256": sha256(path),
                "byte_size": path.stat().st_size,
                "kind": kind,
                "storage_uri": path.as_uri(),
            }
        ],
    )
    return object_id


def stage_xml(
    connection: Connection, revision_id: UUID, run_id: UUID, prepared: dict[str, Any], output: Path
) -> None:
    root = Path(prepared["xml_directory"])
    for part in sorted(output.glob("part-*")):
        with part.open() as stream:
            for line in stream:
                record = json.loads(line)
                path = Path(record["path"])
                relative = "xml/" + path.relative_to(root).as_posix()
                object_id = source(connection, revision_id, path, relative, "process_xml")
                if sha256(path) != record["sha256"] or path.stat().st_size != record["byte_size"]:
                    raise ValueError("XML changed between extraction and source registration")
                if record["error"] is not None:
                    issue(
                        connection,
                        revision_id,
                        run_id,
                        code=record["error"],
                        stage="xml",
                        severity="CRITICAL",
                        source_object_id=object_id,
                        message="XML could not be safely extracted; original bytes retained",
                    )
                for extracted in record["processes"]:
                    process_id = stable(object_id, "process", extracted["extraction_ordinal"])
                    insert_rows(
                        connection,
                        db.stg_bafu_process,
                        [
                            {
                                "id": process_id,
                                "revision_id": revision_id,
                                "source_object_id": object_id,
                                "dataset_number": extracted["dataset_number"],
                                "reference_attributes": extracted["reference_attributes"],
                                "geography": extracted["geography"],
                                "source_metadata": extracted["source_metadata"],
                                "file_uuid": None,
                                "extraction_ordinal": extracted["extraction_ordinal"],
                            }
                        ],
                    )
                    insert_rows(
                        connection,
                        db.stg_bafu_exchange,
                        (
                            {
                                **{
                                    key: value
                                    for key, value in exchange.items()
                                    if key != "group_count"
                                },
                                "original": {
                                    **exchange["original"],
                                    "group_count": exchange["group_count"],
                                },
                                "id": stable(process_id, "exchange", exchange["exchange_ordinal"]),
                                "revision_id": revision_id,
                                "stg_bafu_process_id": process_id,
                            }
                            for exchange in extracted["exchanges"]
                        ),
                    )


def stage_workbook(
    connection: Connection,
    revision_id: UUID,
    run_id: UUID,
    manifest: Manifest,
    prepared: dict[str, Any],
) -> None:
    workbook = Path(prepared["workbook"])
    object_id = source(connection, revision_id, workbook, "scores/" + workbook.name, "lcia_xlsx")
    iterator = iter(rows(workbook, manifest.sources.lcia_sheet))
    first: dict[str, dict[str, Any]] = {}
    second: dict[str, dict[str, Any]] = {}
    buffered = None
    for row_number, cells in iterator:
        if row_number == 1:
            first = cells
        elif row_number == 2:
            second = cells
        elif row_number >= 3:
            buffered = (row_number, cells)
            break
    columns, anomalies = headers(first, second)
    for anomaly in anomalies:
        issue(
            connection,
            revision_id,
            run_id,
            code=anomaly["code"],
            stage="workbook_header",
            severity="CRITICAL",
            source_object_id=object_id,
            message=json.dumps(anomaly, sort_keys=True, ensure_ascii=False),
        )
    insert_rows(
        connection,
        db.stg_bafu_lcia_column,
        (
            {
                **{key: value for key, value in column.items() if key != "indicator_name"},
                "id": stable(revision_id, "column", column["column_index"]),
                "revision_id": revision_id,
                "source_object_id": object_id,
            }
            for column in columns
        ),
    )

    def staged(row_number: int, cells: dict[str, dict[str, Any]]) -> dict[str, Any]:
        original = cells51(cells)
        return {
            "id": stable(object_id, "row", row_number),
            "revision_id": revision_id,
            "source_object_id": object_id,
            "sheet_name": manifest.sources.lcia_sheet,
            "excel_row": row_number,
            "product": original["A"]["value"],
            "category": original["B"]["value"],
            "subcategory": original["C"]["value"],
            "unit": original["D"]["value"],
            "original_cells": original,
            "scores": {key: original[key] for key in tuple(original)[4:]},
            "reconciliation_state": "unmatched",
        }

    def source_rows() -> Any:
        if buffered is not None:
            yield staged(*buffered)
        for number, cells in iterator:
            if number >= 3:
                yield staged(number, cells)

    insert_rows(connection, db.stg_bafu_lcia_row, source_rows())


def _execute(manifest: Manifest, *, use_spark: bool = True) -> dict[str, Any]:
    """Portable implementation also used by Airflow tasks.

    `use_spark=False` is explicit unit-test support; normal CLI/DAG execution
    always uses Spark and real integration is mandatory for the B3 gate.
    """
    from lca_etl.artifact import build_artifact, verify_artifact
    from lca_etl.harmonize import harmonize
    from lca_etl.reconcile import reconcile
    from lca_etl.reports import reports

    prepared = prepare(manifest)
    sets = load_rules(manifest)
    database = engine()
    directory = Path(prepared["directory"])
    with database.begin() as connection:
        release_id, revision_id, run_id = register(connection, manifest, prepared, sets)
        revision = (
            connection.execute(
                select(db.release_revision).where(db.release_revision.c.id == revision_id)
            )
            .mappings()
            .one()
        )
        completed = revision["status"] in ("ready", "published", "superseded")
        if not completed:
            source(
                connection,
                revision_id,
                directory / "frozen_manifest.json",
                "manifest/frozen_manifest.json",
                "manifest",
            )
    if completed:
        if revision["status"] == "ready":
            artifact = directory / "artifact" / "manifest.json"
            if artifact.exists():
                verify_artifact(artifact)
            else:
                with database.connect().execution_options(
                    isolation_level="REPEATABLE READ"
                ) as connection:
                    build_artifact(connection, release_id, revision_id, run_id, manifest, prepared)
        database.dispose()
        return {
            "revision_id": str(revision_id),
            "run_id": str(run_id),
            "status": revision["status"],
            "directory": str(directory),
            "reused": True,
        }
    event("IMPORT_STARTED", run_id=run_id, revision_id=revision_id)
    error = None
    try:
        with database.begin() as connection:
            connection.execute(
                db.import_run.update().where(db.import_run.c.id == run_id).values(status="running")
            )
        paths = list(xml_files(Path(prepared["xml_directory"])))
        if manifest.sample_process_limit is not None:
            paths = paths[: manifest.sample_process_limit]
        if not paths:
            raise ValueError("XML source directory is empty")
        output = directory / "spark-extracted"
        if use_spark and output.exists() and not (output / "_SUCCESS").exists():
            from uuid import uuid4

            failed_output = directory / "failed-extractions" / str(uuid4())
            failed_output.parent.mkdir(exist_ok=True)
            output.rename(failed_output)
        if not output.exists():
            if use_spark:
                from lca_etl.spark import extract

                extract([str(path) for path in paths], output, max_bytes=manifest.max_xml_bytes)
            else:
                from lca_etl.xml import parse_xml

                output.mkdir()
                with (output / "part-00000").open("w") as stream:
                    for path in paths:
                        result = parse_xml(path.read_bytes(), max_bytes=manifest.max_xml_bytes)
                        result.update(
                            {
                                "path": str(path),
                                "sha256": sha256(path),
                                "byte_size": path.stat().st_size,
                            }
                        )
                        stream.write(json.dumps(result) + "\n")
        with database.begin() as connection:
            stage_xml(connection, revision_id, run_id, prepared, output)
        with database.begin() as connection:
            stage_workbook(connection, revision_id, run_id, manifest, prepared)
        with database.begin() as connection:
            harmonize(connection, release_id, revision_id, run_id, manifest, sets[0])
        with database.begin() as connection:
            reconcile(connection, release_id, revision_id, run_id, manifest, sets)
            # A successful retry resolves the operational failure event without
            # deleting its history or auto-resolving scientific source defects.
            connection.execute(
                db.validation_issue.update()
                .where(
                    db.validation_issue.c.revision_id == revision_id,
                    db.validation_issue.c.code == "IMPORT_FAILED",
                )
                .values(resolution_state="resolved", resolved_at=datetime.now(UTC))
            )
    except Exception as exception:
        error = type(exception).__name__
        import traceback

        write_json(
            directory / "failure.json",
            {
                "error_type": error,
                "frames": [
                    {"file": frame.filename, "line": frame.lineno, "function": frame.name}
                    for frame in traceback.extract_tb(exception.__traceback__)
                ],
            },
        )
        with database.begin() as connection:
            issue(
                connection,
                revision_id,
                run_id,
                code="IMPORT_FAILED",
                stage="pipeline",
                severity="CRITICAL",
                message=f"Import stage failed ({error}); inspect private artifacts and retained originals",
            )
    finally:
        with database.begin() as connection:
            summary = reports(connection, revision_id, run_id, manifest, prepared)
            status = "rejected" if error or summary["unresolved_critical"] else "ready"
            connection.execute(
                db.release_revision.update()
                .where(db.release_revision.c.id == revision_id)
                .values(status=status)
            )
            connection.execute(
                db.import_run.update()
                .where(db.import_run.c.id == run_id)
                .values(status=status, finished_at=datetime.now(UTC), counts=summary)
            )
        result = {
            "revision_id": str(revision_id),
            "run_id": str(run_id),
            "status": status,
            "directory": str(directory),
            "representative": prepared["representative"],
            "counts": summary,
        }
        write_json(directory / "result.json", result)
        if status == "ready":
            with database.connect().execution_options(
                isolation_level="REPEATABLE READ"
            ) as connection:
                build_artifact(connection, release_id, revision_id, run_id, manifest, prepared)
        event("IMPORT_FINISHED", run_id=run_id, revision_id=revision_id)
        database.dispose()
    return result


def execute(manifest: Manifest, *, use_spark: bool = True) -> dict[str, Any]:
    """Serialize retries for one manifest across extraction and DB transactions."""
    import hashlib

    from sqlalchemy import text

    from lca_etl.intake import canonical_json

    lock_key = hashlib.sha256(canonical_json(manifest.model_dump(mode="json"))).hexdigest()
    lock_database = engine()
    try:
        with lock_database.connect() as lease:
            acquired = lease.scalar(
                text("SELECT pg_try_advisory_lock(hashtextextended(:key,0))"), {"key": lock_key}
            )
            if not acquired:
                raise RuntimeError(
                    "This frozen input is already being imported; inspect its run report"
                )
            try:
                return _execute(manifest, use_spark=use_spark)
            finally:
                lease.execute(
                    text("SELECT pg_advisory_unlock(hashtextextended(:key,0))"), {"key": lock_key}
                )
    finally:
        lock_database.dispose()

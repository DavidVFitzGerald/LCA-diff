"""Private deterministic operator artifacts, including every flagged original row."""

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from sqlalchemy import Connection, func, select, text

from lca_etl.intake import write_json
from lca_etl.models import Manifest
from lca_etl.store import issue
from lca_etl.workbook import LETTERS


def csv_file(path: Path, fields: list[str], records: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fields, extrasaction="ignore", lineterminator="\r\n")
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    key: json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
                    if isinstance(value, (dict, list))
                    else value
                    for key, value in record.items()
                }
            )


def gate(connection: Connection, revision_id: UUID, run_id: UUID) -> None:
    checks = {
        "CANDIDATE_PROVENANCE_INVALID": """
          SELECT count(*) FROM process_flows pf LEFT JOIN (
            SELECT process_flow_id,count(*) n,sum(normalized_input_amount) amount
            FROM flow_provenance WHERE revision_id=:revision GROUP BY process_flow_id
          ) p ON p.process_flow_id=pf.id
          WHERE pf.revision_id=:revision AND (p.n IS NULL OR p.amount IS DISTINCT FROM pf.amount)
        """,
        "CANDIDATE_REFERENCE_INVALID": """
          SELECT count(*) FROM process p WHERE p.revision_id=:revision AND (
            p.reference_amount<=0 OR
            (SELECT count(*) FROM process_flows pf WHERE pf.process_id=p.id AND pf.flow_type='Reference')<>1 OR
            EXISTS (SELECT 1 FROM process_flows pf JOIN flow f ON f.id=pf.flow_id
              WHERE pf.process_id=p.id AND pf.flow_type='Reference'
                AND (pf.amount<>p.reference_amount OR f.unit<>p.reference_unit OR f.name<>p.reference_name)))
        """,
        "CANDIDATE_SCORE_BASIS_INVALID": """
          SELECT count(*) FROM lcia_score s JOIN process p ON p.id=s.process_id
          LEFT JOIN resolution_rule r ON r.id=s.resolution_rule_id
          JOIN release_revision rv ON rv.id=p.revision_id
          WHERE s.revision_id=:revision AND s.status='valid' AND (
            s.original_amount IS NULL OR s.original_basis_quantity IS NULL OR s.original_basis_unit IS NULL
            OR s.target_basis_quantity IS NULL OR s.target_basis_unit IS NULL OR s.conversion_factor IS NULL
            OR s.source_object_id IS NULL OR s.source_row IS NULL OR s.source_column IS NULL
            OR s.target_basis_quantity<>p.reference_amount OR s.target_basis_unit<>p.reference_unit
            OR s.amount<>s.original_amount::numeric*s.conversion_factor
            OR s.original_basis_quantity<=0 OR s.target_basis_quantity<=0 OR s.conversion_factor<=0
            OR (s.resolution_rule_id IS NULL AND (s.original_basis_quantity<>s.target_basis_quantity
                OR s.original_basis_unit<>s.target_basis_unit OR s.conversion_factor<>1))
            OR (s.resolution_rule_id IS NOT NULL AND (NOT r.approved OR r.approved_by IS NULL
                OR r.database_release_id<>rv.database_release_id
                OR r.resolution->>'source_unit' IS DISTINCT FROM s.original_basis_unit
                OR r.resolution->>'target_unit' IS DISTINCT FROM s.target_basis_unit
                OR (r.resolution->>'source_quantity')::numeric IS DISTINCT FROM s.original_basis_quantity
                OR (r.resolution->>'target_quantity')::numeric IS DISTINCT FROM s.target_basis_quantity
                OR (r.resolution->>'factor')::numeric IS DISTINCT FROM s.conversion_factor)))
        """,
    }
    for code, query in checks.items():
        if connection.scalar(text(query), {"revision": revision_id}):
            issue(
                connection,
                revision_id,
                run_id,
                code=code,
                stage="readiness",
                severity="CRITICAL",
                message="Candidate failed a reference, exact-provenance or verified-score invariant",
            )
        else:
            connection.execute(
                db.validation_issue.update()
                .where(
                    db.validation_issue.c.revision_id == revision_id,
                    db.validation_issue.c.code == code,
                )
                .values(resolution_state="resolved", resolved_at=func.now())
            )
    if not connection.scalar(
        select(func.count()).select_from(db.process).where(db.process.c.revision_id == revision_id)
    ):
        issue(
            connection,
            revision_id,
            run_id,
            code="CANDIDATE_EMPTY",
            stage="readiness",
            severity="CRITICAL",
            message="No eligible process exists in the candidate",
        )
    else:
        connection.execute(
            db.validation_issue.update()
            .where(
                db.validation_issue.c.revision_id == revision_id,
                db.validation_issue.c.code == "CANDIDATE_EMPTY",
            )
            .values(resolution_state="resolved", resolved_at=func.now())
        )


def reports(
    connection: Connection,
    revision_id: UUID,
    run_id: UUID,
    manifest: Manifest,
    prepared: dict[str, Any],
) -> dict[str, Any]:
    gate(connection, revision_id, run_id)
    directory = Path(prepared["directory"]) / "reports"
    directory.mkdir(parents=True, exist_ok=True)
    issues = [
        dict(row)
        for row in connection.execute(
            select(db.validation_issue)
            .where(db.validation_issue.c.revision_id == revision_id)
            .order_by(
                db.validation_issue.c.source_object_id,
                db.validation_issue.c.spreadsheet_row,
                db.validation_issue.c.process_source_id,
                db.validation_issue.c.exchange_ordinal,
                db.validation_issue.c.code,
                db.validation_issue.c.id,
            )
        ).mappings()
    ]
    objects = {
        row["id"]: dict(row)
        for row in connection.execute(
            select(db.source_object).where(db.source_object.c.revision_id == revision_id)
        ).mappings()
    }
    severity = {"INFO": 0, "WARNING": 1, "ERROR": 2, "CRITICAL": 3}
    by_row: dict[tuple[UUID, int], list[dict[str, Any]]] = defaultdict(list)
    for item in issues:
        if item["spreadsheet_row"] is not None and item["source_object_id"] is not None:
            by_row[(item["source_object_id"], item["spreadsheet_row"])].append(item)
    columns = {
        row["column_letter"]: row["indicator_heading"]
        for row in connection.execute(
            select(db.stg_bafu_lcia_column).where(
                db.stg_bafu_lcia_column.c.revision_id == revision_id
            )
        ).mappings()
    }
    labels = {"A": "Product", "B": "Category", "C": "Sub-category", "D": "Unit", **columns}
    original_fields = [
        f"original_{column}_{labels.get(column) or 'column_' + column}" for column in LETTERS
    ]
    metadata_fields = [
        "source_file",
        "sheet_name",
        "excel_row_number",
        "severity",
        "resolution_status",
        "issue_codes",
        "issue_details",
        "candidate_dataset_numbers",
        "matched_dataset_numbers",
        "source_reference_quantity",
        "source_reference_unit",
        "target_reference_quantity",
        "target_reference_unit",
        "rule_ids",
        "rule_evidence",
        "conversion_factors",
        "conversion_direction",
        "processed_at",
        "original_cell_types",
    ]

    def workbook_issues() -> Any:
        query = (
            select(db.stg_bafu_lcia_row)
            .where(db.stg_bafu_lcia_row.c.revision_id == revision_id)
            .order_by(db.stg_bafu_lcia_row.c.excel_row)
        )
        for row in connection.execute(query.execution_options(stream_results=True)).mappings():
            row_issues = by_row.get((row["source_object_id"], row["excel_row"]), [])
            if not row_issues:
                continue
            scores = [
                dict(score)
                for score in connection.execute(
                    select(db.lcia_score, db.process.c.source_process_number)
                    .join(db.process, db.process.c.id == db.lcia_score.c.process_id)
                    .where(
                        db.lcia_score.c.revision_id == revision_id,
                        db.lcia_score.c.source_object_id == row["source_object_id"],
                        db.lcia_score.c.source_row == row["excel_row"],
                    )
                ).mappings()
            ]
            first = scores[0] if scores else {}
            rule_ids = sorted(
                {
                    str(item["resolution_rule_id"])
                    for item in row_issues
                    if item["resolution_rule_id"] is not None
                }
            )
            applied_rules = (
                list(
                    connection.execute(
                        select(db.resolution_rule).where(
                            db.resolution_rule.c.id.in_([UUID(value) for value in rule_ids])
                        )
                    ).mappings()
                )
                if rule_ids
                else []
            )
            record = {
                "source_file": objects[row["source_object_id"]]["relative_path"],
                "sheet_name": row["sheet_name"],
                "excel_row_number": row["excel_row"],
                "severity": max(
                    (item["severity"] for item in row_issues), key=lambda value: severity[value]
                ),
                "resolution_status": "unresolved"
                if any(item["resolution_state"] == "unresolved" for item in row_issues)
                else "resolved",
                "issue_codes": [item["code"] for item in row_issues],
                "issue_details": [item["message"] for item in row_issues],
                "candidate_dataset_numbers": row["scores"]
                .get("_reconciliation", {})
                .get("candidate_dataset_numbers", []),
                "matched_dataset_numbers": sorted(
                    {score["source_process_number"] for score in scores}
                ),
                "source_reference_quantity": first.get("original_basis_quantity"),
                "source_reference_unit": row["unit"],
                "target_reference_quantity": first.get("target_basis_quantity"),
                "target_reference_unit": first.get("target_basis_unit"),
                "rule_ids": rule_ids,
                "rule_evidence": [rule["evidence"] for rule in applied_rules],
                "conversion_factors": sorted(
                    {
                        str(score["conversion_factor"])
                        for score in scores
                        if score["conversion_factor"] is not None
                    }
                ),
                "conversion_direction": "source_workbook_to_xml_reference",
                "processed_at": min(item["created_at"] for item in row_issues),
                "original_cell_types": {
                    column: row["original_cells"][column]["type"] for column in LETTERS
                },
            }
            record.update(
                {
                    field: row["original_cells"].get(column, {}).get("value")
                    for field, column in zip(original_fields, LETTERS, strict=True)
                }
            )
            yield record

    csv_file(
        directory / "lcia_workbook_issues.csv", metadata_fields + original_fields, workbook_issues()
    )
    csv_file(directory / "validation_issues.csv", list(db.validation_issue.c.keys()), issues)
    csv_file(
        directory / "lcia_header_issues.csv",
        [
            "source_object_id",
            "code",
            "severity",
            "column",
            "column_index",
            "original_row1",
            "original_row2",
            "message",
        ],
        [
            {**item, **json.loads(item["message"])}
            for item in issues
            if item["stage"] == "workbook_header"
        ],
    )
    csv_file(
        directory / "excluded_processes.csv",
        ["process_source_id", "source_object_id", "code", "message"],
        [item for item in issues if item["resolution_state"] == "excluded"],
    )
    match_records = [
        {
            "kind": "workbook_row",
            "spreadsheet_row": row["excel_row"],
            "source_object_id": row["source_object_id"],
            "resolution_state": row["reconciliation_state"],
            "message": row["scores"].get("_reconciliation", {}),
        }
        for row in connection.execute(
            select(db.stg_bafu_lcia_row)
            .where(db.stg_bafu_lcia_row.c.revision_id == revision_id)
            .order_by(db.stg_bafu_lcia_row.c.excel_row)
        ).mappings()
    ]
    match_records.extend(
        {**item, "kind": "xml_process"}
        for item in issues
        if item["code"] == "XML_WITHOUT_SCORE_ROW"
    )
    csv_file(
        directory / "process_match_report.csv",
        [
            "kind",
            "process_source_id",
            "spreadsheet_row",
            "source_object_id",
            "code",
            "resolution_state",
            "message",
        ],
        match_records,
    )
    csv_file(
        directory / "score_basis_report.csv",
        list(db.lcia_score.c.keys()),
        (
            dict(row)
            for row in connection.execute(
                select(db.lcia_score)
                .where(
                    db.lcia_score.c.revision_id == revision_id,
                    (db.lcia_score.c.status == "unresolved_basis")
                    | db.lcia_score.c.resolution_rule_id.is_not(None),
                )
                .order_by(db.lcia_score.c.process_id, db.lcia_score.c.indicator_id)
            ).mappings()
        ),
    )
    aggregation_records = []
    for aggregate in connection.execute(
        text(
            "SELECT pf.id,p.source_process_number,pf.flow_id,pf.flow_type,pf.amount FROM process_flows pf JOIN process p ON p.id=pf.process_id JOIN flow_provenance fp ON fp.process_flow_id=pf.id WHERE pf.revision_id=:revision GROUP BY pf.id,p.source_process_number HAVING count(fp.id)>1 ORDER BY p.source_process_number,pf.flow_id,pf.flow_type"
        ),
        {"revision": revision_id},
    ).mappings():
        provenance = [
            dict(item)
            for item in connection.execute(
                select(db.flow_provenance)
                .where(db.flow_provenance.c.process_flow_id == aggregate["id"])
                .order_by(
                    db.flow_provenance.c.source_object_id, db.flow_provenance.c.exchange_ordinal
                )
            ).mappings()
        ]
        aggregation_records.append({**aggregate, "constituents": provenance})
    csv_file(
        directory / "aggregation_report.csv",
        ["id", "source_process_number", "flow_id", "flow_type", "amount", "constituents"],
        aggregation_records,
    )
    counts: dict[str, Any] = {}
    for table in (
        db.source_object,
        db.stg_bafu_process,
        db.stg_bafu_exchange,
        db.stg_bafu_lcia_row,
        db.process,
        db.process_flows,
        db.flow_provenance,
        db.lcia_score,
    ):
        counts[table.name] = connection.scalar(
            select(func.count()).select_from(table).where(table.c.revision_id == revision_id)
        )
    counts["issue_codes"] = dict(Counter(item["code"] for item in issues))
    counts["unresolved_critical"] = sum(
        item["severity"] == "CRITICAL" and item["resolution_state"] == "unresolved"
        for item in issues
    )
    counts["excluded_processes"] = len(
        {
            (item["source_object_id"], item["process_source_id"])
            for item in issues
            if item["resolution_state"] == "excluded"
        }
    )
    counts["score_status"] = {
        row[0]: row[1]
        for row in connection.execute(
            select(db.lcia_score.c.status, func.count())
            .where(db.lcia_score.c.revision_id == revision_id)
            .group_by(db.lcia_score.c.status)
        ).all()
    }
    counts["representative"] = prepared["representative"]
    counts["workbook_row_states"] = {
        row[0]: row[1]
        for row in connection.execute(
            select(db.stg_bafu_lcia_row.c.reconciliation_state, func.count())
            .where(db.stg_bafu_lcia_row.c.revision_id == revision_id)
            .group_by(db.stg_bafu_lcia_row.c.reconciliation_state)
        ).all()
    }
    counts["matched_workbook_rows"] = counts["workbook_row_states"].get("matched", 0)
    counts["unmatched_workbook_rows"] = (
        counts["stg_bafu_lcia_row"] - counts["matched_workbook_rows"]
    )
    counts["reference_resolutions"] = {
        row[0]: row[1]
        for row in connection.execute(
            select(db.stg_bafu_reference_resolution.c.status, func.count())
            .where(db.stg_bafu_reference_resolution.c.revision_id == revision_id)
            .group_by(db.stg_bafu_reference_resolution.c.status)
        ).all()
    }
    counts["converted_scores"] = connection.scalar(
        select(func.count())
        .select_from(db.lcia_score)
        .where(
            db.lcia_score.c.revision_id == revision_id,
            db.lcia_score.c.status == "valid",
            db.lcia_score.c.resolution_rule_id.is_not(None),
        )
    )
    counts["aggregation_groups"] = len(aggregation_records)
    counts["candidate_status"] = "rejected" if counts["unresolved_critical"] else "ready"
    counts["candidate_published"] = (
        connection.scalar(
            select(db.release_revision.c.published_at).where(
                db.release_revision.c.id == revision_id
            )
        )
        is not None
    )
    publication = connection.execute(
        select(db.release_publication.c.active_revision_id).where(
            db.release_publication.c.database_release_id
            == select(db.release_revision.c.database_release_id)
            .where(db.release_revision.c.id == revision_id)
            .scalar_subquery()
        )
    ).scalar_one_or_none()
    counts["active_revision_id"] = str(publication) if publication is not None else None
    counts["candidate_active"] = publication == revision_id
    counts["revision_id"] = str(revision_id)
    counts["run_id"] = str(run_id)
    frozen = json.loads((Path(prepared["directory"]) / "frozen_manifest.json").read_bytes())
    write_json(
        directory / "release_manifest.json",
        {
            "manifest_sha256": prepared["manifest_sha256"],
            "release": manifest.release.model_dump(mode="json"),
            "inputs": frozen["inputs"],
            "rules": frozen["rules"],
            "counts": counts,
        },
    )
    write_json(directory / "run.json", counts)
    (directory / "summary.md").write_text(
        "# Private import report\n\n"
        + "\n".join(f"- {name}: {value}" for name, value in counts.items())
        + "\n\nCSV files retain original provider cells and may contain spreadsheet formulas. Treat them as data; original bytes and cell types remain in staging/archive.\n",
        encoding="utf-8",
    )
    return counts

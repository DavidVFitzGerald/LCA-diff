"""Conservative workbook association and approved reference-basis reconciliation."""

from collections import Counter, defaultdict
from decimal import Decimal
from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from lca_shared.decimal import decimal, exact_product
from sqlalchemy import Connection, select

from lca_etl.models import Manifest, Rule, RuleSet
from lca_etl.store import insert_rows, issue, stable, warning
from lca_etl.workbook import UNIT


def key(product: Any, category: Any, subcategory: Any) -> tuple[str, str, str]:
    # Conservative whitespace trimming only. No fuzzy/name token/row-order join.
    return tuple(str(value or "").strip() for value in (product, category, subcategory))  # type: ignore[return-value]


def basis_rule(
    rules: tuple[RuleSet, RuleSet],
    number: str,
    row_unit: str | None,
    target_amount: Decimal,
    target_unit: str,
) -> Rule | None:
    matches = [
        rule
        for ruleset in rules
        for rule in ruleset.rules
        if (
            rule.approved
            and rule.rule_type in ("score_basis", "unit_alias")
            and rule.process_number in (None, number)
            and rule.source_unit == row_unit
            and rule.target_quantity == target_amount
            and rule.target_unit == target_unit
        )
    ]
    if len(matches) > 1:
        raise ValueError("Ambiguous approved score-basis rules")
    return matches[0] if matches else None


def reconcile(
    connection: Connection,
    release_id: UUID,
    revision_id: UUID,
    run_id: UUID,
    manifest: Manifest,
    rule_sets: tuple[RuleSet, RuleSet],
) -> None:
    for ruleset in rule_sets:
        for rule in ruleset.rules:
            if rule.release_version != manifest.release.release_version:
                raise ValueError("Resolution rule release scope does not match this revision")
            stored_release = connection.scalar(
                select(db.resolution_rule.c.database_release_id).where(
                    db.resolution_rule.c.id == rule.id
                )
            )
            if stored_release != release_id:
                raise ValueError("Stored rule release scope does not match this revision")
    processes = [
        dict(row)
        for row in connection.execute(
            select(db.process).where(db.process.c.revision_id == revision_id)
        ).mappings()
    ]
    by_number = {row["source_process_number"]: row for row in processes}
    candidates: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    excluded_keys = set()
    excluded_numbers = set(
        connection.scalars(
            select(db.validation_issue.c.process_source_id).where(
                db.validation_issue.c.revision_id == revision_id,
                db.validation_issue.c.code == "MULTI_OUTPUT_EXCLUDED",
            )
        )
    )
    for excluded in connection.execute(
        select(db.stg_bafu_process).where(db.stg_bafu_process.c.revision_id == revision_id)
    ).mappings():
        if excluded["dataset_number"] in excluded_numbers:
            attributes = excluded["reference_attributes"]
            excluded_keys.add(
                key(
                    f"{attributes.get('name', '')} - {excluded['geography'] or ''}",
                    attributes.get("category"),
                    attributes.get("subCategory"),
                )
            )
    for process in processes:
        values = {
            f"{process['name']} - {process['geography']}",
            f"{process['reference_name']} - {process['geography']}",
        }
        for product in values:
            candidates[key(product, process["category"], process["subcategory"])].append(process)
    staged_rows = [
        dict(row)
        for row in connection.execute(
            select(
                db.stg_bafu_lcia_row.c.id,
                db.stg_bafu_lcia_row.c.source_object_id,
                db.stg_bafu_lcia_row.c.excel_row,
                db.stg_bafu_lcia_row.c.product,
                db.stg_bafu_lcia_row.c.category,
                db.stg_bafu_lcia_row.c.subcategory,
                db.stg_bafu_lcia_row.c.unit,
            )
            .where(db.stg_bafu_lcia_row.c.revision_id == revision_id)
            .order_by(db.stg_bafu_lcia_row.c.excel_row)
        ).mappings()
    ]
    duplicate_keys = Counter(
        key(row["product"], row["category"], row["subcategory"]) + (str(row["unit"]),)
        for row in staged_rows
    )
    columns = [
        dict(row)
        for row in connection.execute(
            select(db.stg_bafu_lcia_column)
            .where(db.stg_bafu_lcia_column.c.revision_id == revision_id)
            .order_by(db.stg_bafu_lcia_column.c.source_order)
        ).mappings()
    ]
    indicators = []
    methods: dict[str, UUID] = {}
    for column in columns:
        heading = column["indicator_heading"]
        parsed = UNIT.fullmatch(heading) if isinstance(heading, str) else None
        method = column["method_heading"]
        if not method or not parsed or not column["unit"]:
            continue
        if method not in methods:
            method_id = stable(revision_id, "method", method)
            methods[method] = method_id
            insert_rows(
                connection,
                db.impact_method,
                [
                    {
                        "id": method_id,
                        "revision_id": revision_id,
                        "provider": "BAFU",
                        "name": method,
                        "version": method,
                        "display_order": len(methods) - 1,
                    }
                ],
            )
        indicator_id = stable(revision_id, "indicator", column["column_index"])
        insert_rows(
            connection,
            db.impact_indicator,
            [
                {
                    "id": indicator_id,
                    "revision_id": revision_id,
                    "method_id": methods[method],
                    "category": None,
                    "name": parsed[1].strip(),
                    "original_header": heading,
                    "unit": column["unit"],
                    "display_order": column["source_order"],
                    "comparison_identity": None,
                }
            ],
        )
        indicators.append({**column, "indicator_id": indicator_id})
    matched: dict[UUID, dict[str, Any]] = {}
    used_processes: set[UUID] = set()
    row_candidates: dict[int, list[str]] = {}
    row: dict[str, Any] | None
    for row in staged_rows:
        row_key = key(row["product"], row["category"], row["subcategory"])
        possible = candidates.get(row_key, [])
        # A candidate may have equal process/reference labels; deduplicate by ID.
        possible = list({item["id"]: item for item in possible}.values())
        row_candidates[row["excel_row"]] = [item["source_process_number"] for item in possible]
        overrides = [
            rule
            for ruleset in rule_sets
            for rule in ruleset.rules
            if rule.approved
            and rule.rule_type == "row_mapping"
            and rule.excel_row == row["excel_row"]
        ]
        if len(overrides) > 1:
            raise ValueError("Ambiguous approved row mapping")
        override = overrides[0] if overrides else None
        if override is not None:
            target = by_number.get(override.target_number)
            possible = [target] if target is not None else []
        connection.execute(
            db.stg_bafu_lcia_row.update()
            .where(db.stg_bafu_lcia_row.c.id == row["id"])
            .values(
                scores=db.stg_bafu_lcia_row.c.scores.op("||")(
                    {
                        "_reconciliation": {
                            "candidate_dataset_numbers": row_candidates[row["excel_row"]],
                            "override_dataset_number": override.target_number
                            if override is not None
                            else None,
                            "rule_id": str(override.id) if override is not None else None,
                            "evidence": override.evidence
                            if override is not None
                            else "Exact name/geography/category/subcategory candidate comparison",
                        }
                    }
                )
            )
        )
        duplicate = duplicate_keys[row_key + (str(row["unit"]),)] > 1
        code = None
        if duplicate:
            code = "LCIA_DUPLICATE_KEY"
        elif len(possible) == 0:
            code = "LCIA_EXCLUDED_PROCESS" if row_key in excluded_keys else "LCIA_ROW_UNMATCHED"
        elif len(possible) > 1:
            code = "LCIA_ROW_AMBIGUOUS"
        if code is not None:
            issue(
                connection,
                revision_id,
                run_id,
                code=code,
                stage="reconcile",
                source_object_id=row["source_object_id"],
                spreadsheet_row=row["excel_row"],
                message="Workbook association requires a unique verified source identity or approved row override; candidates="
                + ",".join(row_candidates[row["excel_row"]]),
                resolution_state="resolved"
                if override is not None and len(possible) == 1
                else "unresolved",
                resolution_rule_id=override.id if override is not None else None,
            )
        if len(possible) != 1 or (duplicate and override is None):
            connection.execute(
                db.stg_bafu_lcia_row.update()
                .where(db.stg_bafu_lcia_row.c.id == row["id"])
                .values(reconciliation_state="unmatched")
            )
            continue
        target = possible[0]
        if target["id"] in used_processes:
            # Multiple rows cannot silently supply the same process's scores.
            previous = matched.pop(target["id"], None)
            issue(
                connection,
                revision_id,
                run_id,
                code="LCIA_MULTIPLE_ROWS_FOR_PROCESS",
                stage="reconcile",
                source_object_id=row["source_object_id"],
                spreadsheet_row=row["excel_row"],
                process_source_id=target["source_process_number"],
                message="More than one workbook row resolves to one process; no score row selected",
            )
            if previous is not None:
                connection.execute(
                    db.stg_bafu_lcia_row.update()
                    .where(db.stg_bafu_lcia_row.c.id == previous["id"])
                    .values(reconciliation_state="ambiguous")
                )
                issue(
                    connection,
                    revision_id,
                    run_id,
                    code="LCIA_MULTIPLE_ROWS_FOR_PROCESS",
                    stage="reconcile",
                    source_object_id=previous["source_object_id"],
                    spreadsheet_row=previous["excel_row"],
                    process_source_id=target["source_process_number"],
                    message="More than one workbook row resolves to one process; no score row selected",
                )
            connection.execute(
                db.stg_bafu_lcia_row.update()
                .where(db.stg_bafu_lcia_row.c.id == row["id"])
                .values(reconciliation_state="ambiguous")
            )
            continue
        used_processes.add(target["id"])
        matched[target["id"]] = row
        connection.execute(
            db.stg_bafu_lcia_row.update()
            .where(db.stg_bafu_lcia_row.c.id == row["id"])
            .values(reconciliation_state="matched")
        )
    for process in processes:
        number = process["source_process_number"]
        row = matched.get(process["id"])
        if row is None:
            issue(
                connection,
                revision_id,
                run_id,
                code="XML_WITHOUT_SCORE_ROW",
                stage="reconcile",
                process_source_id=number,
                message="No unique eligible workbook row; all indicator scores are missing",
            )
            source_cells: dict[str, Any] = {}
        else:
            source_cells = (
                connection.scalar(
                    select(db.stg_bafu_lcia_row.c.original_cells).where(
                        db.stg_bafu_lcia_row.c.id == row["id"]
                    )
                )
                or {}
            )
        conversion = (
            basis_rule(
                rule_sets,
                number,
                row["unit"] if row is not None else None,
                process["reference_amount"],
                process["reference_unit"],
            )
            if row is not None
            else None
        )
        same_basis = (
            row is not None
            and row["unit"] == process["reference_unit"]
            and process["reference_amount"] == Decimal(1)
        )
        if row is not None and (not same_basis or conversion is not None):
            issue(
                connection,
                revision_id,
                run_id,
                code="SCORE_BASIS_CONVERTED"
                if conversion is not None
                else "SCORE_BASIS_UNVERIFIED",
                stage="score_basis",
                source_object_id=row["source_object_id"],
                spreadsheet_row=row["excel_row"],
                process_source_id=number,
                message="Verified scoped conversion applied"
                if conversion is not None
                else "Workbook quantity/unit basis is not proven equivalent to the XML reference output",
                resolution_state="resolved" if conversion is not None else "unresolved",
                resolution_rule_id=conversion.id if conversion is not None else None,
            )
        score_rows = []
        for indicator in indicators:
            cell = source_cells.get(indicator["column_letter"], {})
            raw = cell.get("value")
            amount = None
            status = "missing"
            issue_id = None
            if row is not None:
                try:
                    if cell.get("type") != "n" or raw is None:
                        raise ValueError("Not a stored numeric score cell")
                    value = decimal(raw)
                    if conversion is not None:
                        assert conversion.factor is not None
                        amount = exact_product(value, conversion.factor)
                        status = "valid"
                    elif same_basis:
                        amount, status = value, "valid"
                    else:
                        status = "unresolved_basis"
                except ValueError, TypeError:
                    issue_id = issue(
                        connection,
                        revision_id,
                        run_id,
                        code="LCIA_SCORE_MISSING_OR_INVALID",
                        stage="scores",
                        source_object_id=row["source_object_id"],
                        spreadsheet_row=row["excel_row"],
                        process_source_id=number,
                        message=f"Missing or unusable score at source column {indicator['column_letter']}; N/A retained",
                    )
            score_rows.append(
                {
                    "revision_id": revision_id,
                    "process_id": process["id"],
                    "indicator_id": indicator["indicator_id"],
                    "amount": amount,
                    "status": status,
                    "source_object_id": row["source_object_id"] if row else None,
                    "source_row": row["excel_row"] if row else None,
                    "source_column": indicator["column_index"],
                    "original_amount": str(raw) if raw is not None else None,
                    "original_basis_quantity": conversion.source_quantity
                    if conversion is not None
                    else (Decimal(1) if same_basis else None),
                    "original_basis_unit": row["unit"] if row else None,
                    "target_basis_quantity": process["reference_amount"],
                    "target_basis_unit": process["reference_unit"],
                    "conversion_factor": conversion.factor
                    if conversion is not None
                    else (Decimal(1) if same_basis else None),
                    "resolution_rule_id": conversion.id if conversion is not None else None,
                }
            )
            if status == "unresolved_basis":
                assert row is not None
                issue_id = issue(
                    connection,
                    revision_id,
                    run_id,
                    code="SCORE_BASIS_UNVERIFIED_CELL",
                    stage="score_basis",
                    source_object_id=row["source_object_id"],
                    spreadsheet_row=row["excel_row"],
                    process_source_id=number,
                    message=f"Source column {indicator['column_letter']} has an unverified reference basis",
                )
            if issue_id is not None:
                warning(
                    connection,
                    revision_id,
                    process["id"],
                    code="SCORE_UNAVAILABLE",
                    message="Source score is missing or its reference basis is unverified",
                    issue_id=issue_id,
                    indicator_id=indicator["indicator_id"],
                )
        insert_rows(connection, db.lcia_score, score_rows)

"""Verified source groups and identities; exact aggregation is PostgreSQL NUMERIC."""

import itertools
from collections import Counter
from typing import Any
from uuid import UUID

from lca_shared.contracts import FlowType
from lca_shared.db import schema as db
from lca_shared.decimal import decimal
from lca_shared.identity import IDENTITY_KEY_VERSION, FlowIdentity
from sqlalchemy import Connection, select, text

from lca_etl.models import Manifest, RuleSet
from lca_etl.store import insert_rows, issue, stable, warning
from lca_etl.xml import classify


def harmonize(
    connection: Connection,
    release_id: UUID,
    revision_id: UUID,
    run_id: UUID,
    manifest: Manifest,
    rules: RuleSet,
) -> None:
    staged = list(
        connection.execute(
            select(
                db.stg_bafu_process.c.id,
                db.stg_bafu_process.c.source_object_id,
                db.stg_bafu_process.c.dataset_number,
                db.stg_bafu_process.c.reference_attributes,
                db.stg_bafu_process.c.geography,
            ).where(db.stg_bafu_process.c.revision_id == revision_id)
        ).mappings()
    )
    processes = {row["id"]: dict(row) for row in staged}
    counts = Counter(row["dataset_number"] for row in staged)
    unique = {
        row["dataset_number"]: dict(row)
        for row in staged
        if row["dataset_number"] and counts[row["dataset_number"]] == 1
    }
    objects = {
        row[0]: row[1]
        for row in connection.execute(
            select(db.source_object.c.id, db.source_object.c.relative_path).where(
                db.source_object.c.revision_id == revision_id
            )
        ).all()
    }
    references: dict[UUID, list[dict[str, Any]]] = {}
    for row in connection.execute(
        select(db.stg_bafu_exchange).where(
            db.stg_bafu_exchange.c.revision_id == revision_id,
            db.stg_bafu_exchange.c.output_group == "0",
        )
    ).mappings():
        references.setdefault(row["stg_bafu_process_id"], []).append(dict(row))
    connection.exec_driver_sql(
        "CREATE TEMP TABLE etl_amount (id uuid, process_id uuid, flow_id uuid, flow_type text, amount numeric) ON COMMIT DROP"
    )
    exchange_query = (
        select(db.stg_bafu_exchange)
        .where(db.stg_bafu_exchange.c.revision_id == revision_id)
        .order_by(
            db.stg_bafu_exchange.c.stg_bafu_process_id, db.stg_bafu_exchange.c.exchange_ordinal
        )
    )
    encountered: set[UUID] = set()
    flow_cache: dict[UUID, str] = {}
    stream = connection.execute(exchange_query.execution_options(stream_results=True)).mappings()
    for staged_id, group in itertools.groupby(stream, key=lambda row: row["stg_bafu_process_id"]):
        parent = processes[staged_id]
        encountered.add(staged_id)
        exchanges = [dict(row) for row in group]
        number = parent["dataset_number"]
        common = {"source_object_id": parent["source_object_id"], "process_source_id": number}
        if not number or counts[number] != 1:
            issue(
                connection,
                revision_id,
                run_id,
                code="PROCESS_ID_INVALID_OR_DUPLICATE",
                stage="harmonize",
                severity="CRITICAL",
                message="Source process identity is missing or repeated within this revision",
                **common,
            )
            continue
        reference = references.get(staged_id, [])
        if len(reference) != 1:
            issue(
                connection,
                revision_id,
                run_id,
                code="MULTI_OUTPUT_EXCLUDED" if len(reference) > 1 else "REFERENCE_MISSING",
                stage="harmonize",
                severity="WARNING" if len(reference) > 1 else "CRITICAL",
                resolution_state="excluded" if len(reference) > 1 else "unresolved",
                message="Process excluded: reference output count is not exactly one",
                **common,
            )
            continue
        invalid = False
        for exchange in exchanges:
            candidate = {**exchange, "group_count": exchange["original"].get("group_count", 1)}
            if classify(candidate) is None:
                invalid = True
                issue(
                    connection,
                    revision_id,
                    run_id,
                    code="EXCHANGE_GROUP_UNKNOWN",
                    stage="harmonize",
                    severity="CRITICAL",
                    exchange_ordinal=exchange["exchange_ordinal"],
                    message="Unknown or multiple source exchange groups",
                    **common,
                )
            try:
                decimal(exchange["mean_value"])
            except TypeError, ValueError:
                invalid = True
                issue(
                    connection,
                    revision_id,
                    run_id,
                    code="EXCHANGE_AMOUNT_INVALID",
                    stage="harmonize",
                    severity="CRITICAL",
                    exchange_ordinal=exchange["exchange_ordinal"],
                    message="Exchange amount is not a finite exact decimal",
                    **common,
                )
            if not exchange["unit"] or not exchange["name"]:
                invalid = True
                issue(
                    connection,
                    revision_id,
                    run_id,
                    code="EXCHANGE_MEANING_INCOMPLETE",
                    stage="harmonize",
                    severity="CRITICAL",
                    exchange_ordinal=exchange["exchange_ordinal"],
                    message="Exchange has no usable name or unit",
                    **common,
                )
        if invalid:
            continue
        ref = reference[0]
        attrs = parent["reference_attributes"]
        process_id = stable(revision_id, "process", number)
        process_name = attrs.get("name") or ref["name"]
        geography = parent["geography"] or ref["location"] or ""
        category = attrs.get("category") or ref["category"] or ""
        subcategory = attrs.get("subCategory") or ref["subcategory"] or ""
        path = [category] if category else []
        path.extend(segment.strip() for segment in subcategory.split("/") if segment.strip())
        insert_rows(
            connection,
            db.process,
            [
                {
                    "id": process_id,
                    "revision_id": revision_id,
                    "source_process_number": number,
                    "name": process_name,
                    "geography": geography,
                    "category": category,
                    "subcategory": subcategory,
                    "category_path": path,
                    "reference_name": ref["name"],
                    "reference_amount": decimal(ref["mean_value"]),
                    "reference_unit": ref["unit"],
                    "quality_flag": "source_retained",
                }
            ],
        )
        mismatched = (
            attrs.get("unit", ref["unit"]) != ref["unit"]
            or attrs.get("name", ref["name"]) != ref["name"]
        )
        if "amount" in attrs:
            try:
                mismatched |= decimal(attrs["amount"]) != decimal(ref["mean_value"])
            except TypeError, ValueError:
                mismatched = True
        if mismatched:
            event_id = issue(
                connection,
                revision_id,
                run_id,
                code="REFERENCE_METADATA_MISMATCH",
                stage="harmonize",
                severity="WARNING",
                message="Reference header comes from the actual reference exchange; source metadata differs",
                **common,
            )
            warning(
                connection,
                revision_id,
                process_id,
                code="REFERENCE_METADATA_MISMATCH",
                message="Source reference metadata differs; actual reference output is displayed",
                issue_id=event_id,
            )
        duplicate_groups: dict[tuple[UUID, str], list[tuple[dict[str, Any], UUID]]] = {}
        for exchange in exchanges:
            flow_type = classify(
                {**exchange, "group_count": exchange["original"].get("group_count", 1)}
            )
            assert flow_type is not None
            target = parent if flow_type == "Reference" else unique.get(exchange["number"])
            target_refs = references.get(target["id"], []) if target is not None else []
            rule = None
            fallback = False
            diagnostic_id = None
            if flow_type == "Technosphere":
                if target is None or len(target_refs) != 1:
                    matching_rules = [
                        item
                        for item in rules.rules
                        if item.approved
                        and item.rule_type == "reference_mapping"
                        and item.source_number == exchange["number"]
                        and item.process_number in (None, number)
                    ]
                    if len(matching_rules) > 1:
                        raise ValueError("More than one approved reference rule applies")
                    rule = matching_rules[0] if matching_rules else None
                    if rule is not None:
                        target = unique.get(rule.target_number)
                        target_refs = references.get(target["id"], []) if target is not None else []
                    fallback = target is None or len(target_refs) != 1
                    diagnostic_id = issue(
                        connection,
                        revision_id,
                        run_id,
                        code="TECHNOSPHERE_REFERENCE_MISSING",
                        stage="staging",
                        exchange_ordinal=exchange["exchange_ordinal"],
                        message="Source reference lookup failed; resolution recorded separately",
                        resolution_state="resolved"
                        if not fallback or rules.allow_isolated_reference_fallback
                        else "unresolved",
                        resolution_rule_id=rule.id if rule is not None else None,
                        **common,
                    )
                    if fallback and not rules.allow_isolated_reference_fallback:
                        issue(
                            connection,
                            revision_id,
                            run_id,
                            code="TECHNOSPHERE_REFERENCE_UNRESOLVED",
                            stage="harmonize",
                            severity="CRITICAL",
                            exchange_ordinal=exchange["exchange_ordinal"],
                            message="No approved reference rule or permitted safe fallback",
                            **common,
                        )
                        continue
                resolution = (
                    "fallback" if fallback else ("manual" if rule is not None else "resolved")
                )
                insert_rows(
                    connection,
                    db.stg_bafu_reference_resolution,
                    [
                        {
                            "id": stable(exchange["id"], "resolution", rules.version),
                            "revision_id": revision_id,
                            "stg_bafu_exchange_id": exchange["id"],
                            "attempt_version": rules.version,
                            "referenced_number": exchange["number"],
                            "resolved_stg_bafu_process_id": target["id"]
                            if target is not None and not fallback
                            else None,
                            "status": resolution,
                            "resolution_rule_id": rule.id if rule is not None else None,
                            "evidence": rule.evidence if rule is not None else None,
                            "message": "Isolated source identity retained"
                            if fallback
                            else "Source number resolved within this release revision",
                        }
                    ],
                )
                if fallback:
                    diagnostic_id = issue(
                        connection,
                        revision_id,
                        run_id,
                        code="REFERENCE_FALLBACK_APPLIED",
                        stage="harmonize",
                        severity="WARNING",
                        exchange_ordinal=exchange["exchange_ordinal"],
                        resolution_state="resolved",
                        message="Isolated deterministic fallback avoids asserting a verified source reference",
                        **common,
                    )
            linked = (
                flow_type in ("Reference", "Technosphere")
                and target is not None
                and len(target_refs) == 1
                and not fallback
            )
            target_ref = target_refs[0] if linked else exchange
            linked_target = target if linked and target is not None else {}
            target_attrs = linked_target.get("reference_attributes", {})
            canonical_location = (
                (linked_target.get("geography") or target_ref["location"] or "")
                if linked
                else (exchange["location"] or "")
            )
            identity = FlowIdentity(
                release_scope=f"BAFU:{manifest.release.release_version}",
                source_number=str(
                    linked_target["dataset_number"] if linked else (exchange["number"] or "missing")
                ),
                flow_type=FlowType(flow_type),
                unit=exchange["unit"],
                category=exchange["category"] or "",
                subcategory=exchange["subcategory"] or "",
                location=canonical_location,
                fallback_process=number if fallback else None,
                fallback_exchange=f"{objects[parent['source_object_id']]}:{exchange['exchange_ordinal']}"
                if fallback
                else None,
            )
            flow_id = identity.flow_id()
            key = identity.canonical_key()
            if flow_id not in flow_cache:
                previous = (
                    connection.execute(select(db.flow).where(db.flow.c.id == flow_id))
                    .mappings()
                    .one_or_none()
                )
                if previous is not None and previous["canonical_identity_key"] != key:
                    raise ValueError("Deterministic flow ID collision")
                insert_rows(
                    connection,
                    db.flow,
                    [
                        {
                            "id": flow_id,
                            "canonical_identity_key": key,
                            "identity_key_version": IDENTITY_KEY_VERSION,
                            "name": target_ref["name"],
                            "unit": exchange["unit"],
                            "category": target_attrs.get("category", exchange["category"] or ""),
                            "subcategory": target_attrs.get(
                                "subCategory", exchange["subcategory"] or ""
                            ),
                            "compartment": exchange["subcategory"] or ""
                            if flow_type.startswith("Ecosphere")
                            else "",
                            "process_name": (target_attrs.get("name") or target_ref["name"])
                            if linked
                            else None,
                            "location": canonical_location,
                            "release_scope": identity.release_scope,
                            "mapping_status": "isolated_fallback"
                            if fallback
                            else "source_identity",
                        }
                    ],
                )
                flow_cache[flow_id] = key
            process_flow_id = stable(process_id, flow_id, flow_type)
            exchange["_applied_rules"] = [str(rule.id)] if rule is not None and not fallback else []
            duplicate_groups.setdefault((flow_id, flow_type), []).append(
                (exchange, process_flow_id)
            )
            connection.execute(
                text("INSERT INTO etl_amount VALUES (:id,:process,:flow,:type,:amount)"),
                {
                    "id": process_flow_id,
                    "process": process_id,
                    "flow": flow_id,
                    "type": flow_type,
                    "amount": decimal(exchange["mean_value"]),
                },
            )
            if fallback and diagnostic_id is not None:
                warning(
                    connection,
                    revision_id,
                    process_id,
                    code="UNRESOLVED_REFERENCE_FALLBACK",
                    message="Unresolved source reference retained as a separate flow identity",
                    issue_id=diagnostic_id,
                    flow_id=flow_id,
                    flow_type=flow_type,
                )
            if linked and target_ref["unit"] != exchange["unit"]:
                event_id = issue(
                    connection,
                    revision_id,
                    run_id,
                    code="TECHNOSPHERE_UNIT_DISCREPANCY",
                    stage="harmonize",
                    severity="WARNING",
                    exchange_ordinal=exchange["exchange_ordinal"],
                    message="Source exchange unit retained in a separate identity; no unverified conversion",
                    **common,
                )
                warning(
                    connection,
                    revision_id,
                    process_id,
                    code="SOURCE_UNIT_RETAINED",
                    message="Source exchange unit differs from the referenced process; no conversion applied",
                    issue_id=event_id,
                    flow_id=flow_id,
                    flow_type=flow_type,
                )
        # SQL NUMERIC SUM is exact and unscaled, unlike Spark's fixed Decimal38.
        connection.execute(
            text(
                "INSERT INTO process_flows(id,revision_id,process_id,flow_id,flow_type,amount) SELECT id,:revision,process_id,flow_id,flow_type,SUM(amount) FROM etl_amount WHERE process_id=:process GROUP BY id,process_id,flow_id,flow_type ON CONFLICT DO NOTHING"
            ),
            {"revision": revision_id, "process": process_id},
        )
        for (flow_id, flow_type), constituents in duplicate_groups.items():
            if len(constituents) > 1:
                event_id = issue(
                    connection,
                    revision_id,
                    run_id,
                    code="DUPLICATE_EXCHANGE",
                    stage="staging",
                    exchange_ordinal=constituents[0][0]["exchange_ordinal"],
                    resolution_state="resolved",
                    message="Every duplicate retained in staging and exact aggregate provenance",
                    **common,
                )
                issue(
                    connection,
                    revision_id,
                    run_id,
                    code="DUPLICATE_AGGREGATED",
                    stage="harmonize",
                    severity="WARNING",
                    exchange_ordinal=constituents[0][0]["exchange_ordinal"],
                    resolution_state="resolved",
                    message="Exact sum has one constituent provenance record per original exchange",
                    **common,
                )
                warning(
                    connection,
                    revision_id,
                    process_id,
                    code="DUPLICATE_AGGREGATED",
                    message="Source duplicate exchanges were exactly aggregated",
                    issue_id=event_id,
                    flow_id=flow_id,
                    flow_type=flow_type,
                )
            insert_rows(
                connection,
                db.flow_provenance,
                (
                    {
                        "id": stable(exchange["id"], "provenance"),
                        "revision_id": revision_id,
                        "process_flow_id": process_flow_id,
                        "source_object_id": parent["source_object_id"],
                        "source_path": objects[parent["source_object_id"]],
                        "source_process_number": number,
                        "exchange_ordinal": exchange["exchange_ordinal"],
                        "original_amount": exchange["mean_value"],
                        "original_unit": exchange["unit"],
                        "normalized_input_amount": decimal(exchange["mean_value"]),
                        "applied_rule_ids": exchange["_applied_rules"],
                        "stg_bafu_exchange_id": exchange["id"],
                    }
                    for exchange, process_flow_id in constituents
                ),
            )
        connection.execute(
            text("DELETE FROM etl_amount WHERE process_id=:process"), {"process": process_id}
        )
    for staged_id in set(processes) - encountered:
        parent = processes[staged_id]
        issue(
            connection,
            revision_id,
            run_id,
            code="REFERENCE_MISSING",
            stage="harmonize",
            severity="CRITICAL",
            source_object_id=parent["source_object_id"],
            process_source_id=parent["dataset_number"],
            message="Process has no exchange records or reference output",
        )

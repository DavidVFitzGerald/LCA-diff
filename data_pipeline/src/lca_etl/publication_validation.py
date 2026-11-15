"""Read-only target-side scientific and provenance gates, also used at publish."""

from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from sqlalchemy import Connection, func, select, text

from lca_etl.publication_artifact import TABLES
from lca_etl.publication_models import OperationError


def validate_target(connection: Connection, revision: UUID, payload: dict[str, Any]) -> None:
    descriptors = {item["name"]: item for item in payload["tables"]}
    release = UUID(payload["release_id"])
    record = (
        connection.execute(select(db.release_revision).where(db.release_revision.c.id == revision))
        .mappings()
        .one()
    )
    if (
        record["database_release_id"] != release
        or record["manifest_sha256"] != payload["manifest_sha256"]
        or record["status"] not in ("ready", "published", "superseded")
    ):
        raise OperationError("TARGET_REVISION_INVALID")
    for table in TABLES:
        if "revision_id" in table.c:
            actual = connection.scalar(
                select(func.count()).select_from(table).where(table.c.revision_id == revision)
            )
            if actual != descriptors[table.name]["row_count"]:
                raise OperationError("TARGET_ROW_COUNT_MISMATCH")
    checks = {
        "TARGET_PROCESS_EMPTY": "SELECT CASE WHEN count(*)=0 THEN 1 ELSE 0 END FROM public.process WHERE revision_id=:revision",
        "TARGET_CRITICAL_ISSUES": "SELECT count(*) FROM public.validation_issue WHERE revision_id=:revision AND severity='CRITICAL' AND resolution_state='unresolved'",
        "TARGET_REFERENCE_INVALID": """
          SELECT count(*) FROM public.process p WHERE p.revision_id=:revision AND
          (p.reference_amount<=0 OR (SELECT count(*) FROM public.process_flows pf
             WHERE pf.process_id=p.id AND pf.flow_type='Reference')<>1
           OR EXISTS (SELECT 1 FROM public.process_flows pf JOIN public.flow f ON f.id=pf.flow_id
             WHERE pf.process_id=p.id AND pf.flow_type='Reference'
             AND (pf.amount<>p.reference_amount OR f.unit<>p.reference_unit OR f.name<>p.reference_name)))
        """,
        "TARGET_PROVENANCE_INVALID": """
          SELECT count(*) FROM public.process_flows pf LEFT JOIN
          (SELECT process_flow_id,count(*) n,sum(normalized_input_amount) amount
           FROM public.flow_provenance WHERE revision_id=:revision GROUP BY process_flow_id) pv
          ON pv.process_flow_id=pf.id WHERE pf.revision_id=:revision
          AND (pv.n IS NULL OR pv.amount IS DISTINCT FROM pf.amount)
        """,
        "TARGET_SOURCE_COORDINATE_INVALID": """
          SELECT count(*) FROM public.flow_provenance pv
          JOIN public.source_object s ON s.id=pv.source_object_id
          JOIN public.process_flows pf ON pf.id=pv.process_flow_id
          JOIN public.process p ON p.id=pf.process_id
          WHERE pv.revision_id=:revision AND (s.kind<>'process_xml' OR pv.source_path<>s.relative_path
             OR pv.source_process_number<>p.source_process_number OR pv.exchange_ordinal<0
             OR pv.stg_bafu_exchange_id IS NOT NULL)
        """,
        "TARGET_SOURCE_CONSTITUENT_REUSED": """
          SELECT count(*) FROM (SELECT source_object_id,source_process_number,exchange_ordinal
            FROM public.flow_provenance WHERE revision_id=:revision
            GROUP BY source_object_id,source_process_number,exchange_ordinal HAVING count(*)<>1) duplicates
        """,
        "TARGET_SCORE_INVALID": """
          SELECT count(*) FROM public.lcia_score s JOIN public.process p ON p.id=s.process_id
          LEFT JOIN public.source_object o ON o.id=s.source_object_id
          LEFT JOIN public.resolution_rule r ON r.id=s.resolution_rule_id
          WHERE s.revision_id=:revision AND s.status='valid' AND (
            s.original_amount IS NULL OR s.original_basis_quantity IS NULL OR s.original_basis_quantity<=0
            OR s.target_basis_quantity IS NULL OR s.target_basis_quantity<=0 OR s.conversion_factor IS NULL OR s.conversion_factor<=0
            OR s.original_basis_unit IS NULL OR s.target_basis_unit IS NULL
            OR o.kind IS DISTINCT FROM 'lcia_xlsx' OR s.source_row IS NULL OR s.source_row<3
            OR s.source_column IS NULL OR s.source_column NOT BETWEEN 5 AND 51
            OR s.target_basis_quantity<>p.reference_amount OR s.target_basis_unit<>p.reference_unit
            OR s.amount<>s.original_amount::numeric*s.conversion_factor
            OR (s.resolution_rule_id IS NULL AND (s.original_basis_quantity<>s.target_basis_quantity
                OR s.original_basis_unit<>s.target_basis_unit OR s.conversion_factor<>1))
            OR (s.resolution_rule_id IS NOT NULL AND (r.approved IS DISTINCT FROM true OR r.approved_by IS NULL
              OR r.database_release_id<>:release
              OR r.resolution->>'rule_type' NOT IN ('score_basis','unit_alias')
              OR (r.resolution->>'factor')::numeric IS DISTINCT FROM s.conversion_factor
              OR (r.resolution->>'source_quantity')::numeric IS DISTINCT FROM s.original_basis_quantity
              OR (r.resolution->>'target_quantity')::numeric IS DISTINCT FROM s.target_basis_quantity
              OR r.resolution->>'source_unit' IS DISTINCT FROM s.original_basis_unit
              OR r.resolution->>'target_unit' IS DISTINCT FROM s.target_basis_unit
              OR (r.resolution->>'process_number' IS NOT NULL AND r.resolution->>'process_number'<>p.source_process_number))))
        """,
        "TARGET_APPLIED_RULE_INVALID": """
          SELECT count(*) FROM public.flow_provenance p
          CROSS JOIN LATERAL jsonb_array_elements_text(p.applied_rule_ids) item
          LEFT JOIN public.resolution_rule r ON r.id=item.value::uuid
          WHERE p.revision_id=:revision AND (r.id IS NULL OR NOT r.approved OR r.database_release_id<>:release)
        """,
        "TARGET_SCORE_MATRIX_INCOMPLETE": """
          SELECT count(*) FROM public.process p CROSS JOIN public.impact_indicator i
          LEFT JOIN public.lcia_score s ON s.process_id=p.id AND s.indicator_id=i.id
          WHERE p.revision_id=:revision AND i.revision_id=:revision AND s.process_id IS NULL
        """,
    }
    for code, statement in checks.items():
        if connection.scalar(text(statement), {"revision": revision, "release": release}):
            raise OperationError(code)

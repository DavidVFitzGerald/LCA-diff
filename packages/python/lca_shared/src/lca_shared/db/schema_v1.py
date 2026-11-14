"""MVP schema. Scientific measurements use unrestricted PostgreSQL NUMERIC."""

from typing import Any
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    Numeric,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData(
    naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_name)s",
        "uq": "uq_%(table_name)s_%(column_0_N_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)


def uid(name: str = "id", *, primary: bool = False, nullable: bool = False) -> Column[Any]:
    return Column(
        name, Uuid, primary_key=primary, nullable=nullable, default=uuid4 if primary else None
    )


def text(name: str, *, nullable: bool = False) -> Column[Any]:
    return Column(name, Text, nullable=nullable)


def number(name: str, *, nullable: bool = False) -> Column[Any]:
    return Column(name, Numeric(), nullable=nullable)


def timestamp(name: str, *, nullable: bool = False) -> Column[Any]:
    return Column(
        name,
        DateTime(timezone=True),
        nullable=nullable,
        server_default=None if nullable else func.now(),
    )


def json(name: str) -> Column[Any]:
    return Column(name, JSONB, nullable=False, server_default="{}")


def revision() -> Column[Any]:
    return Column("revision_id", Uuid, ForeignKey("release_revision.id"), nullable=False)


def finite(name: str) -> CheckConstraint:
    return CheckConstraint(
        f"{name}::text NOT IN ('NaN','Infinity','-Infinity')", name=f"finite_{name}"
    )


database_release = Table(
    "database_release",
    metadata,
    uid(primary=True),
    text("database_code"),
    text("release_version"),
    text("display_name"),
    Column("source_published_at", DateTime(timezone=True)),
    timestamp("ingested_at"),
    text("license_policy"),
    UniqueConstraint("database_code", "release_version"),
)
release_revision = Table(
    "release_revision",
    metadata,
    uid(primary=True),
    Column("database_release_id", Uuid, ForeignKey("database_release.id"), nullable=False),
    Column("revision_no", Integer, nullable=False),
    text("status"),
    text("mapping_rule_version"),
    text("manifest_sha256"),
    timestamp("created_at"),
    timestamp("published_at", nullable=True),
    UniqueConstraint("database_release_id", "revision_no"),
    UniqueConstraint("database_release_id", "id"),
    CheckConstraint("revision_no > 0", name="positive_revision"),
    CheckConstraint(
        "status IN ('staging','validated','ready','published','superseded','rejected')",
        name="revision_status",
    ),
    CheckConstraint("manifest_sha256 ~ '^[a-f0-9]{64}$'", name="manifest_checksum"),
)
release_publication = Table(
    "release_publication",
    metadata,
    Column("database_release_id", Uuid, ForeignKey("database_release.id"), primary_key=True),
    uid("active_revision_id"),
    timestamp("activated_at"),
    ForeignKeyConstraint(
        ["database_release_id", "active_revision_id"],
        ["release_revision.database_release_id", "release_revision.id"],
    ),
)
import_run = Table(
    "import_run",
    metadata,
    uid(primary=True),
    revision(),
    text("dag_run_id", nullable=True),
    timestamp("started_at"),
    timestamp("finished_at", nullable=True),
    text("status"),
    text("parser_version"),
    text("transformer_version"),
    json("counts"),
    text("report_uri", nullable=True),
    UniqueConstraint("revision_id", "id"),
)
source_object = Table(
    "source_object",
    metadata,
    uid(primary=True),
    revision(),
    text("relative_path"),
    text("sha256"),
    Column("byte_size", BigInteger, nullable=False),
    text("kind"),
    text("storage_uri"),
    UniqueConstraint("revision_id", "relative_path"),
    UniqueConstraint("revision_id", "id"),
    CheckConstraint("byte_size >= 0", name="nonnegative_bytes"),
    CheckConstraint("sha256 ~ '^[a-f0-9]{64}$'", name="source_checksum"),
    CheckConstraint("kind IN ('process_xml','lcia_xlsx','manifest')", name="source_kind"),
)
resolution_rule = Table(
    "resolution_rule",
    metadata,
    uid(primary=True),
    Column("database_release_id", Uuid, ForeignKey("database_release.id"), nullable=False),
    text("rule_type"),
    json("input_key"),
    json("resolution"),
    text("author"),
    text("evidence"),
    Column("approved", Boolean, nullable=False, server_default="false"),
    text("approved_by", nullable=True),
    text("effective_version"),
    text("checksum"),
    timestamp("created_at"),
    CheckConstraint("NOT approved OR approved_by IS NOT NULL", name="approval_evidence"),
)
validation_issue = Table(
    "validation_issue",
    metadata,
    uid(primary=True),
    revision(),
    uid("import_run_id"),
    text("stage"),
    text("severity"),
    text("code"),
    uid("source_object_id", nullable=True),
    text("process_source_id", nullable=True),
    Column("exchange_ordinal", Integer),
    Column("spreadsheet_row", Integer),
    text("message"),
    text("resolution_state"),
    Column("resolution_rule_id", Uuid, ForeignKey("resolution_rule.id")),
    timestamp("created_at"),
    timestamp("resolved_at", nullable=True),
    UniqueConstraint("revision_id", "id"),
    ForeignKeyConstraint(
        ["revision_id", "import_run_id"], ["import_run.revision_id", "import_run.id"]
    ),
    ForeignKeyConstraint(
        ["revision_id", "source_object_id"], ["source_object.revision_id", "source_object.id"]
    ),
    CheckConstraint("severity IN ('INFO','WARNING','ERROR','CRITICAL')", name="issue_severity"),
    CheckConstraint(
        "resolution_state IN ('unresolved','resolved','excluded')", name="issue_resolution"
    ),
)
stg_bafu_process = Table(
    "stg_bafu_process",
    metadata,
    uid(primary=True),
    revision(),
    uid("source_object_id"),
    text("dataset_number", nullable=True),
    json("reference_attributes"),
    text("geography", nullable=True),
    json("source_metadata"),
    text("file_uuid", nullable=True),
    Column("extraction_ordinal", Integer, nullable=False),
    UniqueConstraint("revision_id", "id"),
    ForeignKeyConstraint(
        ["revision_id", "source_object_id"], ["source_object.revision_id", "source_object.id"]
    ),
)
stg_bafu_exchange = Table(
    "stg_bafu_exchange",
    metadata,
    uid(primary=True),
    revision(),
    uid("stg_bafu_process_id"),
    Column("exchange_ordinal", Integer, nullable=False),
    text("number", nullable=True),
    text("name", nullable=True),
    text("mean_value", nullable=True),
    text("unit", nullable=True),
    text("category", nullable=True),
    text("subcategory", nullable=True),
    text("location", nullable=True),
    text("input_group", nullable=True),
    text("output_group", nullable=True),
    json("original"),
    UniqueConstraint("stg_bafu_process_id", "exchange_ordinal"),
    UniqueConstraint("revision_id", "id"),
    ForeignKeyConstraint(
        ["revision_id", "stg_bafu_process_id"],
        ["stg_bafu_process.revision_id", "stg_bafu_process.id"],
    ),
)
stg_bafu_lcia_row = Table(
    "stg_bafu_lcia_row",
    metadata,
    uid(primary=True),
    revision(),
    uid("source_object_id"),
    text("sheet_name"),
    Column("excel_row", Integer, nullable=False),
    text("product", nullable=True),
    text("category", nullable=True),
    text("subcategory", nullable=True),
    text("unit", nullable=True),
    json("original_cells"),
    json("scores"),
    text("reconciliation_state"),
    UniqueConstraint("revision_id", "id"),
    UniqueConstraint("source_object_id", "sheet_name", "excel_row"),
    ForeignKeyConstraint(
        ["revision_id", "source_object_id"], ["source_object.revision_id", "source_object.id"]
    ),
)
stg_bafu_lcia_column = Table(
    "stg_bafu_lcia_column",
    metadata,
    uid(primary=True),
    revision(),
    uid("source_object_id"),
    Column("column_index", Integer, nullable=False),
    text("column_letter"),
    text("method_heading", nullable=True),
    text("indicator_heading", nullable=True),
    text("unit", nullable=True),
    Column("source_order", Integer, nullable=False),
    json("original_cells"),
    UniqueConstraint("revision_id", "column_index"),
    UniqueConstraint("revision_id", "id"),
    ForeignKeyConstraint(
        ["revision_id", "source_object_id"], ["source_object.revision_id", "source_object.id"]
    ),
)
stg_bafu_reference_resolution = Table(
    "stg_bafu_reference_resolution",
    metadata,
    uid(primary=True),
    revision(),
    uid("stg_bafu_exchange_id"),
    text("attempt_version"),
    text("referenced_number", nullable=True),
    uid("resolved_stg_bafu_process_id", nullable=True),
    text("status"),
    Column("resolution_rule_id", Uuid, ForeignKey("resolution_rule.id")),
    text("evidence", nullable=True),
    text("message"),
    timestamp("created_at"),
    UniqueConstraint("stg_bafu_exchange_id", "attempt_version"),
    ForeignKeyConstraint(
        ["revision_id", "stg_bafu_exchange_id"],
        ["stg_bafu_exchange.revision_id", "stg_bafu_exchange.id"],
    ),
    ForeignKeyConstraint(
        ["revision_id", "resolved_stg_bafu_process_id"],
        ["stg_bafu_process.revision_id", "stg_bafu_process.id"],
    ),
    CheckConstraint(
        "status IN ('resolved','manual','fallback','unresolved','not_applicable')",
        name="reference_status",
    ),
)
flow = Table(
    "flow",
    metadata,
    uid(primary=True),
    text("canonical_identity_key"),
    Column("identity_key_version", Integer, nullable=False),
    text("name"),
    text("unit"),
    text("category"),
    text("subcategory"),
    text("compartment"),
    text("process_name", nullable=True),
    text("location"),
    text("release_scope"),
    text("mapping_status"),
    UniqueConstraint("canonical_identity_key"),
)
process = Table(
    "process",
    metadata,
    uid(primary=True),
    revision(),
    text("source_process_number"),
    text("name"),
    text("geography"),
    text("category"),
    text("subcategory"),
    json("category_path"),
    text("reference_name"),
    number("reference_amount"),
    text("reference_unit"),
    text("quality_flag"),
    UniqueConstraint("revision_id", "source_process_number"),
    UniqueConstraint("revision_id", "id"),
    finite("reference_amount"),
)
process_flows = Table(
    "process_flows",
    metadata,
    uid(primary=True),
    revision(),
    uid("process_id"),
    Column("flow_id", Uuid, ForeignKey("flow.id"), nullable=False),
    text("flow_type"),
    number("amount"),
    UniqueConstraint("process_id", "flow_id", "flow_type"),
    UniqueConstraint("revision_id", "id"),
    ForeignKeyConstraint(["revision_id", "process_id"], ["process.revision_id", "process.id"]),
    CheckConstraint(
        "flow_type IN ('Reference','Technosphere','Ecosphere Input','Ecosphere Output')",
        name="flow_type",
    ),
    finite("amount"),
)
flow_provenance = Table(
    "flow_provenance",
    metadata,
    uid(primary=True),
    revision(),
    uid("process_flow_id"),
    uid("source_object_id"),
    text("source_path"),
    text("source_process_number"),
    Column("exchange_ordinal", Integer, nullable=False),
    text("original_amount"),
    text("original_unit"),
    number("normalized_input_amount"),
    json("applied_rule_ids"),
    uid("stg_bafu_exchange_id", nullable=True),
    ForeignKeyConstraint(
        ["revision_id", "process_flow_id"], ["process_flows.revision_id", "process_flows.id"]
    ),
    ForeignKeyConstraint(
        ["revision_id", "source_object_id"], ["source_object.revision_id", "source_object.id"]
    ),
    ForeignKeyConstraint(
        ["revision_id", "stg_bafu_exchange_id"],
        ["stg_bafu_exchange.revision_id", "stg_bafu_exchange.id"],
    ),
    UniqueConstraint("process_flow_id", "source_object_id", "exchange_ordinal"),
    finite("normalized_input_amount"),
)
impact_method = Table(
    "impact_method",
    metadata,
    uid(primary=True),
    revision(),
    text("provider"),
    text("name"),
    text("version"),
    Column("display_order", Integer, nullable=False),
    UniqueConstraint("revision_id", "provider", "name", "version"),
    UniqueConstraint("revision_id", "id"),
)
impact_indicator = Table(
    "impact_indicator",
    metadata,
    uid(primary=True),
    revision(),
    uid("method_id"),
    text("category", nullable=True),
    text("name"),
    text("original_header"),
    text("unit"),
    Column("display_order", Integer, nullable=False),
    text("comparison_identity", nullable=True),
    UniqueConstraint("revision_id", "id"),
    ForeignKeyConstraint(
        ["revision_id", "method_id"], ["impact_method.revision_id", "impact_method.id"]
    ),
)
lcia_score = Table(
    "lcia_score",
    metadata,
    revision(),
    Column("process_id", Uuid, primary_key=True),
    Column("indicator_id", Uuid, primary_key=True),
    number("amount", nullable=True),
    text("status"),
    uid("source_object_id", nullable=True),
    Column("source_row", Integer),
    Column("source_column", Integer),
    text("original_amount", nullable=True),
    number("original_basis_quantity", nullable=True),
    text("original_basis_unit", nullable=True),
    number("target_basis_quantity", nullable=True),
    text("target_basis_unit", nullable=True),
    number("conversion_factor", nullable=True),
    Column("resolution_rule_id", Uuid, ForeignKey("resolution_rule.id")),
    ForeignKeyConstraint(["revision_id", "process_id"], ["process.revision_id", "process.id"]),
    ForeignKeyConstraint(
        ["revision_id", "indicator_id"], ["impact_indicator.revision_id", "impact_indicator.id"]
    ),
    ForeignKeyConstraint(
        ["revision_id", "source_object_id"], ["source_object.revision_id", "source_object.id"]
    ),
    CheckConstraint("status IN ('valid','missing','unresolved_basis')", name="score_status"),
    CheckConstraint("(status = 'valid') = (amount IS NOT NULL)", name="score_presence"),
    finite("amount"),
    finite("original_basis_quantity"),
    finite("target_basis_quantity"),
    finite("conversion_factor"),
)
process_warning = Table(
    "process_warning",
    metadata,
    uid(primary=True),
    revision(),
    uid("process_id"),
    uid("flow_id", nullable=True),
    text("flow_type", nullable=True),
    uid("indicator_id", nullable=True),
    text("code"),
    text("message"),
    uid("validation_issue_id", nullable=True),
    ForeignKeyConstraint(["revision_id", "process_id"], ["process.revision_id", "process.id"]),
    ForeignKeyConstraint(["flow_id"], ["flow.id"]),
    ForeignKeyConstraint(
        ["revision_id", "indicator_id"], ["impact_indicator.revision_id", "impact_indicator.id"]
    ),
    ForeignKeyConstraint(
        ["revision_id", "validation_issue_id"],
        ["validation_issue.revision_id", "validation_issue.id"],
    ),
    CheckConstraint("(flow_id IS NULL) = (flow_type IS NULL)", name="warning_flow_scope"),
    CheckConstraint("flow_id IS NULL OR indicator_id IS NULL", name="warning_single_cell_kind"),
)

Index(
    "ix_process_browse",
    process.c.revision_id,
    process.c.category,
    process.c.subcategory,
    process.c.name,
)
Index("ix_process_geography", process.c.revision_id, process.c.geography)
for field in ("name", "geography", "category", "subcategory", "reference_name"):
    Index(f"ix_process_search_{field}", process.c.revision_id, func.lower(process.c[field]))
Index(
    "ix_process_flows_read",
    process_flows.c.process_id,
    process_flows.c.flow_type,
    process_flows.c.flow_id,
)
Index("ix_process_flows_reverse", process_flows.c.flow_id, process_flows.c.process_id)
Index("ix_lcia_score_indicator", lcia_score.c.indicator_id, lcia_score.c.process_id)
Index("ix_impact_indicator_order", impact_indicator.c.method_id, impact_indicator.c.display_order)
Index("ix_stg_process_number", stg_bafu_process.c.revision_id, stg_bafu_process.c.dataset_number)
Index("ix_stg_lcia_row_revision", stg_bafu_lcia_row.c.revision_id, stg_bafu_lcia_row.c.excel_row)

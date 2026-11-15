"""Current schema, copied from the frozen initial migration definition.

Future changes belong here and in a new Alembic revision, never in schema_v1.
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    MetaData,
    Table,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

from lca_shared.db import schema_v1

metadata = MetaData(naming_convention=schema_v1.metadata.naming_convention)
for _table in schema_v1.metadata.sorted_tables:
    _table.to_metadata(metadata)

database_release = metadata.tables["database_release"]
release_revision = metadata.tables["release_revision"]
release_publication = metadata.tables["release_publication"]
import_run = metadata.tables["import_run"]
source_object = metadata.tables["source_object"]
validation_issue = metadata.tables["validation_issue"]
resolution_rule = metadata.tables["resolution_rule"]
stg_bafu_process = metadata.tables["stg_bafu_process"]
stg_bafu_exchange = metadata.tables["stg_bafu_exchange"]
stg_bafu_lcia_row = metadata.tables["stg_bafu_lcia_row"]
stg_bafu_lcia_column = metadata.tables["stg_bafu_lcia_column"]
stg_bafu_reference_resolution = metadata.tables["stg_bafu_reference_resolution"]
flow = metadata.tables["flow"]
process = metadata.tables["process"]
process_flows = metadata.tables["process_flows"]
flow_provenance = metadata.tables["flow_provenance"]
impact_method = metadata.tables["impact_method"]
impact_indicator = metadata.tables["impact_indicator"]
lcia_score = metadata.tables["lcia_score"]
process_warning = metadata.tables["process_warning"]

publication_operation = Table(
    "publication_operation",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("database_release_id", Uuid, nullable=False),
    Column("revision_id", Uuid, nullable=False),
    Column("action", Text, nullable=False),
    Column("target", Text, nullable=False),
    Column("artifact_sha256", Text, nullable=False),
    Column("previous_revision_id", Uuid),
    Column("active_revision_id", Uuid),
    Column("session_user_name", Text, nullable=False),
    Column("database_role", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("details", JSONB, nullable=False),
    ForeignKeyConstraint(
        ["database_release_id", "revision_id"],
        ["release_revision.database_release_id", "release_revision.id"],
        name="fk_operation_revision",
    ),
    ForeignKeyConstraint(
        ["database_release_id", "previous_revision_id"],
        ["release_revision.database_release_id", "release_revision.id"],
        name="fk_operation_previous_revision",
    ),
    ForeignKeyConstraint(
        ["database_release_id", "active_revision_id"],
        ["release_revision.database_release_id", "release_revision.id"],
        name="fk_operation_active_revision",
    ),
    CheckConstraint("action IN ('promote','publish','rollback')", name="operation_action"),
    CheckConstraint("artifact_sha256 ~ '^[a-f0-9]{64}$'", name="operation_checksum"),
)

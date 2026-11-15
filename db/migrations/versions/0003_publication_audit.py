"""Append-only authenticated maintainer operation receipts; no public API view."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "publication_operation",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("database_release_id", sa.Uuid, nullable=False),
        sa.Column("revision_id", sa.Uuid, nullable=False),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("target", sa.Text, nullable=False),
        sa.Column("artifact_sha256", sa.Text, nullable=False),
        sa.Column("previous_revision_id", sa.Uuid),
        sa.Column("active_revision_id", sa.Uuid),
        sa.Column("session_user_name", sa.Text, nullable=False),
        sa.Column("database_role", sa.Text, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("details", JSONB, nullable=False),
        sa.ForeignKeyConstraint(
            ["database_release_id", "revision_id"],
            ["release_revision.database_release_id", "release_revision.id"],
            name="fk_operation_revision",
        ),
        sa.ForeignKeyConstraint(
            ["database_release_id", "previous_revision_id"],
            ["release_revision.database_release_id", "release_revision.id"],
            name="fk_operation_previous_revision",
        ),
        sa.ForeignKeyConstraint(
            ["database_release_id", "active_revision_id"],
            ["release_revision.database_release_id", "release_revision.id"],
            name="fk_operation_active_revision",
        ),
        sa.CheckConstraint("action IN ('promote','publish','rollback')", name="operation_action"),
        sa.CheckConstraint("artifact_sha256 ~ '^[a-f0-9]{64}$'", name="operation_checksum"),
    )
    op.execute("""
      CREATE FUNCTION public.lca_operation_actor() RETURNS trigger LANGUAGE plpgsql
      SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
        IF (NEW.action='promote' AND current_user<>'lca_import') OR
           (NEW.action IN ('publish','rollback') AND current_user<>'lca_publisher') THEN
          RAISE EXCEPTION 'operation role denied' USING ERRCODE='42501';
        END IF;
        NEW.session_user_name := session_user;
        NEW.database_role := current_user;
        NEW.created_at := clock_timestamp();
        RETURN NEW;
      END $$;
      CREATE TRIGGER operation_actor BEFORE INSERT ON public.publication_operation
        FOR EACH ROW EXECUTE FUNCTION public.lca_operation_actor();
      CREATE FUNCTION public.lca_operation_immutable() RETURNS trigger LANGUAGE plpgsql
      SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
        RAISE EXCEPTION 'operation history is append-only' USING ERRCODE='23514';
      END $$;
      CREATE TRIGGER operation_immutable BEFORE UPDATE OR DELETE ON public.publication_operation
        FOR EACH ROW EXECUTE FUNCTION public.lca_operation_immutable();
      CREATE TRIGGER operation_no_truncate BEFORE TRUNCATE ON public.publication_operation
        EXECUTE FUNCTION public.lca_operation_immutable();
      REVOKE ALL ON public.publication_operation FROM PUBLIC,lca_api,lca_import,lca_publisher;
      REVOKE ALL ON FUNCTION public.lca_operation_actor(),public.lca_operation_immutable() FROM PUBLIC;
      GRANT SELECT,INSERT ON public.publication_operation TO lca_import,lca_publisher;
    """)


def downgrade() -> None:
    raise RuntimeError("Operation history is permanent; restore a disposable database instead")

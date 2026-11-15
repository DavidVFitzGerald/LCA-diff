"""Allow the importer to report publication status without publication writes."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("GRANT SELECT ON public.release_publication TO lca_import")


def downgrade() -> None:
    op.execute("REVOKE SELECT ON public.release_publication FROM lca_import")

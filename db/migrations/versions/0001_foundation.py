"""Release-scoped staging, harmonized measurements and immutable published data."""

from alembic import op
from lca_shared.db.schema_v1 import metadata
from lca_shared.db.security_v1 import install_security

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    metadata.create_all(op.get_bind())
    install_security(op.get_bind())


def downgrade() -> None:
    raise RuntimeError(
        "Destructive downgrade is unsupported; restore a disposable database instead"
    )

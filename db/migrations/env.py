"""Explicit migration entry point; applications never migrate on startup."""

from alembic import context
from lca_shared.config import Settings
from lca_shared.db import metadata
from sqlalchemy import create_engine


def run() -> None:
    # BaseSettings supplies required fields from the environment at runtime.
    url = Settings().database_url.get_secret_value()  # type: ignore[call-arg]
    if context.is_offline_mode():
        context.configure(url=url, target_metadata=metadata, literal_binds=True)
        with context.begin_transaction():
            context.run_migrations()
    else:
        engine = create_engine(url)
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=metadata)
            with context.begin_transaction():
                context.run_migrations()
        engine.dispose()


run()

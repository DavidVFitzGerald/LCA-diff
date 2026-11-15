"""Create local disposable roles in CI; never called by application startup."""

import os
from pathlib import Path

import psycopg

with psycopg.connect(os.environ["LCA_BOOTSTRAP_DATABASE_URL"], autocommit=True) as connection:
    connection.execute(Path("db/bootstrap.sql").read_text())

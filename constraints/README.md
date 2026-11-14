# Backend dependency compatibility

The vendored file is the official Apache Airflow 3.4.0 Python 3.14 constraint set:
https://raw.githubusercontent.com/apache/airflow/constraints-3.4.0/constraints-3.14.txt

It was retrieved on 2026-11-14. Its SHA-256 is recorded beside it. The root
`tool.uv.constraint-dependencies` list copies every non-comment constraint;
`scripts/backend_compat.py` verifies exact agreement and checksum before resolving.
`uv.lock` remains the only committed workspace lock. Temporary resolver outputs
are disposable evidence, not a second dependency project/lock.

Containerized uv 0.9.30 on Python 3.14.2 resolves these intended runtime selections:

- Lean API: FastAPI 0.162.0, Firebase Admin 7.7.0, Uvicorn 0.54.0 and shared dependencies.
- Combined API/ETL: the same plus Airflow 3.4.0 and PySpark 4.3.0.

Firebase Admin 7.8.0 failed resolution because it requires `google-api-core>=2.44`
while this Airflow set pins 2.43.2. Version 7.7.0 supports the constrained version
and resolves, so no workspace split or constraint override is needed. Other shared
pins intentionally follow Airflow: SQLAlchemy 2.0.55, Pydantic 2.14.2, Settings
2.16.2 and psycopg 3.3.6. These are compatibility choices, not latest-version claims.

B1 installs the actual shared package and development tools only. B2 introduces
the real API member; B3 introduces the real ETL member and Java/Spark runtime.
Future images use `uv sync --frozen --package <member> --no-dev` and separate
selections, keeping ETL packages out of the API runtime. The probe proves dependency
resolution and lean selection, not Java/Spark execution or real Firebase auth.

Run `make backend-compat` inside the guarded workspace. Update constraints, their
checksum, copied project constraints and lock together when deliberately upgrading.

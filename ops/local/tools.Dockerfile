# Local app-stack ETL runtime: the lca-etl package (B3/B4 lca-import, migrations,
# seed loader) from the frozen workspace lock. Never the lean API image.
# Spark's JVM is omitted: promotion/publication/migrations never start Spark.
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1 AS build
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY packages/python/lca_shared ./packages/python/lca_shared
COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
COPY data_pipeline/pyproject.toml ./data_pipeline/pyproject.toml
COPY data_pipeline/src ./data_pipeline/src
RUN uv sync --frozen --no-dev --package lca-etl --no-editable \
    && .venv/bin/python -c "import alembic, lca_etl.publication, lca_etl.seed; import importlib.util; assert not importlib.util.find_spec('lca_api')"
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1
COPY --from=build /app/.venv /app/.venv
COPY alembic.ini /app/alembic.ini
COPY db/migrations /app/db/migrations
COPY data_pipeline/seed/artifact /app/seed/artifact
COPY ops/local/target.json ops/local/local_stack.py /app/ops/
ENV PATH=/app/.venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
USER 65532:65532
CMD ["python", "-c", "print('Select an explicit app-stack task command.')"]

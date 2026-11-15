FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1 AS build
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY packages/python/lca_shared ./packages/python/lca_shared
COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
COPY apps/api/src ./apps/api/src
RUN uv sync --frozen --no-dev --package lca-api --no-editable \
    && .venv/bin/python -c "import importlib.util; assert not importlib.util.find_spec('pyspark'); assert not importlib.util.find_spec('airflow')"
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1
COPY --from=build /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
USER 65532:65532
CMD ["uvicorn", "lca_api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]

.PHONY: help dev-build dev-up dev-shell dev-check dev-down dev-logs
.PHONY: format lint typecheck test test-unit test-e2e frontend-build
.PHONY: backend-format backend-format-check backend-lint backend-typecheck backend-test-unit backend-test-integration backend-migrate backend-compat test-integration

backend-format backend-format-check backend-lint backend-typecheck backend-test-unit backend-test-integration backend-migrate backend-compat:
	@test "$${LCA_DEV_CONTAINER:-}" = 1 || { echo 'Run this target inside ./dev shell.' >&2; exit 1; }
	@case "$@" in \
	  backend-format) uv run --frozen ruff format packages/python db/migrations scripts/backend_compat.py ;; \
	  backend-format-check) uv run --frozen ruff format --check packages/python db/migrations scripts/backend_compat.py ;; \
	  backend-lint) uv run --frozen ruff check packages/python db/migrations scripts/backend_compat.py ;; \
	  backend-typecheck) uv run --frozen mypy ;; \
	  backend-test-unit) uv run --frozen pytest -m unit ;; \
	  backend-test-integration) uv run --frozen pytest -m integration ;; \
	  backend-migrate) uv run --frozen alembic upgrade head ;; \
	  backend-compat) uv run --frozen python scripts/backend_compat.py ;; \
	esac

test-integration: backend-test-integration

# Development tools run only inside the workspace; host callers use ./dev shell.
format lint typecheck test test-unit test-e2e frontend-build:
	@test "$${LCA_DEV_CONTAINER:-}" = 1 || { echo 'Run this target inside ./dev shell.' >&2; exit 1; }
	@case "$@" in \
	  format) npm --prefix apps/frontend run format ;; \
	  lint|typecheck) npm --prefix apps/frontend run $@ ;; \
	  test|test-unit) npm --prefix apps/frontend run test:unit ;; \
	  test-e2e) npm --prefix apps/frontend run test:e2e ;; \
	  frontend-build) npm --prefix apps/frontend run build ;; \
	esac

help:
	@echo 'Container lifecycle (on the Docker host):'
	@echo '  make dev-build / dev-up / dev-shell / dev-down / dev-logs'
	@echo 'Environment verification (host or container): make dev-check'
	@echo 'Without host Make, use ./dev help; do not install Make on the host.'
	@echo 'Inside container: format / lint / typecheck / test / test-unit / test-e2e / frontend-build'
	@echo 'Backend/import/integration targets arrive with their components.'

dev-build:
	@./dev build

dev-up:
	@./dev up

dev-shell:
	@./dev shell

dev-down:
	@./dev down

dev-logs:
	@./dev logs

dev-check:
	@if [ "$${LCA_DEV_CONTAINER:-}" = 1 ]; then bash .devcontainer/check-env.sh; else ./dev check; fi

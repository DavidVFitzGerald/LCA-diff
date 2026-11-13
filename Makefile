.PHONY: help dev-build dev-up dev-shell dev-check dev-down dev-logs

help:
	@echo 'Container lifecycle (on the Docker host):'
	@echo '  make dev-build / dev-up / dev-shell / dev-down / dev-logs'
	@echo 'Environment verification (host or container): make dev-check'
	@echo 'Without host Make, use ./dev help; do not install Make on the host.'
	@echo 'Application test/import/quality targets arrive with their components.'

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

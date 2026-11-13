#!/usr/bin/env bash
# Smoke check the actual container, configuration, and bind-mount permissions.
set -euo pipefail
if [[ "${LCA_DEV_CONTAINER:-}" != 1 || ! -f /.dockerenv ]]; then
    echo 'Environment checks must run inside the dev container.' >&2
    exit 1
fi
if [[ "$(id -u)" == 0 ]]; then
    echo 'Development must use the non-root workspace user.' >&2
    exit 1
fi
cd /workspaces/lca-diff
node --version
npm --version
python --version
uv --version
git --version
make --version | head -n 1
rg --version | head -n 1
python - <<'PY'
import json
import pathlib
import sys
import tomllib

assert sys.version_info[:2] == (3, 14), sys.version
root = pathlib.Path.cwd()
config = json.loads((root / '.devcontainer/devcontainer.json').read_text())
assert config['service'] == 'workspace'
assert config['remoteUser'] == 'vscode'
project = tomllib.loads((root / 'pyproject.toml').read_text())
assert isinstance(project['tool']['uv']['workspace']['members'], list)
print('Dev Container JSON and bootstrap workspace TOML: valid')
PY
node -e 'if (process.versions.node.split(".")[0] !== "24") process.exit(1)'
probe="$(mktemp .lca-dev-writecheck.XXXXXX)"
trap 'rm -f -- "$probe"' EXIT
printf 'workspace write check\n' > "$probe"
[[ "$(stat -c %u "$probe")" == "$(id -u)" ]]
uv lock --check
uv sync --frozen
printf 'PASS: non-root toolchain, configuration, frozen lock and workspace write checks.\n'
printf 'No application tests exist yet; this is environment verification only.\n'

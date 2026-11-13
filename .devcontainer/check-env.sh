#!/usr/bin/env bash
# Verify rootless identity before writing to the host checkout.
set -euo pipefail
if [[ "$(umask)" != 0022 ]]; then
    echo 'Workspace Bash must apply umask 022 before creating project files.' >&2
    exit 1
fi
if [[ "${LCA_DEV_CONTAINER:-}" != 1 || ! -f /.dockerenv ]]; then
    echo 'Environment checks must run inside the dev container.' >&2
    exit 1
fi
cd /workspaces/lca-diff
python - <<'PY'
import json
import os
import pathlib
import sys
import tomllib

root = pathlib.Path.cwd()
for kind in ('uid', 'gid'):
    mappings = [tuple(map(int, row.split())) for row in pathlib.Path(f'/proc/self/{kind}_map').read_text().splitlines()]
    zero_mapping = next((row for row in mappings if row[0] == 0), None)
    if zero_mapping is None or zero_mapping[1] == 0 or zero_mapping[2] != 1:
        sys.exit(f'Refusing workspace writes: {kind} 0 is not mapped to a single unprivileged daemon owner: {mappings}')
    print(f'Namespace {kind} 0 maps to unprivileged parent {kind} {zero_mapping[1]}')
if os.getuid() != 0 or os.getgid() != 0:
    sys.exit('The rootless workspace must use namespace UID/GID 0 to preserve bind-mount ownership.')
status = dict(line.split(':', 1) for line in pathlib.Path('/proc/self/status').read_text().splitlines() if ':' in line)
if int(status['CapEff'].strip(), 16) != 0 or status['NoNewPrivs'].strip() != '1':
    sys.exit('Workspace must drop all capabilities and enable no-new-privileges.')
assert sys.version_info[:2] == (3, 14), sys.version
config = json.loads((root / '.devcontainer/devcontainer.json').read_text())
assert config['service'] == 'workspace'
assert config['remoteUser'] == 'root' and config['updateRemoteUserUID'] is False
project = tomllib.loads((root / 'pyproject.toml').read_text())
assert isinstance(project['tool']['uv']['workspace']['members'], list)
print('Rootless identity, capability restrictions, Dev Container JSON and workspace TOML: valid')
PY
node --version
npm --version
python --version
uv --version
git --version
make --version | head -n 1
rg --version | head -n 1
node -e 'if (process.versions.node.split(".")[0] !== "24") process.exit(1)'
probe_dir="$(mktemp -d .lca-dev-writecheck.XXXXXX)"
trap 'rm -f -- "$probe_dir/file"; rmdir -- "$probe_dir"' EXIT
printf 'workspace write check\n' > "$probe_dir/file"
[[ "$(stat -c %u "$probe_dir/file")" == 0 ]]
[[ "$(stat -c %a "$probe_dir/file")" == 644 ]]
bash .devcontainer/test-preflight.sh
uv lock --check
uv sync --frozen
printf 'PASS: rootless host identity, restricted capabilities, toolchain, frozen lock and workspace writes.\n'
printf 'No application tests exist yet; this is environment verification only.\n'

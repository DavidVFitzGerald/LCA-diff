#!/usr/bin/env bash
# Security-boundary regression checks; run only inside the dev workspace.
set -euo pipefail
if [[ "${LCA_DEV_CONTAINER:-}" != 1 || ! -f /.dockerenv ]]; then
    echo 'Run preflight regression checks inside the dev container.' >&2
    exit 1
fi
cd /workspaces/lca-diff
python - <<'PY'
import json
import os
import pathlib
import subprocess
import tempfile

root = pathlib.Path.cwd()
with tempfile.TemporaryDirectory(prefix='lca-preflight-') as temporary:
    temporary = pathlib.Path(temporary)
    binaries = temporary / 'bin'
    binaries.mkdir()
    marker = temporary / 'compose-executed'
    (binaries / 'id').write_text(
        '#!/bin/sh\nprintf "%s\\n" "${FAKE_HOST_UID:-1000}"\n'
    )
    (binaries / 'docker').write_text('''#!/bin/sh
if [ "$1" = info ]; then
    case "$FAKE_DOCKER_MODE" in
        rootless) printf 'name=seccomp,profile=builtin\\nname=rootless\\n'; exit 0 ;;
        rootful) printf 'name=seccomp,profile=builtin\\nname=cgroupns\\n'; exit 0 ;;
        unreachable) echo 'simulated unreachable daemon' >&2; exit 1 ;;
    esac
fi
printf 'compose invoked\\n' > "$FAKE_COMPOSE_MARKER"
exit 0
''')
    for binary in binaries.iterdir():
        binary.chmod(0o755)
    config = json.loads((root / '.devcontainer/devcontainer.json').read_text())
    initialize = [
        arg.replace('${localWorkspaceFolder}', str(root))
        for arg in config['initializeCommand']
    ]
    commands = [
        ('CLI', ['bash', str(root / 'dev'), 'check']),
        ('VS Code initializeCommand', initialize),
    ]
    diagnostics = {
        'rootful': 'Refusing this workspace on a rootful Docker daemon.',
        'unreachable': 'Cannot access Docker.',
    }
    for name, command in commands:
        for mode in ('rootful', 'unreachable', 'rootless'):
            marker.unlink(missing_ok=True)
            environment = dict(
                os.environ,
                PATH=f'{binaries}:/usr/local/bin:/usr/bin:/bin',
                FAKE_DOCKER_MODE=mode,
                FAKE_COMPOSE_MARKER=str(marker),
            )
            environment.pop('LCA_DEV_CONTAINER', None)
            result = subprocess.run(
                command, env=environment, cwd=root, text=True, capture_output=True
            )
            assert result.returncode == (0 if mode == 'rootless' else 1), (
                name, mode, result.returncode, result.stderr
            )
            if mode != 'rootless':
                assert diagnostics[mode] in result.stderr, (name, mode, result.stderr)
                assert not marker.exists(), (name, mode, 'compose ran after rejection')
            else:
                assert marker.exists() == (name == 'CLI'), (name, 'forwarding mismatch')
            print(f'PASS {name}: {mode}; compose_executed={marker.exists()}')
        marker.unlink(missing_ok=True)
        environment['FAKE_HOST_UID'] = '0'
        result = subprocess.run(
            command, env=environment, cwd=root, text=True, capture_output=True
        )
        assert result.returncode == 1 and not marker.exists(), (name, result.stderr)
        assert 'Use an unprivileged host account' in result.stderr, (name, result.stderr)
        print(f'PASS {name}: host-root invocation refused')
print('8 preflight regression scenarios passed; host contexts were not changed.')
PY

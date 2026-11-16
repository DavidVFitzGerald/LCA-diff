#!/usr/bin/env bash
# Security/portability regression checks; fake Docker never changes host contexts.
set -euo pipefail
if [[ "${LCA_DEV_CONTAINER:-}" != 1 || ! -f /.dockerenv ]]; then
    echo 'Run preflight regression checks inside the dev container.' >&2
    exit 1
fi
cd "$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - <<'PY'
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
    if [ "$FAKE_DOCKER_MODE" = unreachable ]; then
        echo 'simulated unreachable daemon' >&2; exit 1
    fi
    if [ "$3" = '{{.OSType}}' ]; then
        if [ "$FAKE_DOCKER_MODE" = windows ]; then printf 'windows\\n'; else printf 'linux\\n'; fi
    else
        case "$FAKE_DOCKER_MODE" in
            rootless) printf 'name=seccomp,profile=builtin\\nname=rootless\\n' ;;
            *) printf 'name=seccomp,profile=builtin\\nname=cgroupns\\n' ;;
        esac
    fi
    exit 0
fi
if [ "$1" = compose ] && [ "$2" = version ]; then
    [ "${FAKE_COMPOSE_MODE:-present}" != missing ]; exit $?
fi
printf 'compose invoked\\n' > "$FAKE_COMPOSE_MARKER"
exit 0
''')
    for binary in binaries.iterdir():
        binary.chmod(0o755)
    config = json.loads((root / '.devcontainer/devcontainer.json').read_text())
    initialize = [arg.replace('${localWorkspaceFolder}', str(root)) for arg in config['initializeCommand']]
    base = dict(os.environ, PATH=f'{binaries}:/usr/local/bin:/usr/bin:/bin', FAKE_COMPOSE_MARKER=str(marker))
    for key in ('LCA_DEV_CONTAINER', 'LCA_APP_PROJECT', 'COMPOSE_PROJECT_NAME',
                'LCA_APP_FRONTEND_PORT', 'LCA_APP_API_PORT', 'LCA_APP_AUTH_PORT'):
        base.pop(key, None)
    checks = 0
    for name, command in [('Workspace CLI', ['bash', str(root / 'dev'), 'check']),
                          ('VS Code initializeCommand', initialize)]:
        for mode, uid, diagnostic in [('rootless', '1000', None),
                                      ('rootful', '1000', 'Refusing this workspace'),
                                      ('unreachable', '1000', 'Cannot access Docker.'),
                                      ('rootless', '0', 'Use an unprivileged host account')]:
            marker.unlink(missing_ok=True)
            result = subprocess.run(command, env=base | {'FAKE_DOCKER_MODE': mode, 'FAKE_HOST_UID': uid},
                                    cwd=root, text=True, capture_output=True)
            assert result.returncode == (1 if diagnostic else 0), (name, mode, uid, result.stderr)
            assert marker.exists() == (diagnostic is None and name == 'Workspace CLI')
            if diagnostic:
                assert diagnostic in result.stderr, (name, mode, result.stderr)
            checks += 1
            print(f'PASS {name}: {mode}, host_uid={uid}')
    for mode, compose, diagnostic in [('rootless', 'present', None),
                                      ('rootful', 'present', None),
                                      ('unreachable', 'present', 'Cannot access Docker.'),
                                      ('windows', 'present', 'requires Linux containers'),
                                      ('rootful', 'missing', 'Docker Compose is required')]:
        marker.unlink(missing_ok=True)
        result = subprocess.run(['bash', str(root / 'dev'), 'app-status'],
                                env=base | {'FAKE_DOCKER_MODE': mode, 'FAKE_COMPOSE_MODE': compose},
                                cwd=root, text=True, capture_output=True)
        assert result.returncode == (1 if diagnostic else 0), (mode, compose, result.stderr)
        assert marker.exists() == (diagnostic is None), (mode, compose, 'startup after rejection')
        if diagnostic:
            assert diagnostic in result.stderr, (mode, compose, result.stderr)
        checks += 1
        print(f'PASS Application CLI: {mode}, compose={compose}')
    print(f'{checks} preflight regression scenarios passed; host contexts were not changed.')
PY

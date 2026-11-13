#!/usr/bin/env bash
# Host-side preflight: namespace-root workspace commands require a rootless daemon.
set -euo pipefail
if [[ "$(id -u)" == 0 ]]; then
    echo 'Use an unprivileged host account with its rootless Docker daemon.' >&2
    exit 1
fi
if ! security_options="$(docker info --format '{{range .SecurityOptions}}{{println .}}{{end}}')"; then
    echo 'Cannot access Docker. Select your configured rootless context and retry.' >&2
    exit 1
fi
case $'\n'"$security_options"$'\n' in
    *$'\nname=rootless\n'*) ;;
    *)
        echo 'Refusing this workspace on a rootful Docker daemon. Select a rootless Docker context.' >&2
        exit 1 ;;
esac

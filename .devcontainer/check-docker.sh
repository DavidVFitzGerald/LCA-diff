#!/usr/bin/env bash
# App runtime needs Linux containers; the writable development workspace also
# requires the rootless daemon/identity boundary defined by ADR 0003.
set -euo pipefail
case "${1:-}" in
    --app)
        if ! container_os="$(docker info --format '{{.OSType}}')"; then
            echo 'Cannot access Docker. Start Docker Engine or Docker Desktop and retry.' >&2
            exit 1
        fi
        if [[ "$container_os" != linux ]]; then
            echo 'The app requires Linux containers. Switch Docker Desktop to Linux containers.' >&2
            exit 1
        fi
        if ! docker compose version >/dev/null; then
            echo 'Docker Compose is required to run the application.' >&2
            exit 1
        fi
        exit 0 ;;
    '') ;;
    *) echo 'Usage: check-docker.sh [--app]' >&2; exit 2 ;;
esac
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

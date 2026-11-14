#!/usr/bin/env bash
# Shared development/CI install; never install browsers or OS packages on the host.
set -euo pipefail
if [[ ! -f /.dockerenv && "${LCA_BROWSER_IMAGE_BUILD:-}" != 1 ]]; then
    echo 'Browser installation must run inside the development/test container.' >&2
    exit 1
fi
playwright_cli="${1:-apps/frontend/node_modules/.bin/playwright}"
if [[ ! -x "$playwright_cli" ]]; then
    echo 'Install the committed frontend lock before installing its matching browsers.' >&2
    exit 1
fi
debian_snapshot="${DEBIAN_SNAPSHOT:-20261112T000000Z}"
[[ "$debian_snapshot" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
# Pin browser OS dependencies to the same snapshot as the development image.
rm -f /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources
printf 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/%s/ bookworm main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian/%s/ bookworm-updates main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/%s/ bookworm-security main\n' \
    "$debian_snapshot" "$debian_snapshot" "$debian_snapshot" > /etc/apt/sources.list
"$playwright_cli" install --with-deps chromium firefox
rm -rf /var/lib/apt/lists/*

# Resolve tags intentionally, then update these immutable multi-platform digests.
FROM node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496 AS node
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1

# Keep OS packages reproducible as well as the base images.
ARG DEBIAN_SNAPSHOT=20261112T000000Z
RUN rm -f /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources \
    && printf 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/%s/ bookworm main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian/%s/ bookworm-updates main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/%s/ bookworm-security main\n' \
       "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates curl git make openssh-client ripgrep \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

ARG LOCAL_UID=1000
ARG LOCAL_GID=1000
RUN groupadd --gid "$LOCAL_GID" vscode \
    && useradd --uid "$LOCAL_UID" --gid "$LOCAL_GID" --create-home --shell /bin/bash vscode \
    && mkdir -p /workspaces/lca-diff \
    && chown vscode:vscode /workspaces/lca-diff

ENV LCA_DEV_CONTAINER=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /workspaces/lca-diff
USER vscode
RUN git config --global --add safe.directory /workspaces/lca-diff
CMD ["sleep", "infinity"]
